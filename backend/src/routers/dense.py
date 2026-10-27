import os
import shutil
from openai import OpenAI
from dotenv import load_dotenv
from typing_extensions import Annotated
from fastapi import Depends, Request
from pymongo.database import Database
import asyncio
import numpy as np
import faiss
import math
import pickle
import hashlib
from bson import ObjectId

_FAISS_ID_MASK = 0x7FFFFFFFFFFFFFFF


def faiss_id_for(food_id) -> int:
    """
    Deterministic FAISS int64 ID for a food.
    USDA foods use their integer ID; custom foods (ObjectId / hex string) use a
    stable sha256-derived ID. Python's built-in hash() is randomized per process
    (PYTHONHASHSEED), so IDs persisted in the .bin file would not match after a restart.
    """
    if isinstance(food_id, (ObjectId, str)):
        s = str(food_id).strip()
        if s.isdigit():
            return int(s)
        return int.from_bytes(hashlib.sha256(s.encode()).digest()[:8], "big") & _FAISS_ID_MASK
    return int(food_id)


def _legacy_faiss_id_for(food_id):
    """Process-local hash() ID still used by incremental adds in foods.py."""
    if isinstance(food_id, (ObjectId, str)) and not str(food_id).strip().isdigit():
        return hash(str(food_id)) & _FAISS_ID_MASK
    return None

# Module-level index cache — populated at startup and on first use.
# Keyed by index_attr / list_attr so it works for both food and nutrient indexes.
# This is the primary cache when request=None (e.g. background tasks).
_index_cache: dict = {}
_id_list_cache: dict = {}

# GPU support for FAISS
_gpu_resources = None
_use_gpu = False

def _init_gpu_resources():
    """Initialize GPU resources for FAISS if available."""
    global _gpu_resources, _use_gpu
    if _gpu_resources is not None:
        return _gpu_resources, _use_gpu

    try:
        import torch
        if torch.cuda.is_available():
            # Initialize GPU resources
            _gpu_resources = faiss.StandardGpuResources()
            _use_gpu = True
            print(f"✓ FAISS GPU acceleration enabled on {torch.cuda.get_device_name(0)}")
            return _gpu_resources, _use_gpu
    except (ImportError, AttributeError, RuntimeError) as e:
        print(f"⚠ FAISS GPU not available, using CPU: {e}")

    _use_gpu = False
    return None, False

# When running as a module within the application, use relative imports
try:
    from ..databases.mongo import get_data
    from ..routers.foods import food_embedding_map, get_foods_list, food_name_map
    from ..routers.auth import get_current_user
    from ..routers.parallel import parallel_process
    from ..routers.sparse import filter_foods_for_user

# When running this file directly, use absolute imports
except ImportError:
    import sys
    import os
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    from src.databases.mongo import get_data
    from src.routers.foods import food_embedding_map, get_foods_list, food_name_map
    from src.routers.auth import get_current_user
    from src.routers.parallel import parallel_process
    from src.routers.sparse import filter_foods_for_user


db = Annotated[Database, Depends(get_data)]
user = Annotated[dict, Depends(get_current_user)]

# Load environment variables
load_dotenv()

# Lazy OpenAI client initialization
_client = None

def _get_client():
    """Get OpenAI client, initializing if needed"""
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        _client = OpenAI(api_key=api_key)
    return _client

# Define the structured output response format
response_format = { "type": "json_object" }


async def update_foods_list(db=None, user=None, request: Request = None):
    if db is None or user is None:
        from pymongo import MongoClient
        mongo_uri = os.getenv("MONGO_URI")
        db_name = os.getenv("DB_NAME", "nutramapper")
        mongo_client = MongoClient(mongo_uri)
        db = mongo_client[db_name]
        user = {"_id": "system"}

    id_name_map = await get_foods_list(db, user)
    
    # save list to cache
    with open(os.getenv("FOOD_ID_CACHE"), "wb") as f:
        pickle.dump(id_name_map, f)
            
    # update app state
    if request is not None:
        request.app.state.id_name_map = id_name_map
        
    return id_name_map
    
def remove_from_faiss_index(food_id, request: Request = None):
    """
    Remove a single food from the FAISS index by its ID.
    Works for both USDA foods (int IDs) and custom foods (string ObjectIds).
    """
    try:
        # Get paths from environment
        faiss_bin_path = os.getenv("FAISS_BIN", "./faiss_index.bin")
        food_id_cache_path = os.getenv("FOOD_ID_CACHE", "./food_ids.pkl")

        # Load the current FAISS index (same in-memory object used by searches)
        index = _load_faiss_index(request, 'faiss_index', 'FAISS_BIN', faiss_bin_path, 'food')
        id_list = _load_id_list(request, 'id_list', 'FOOD_ID_CACHE', food_id_cache_path, 'food') or []
        if index is None:
            print(f"⚠ FAISS index not found: {faiss_bin_path}")
            return False

        # Check if index supports removal (IndexIDMap)
        if not isinstance(index, faiss.IndexIDMap):
            print(f"⚠ FAISS index doesn't support removal (type: {type(index).__name__})")
            print("  You'll need to rebuild the index instead")
            return False

        # Convert food_id to the ID(s) used in FAISS (deterministic + legacy hash())
        faiss_ids = [faiss_id_for(food_id)]
        legacy_id = _legacy_faiss_id_for(food_id)
        if legacy_id is not None:
            faiss_ids.append(legacy_id)

        # Remove from FAISS index
        ids_to_remove = np.array(faiss_ids, dtype=np.int64)
        removed_count = index.remove_ids(ids_to_remove)

        if removed_count > 0:
            print(f"✓ Removed food_id {food_id} from FAISS index")

            # id_list / pickle may hold the ID as int, str or ObjectId
            key_variants = {food_id, str(food_id)}
            if isinstance(food_id, str) and ObjectId.is_valid(food_id):
                key_variants.add(ObjectId(food_id))

            # Update id_list (in place, shared with module cache / app state)
            for key in key_variants:
                while key in id_list:
                    id_list.remove(key)

            # Update pickle cache
            if food_id_cache_path and os.path.exists(food_id_cache_path):
                with open(food_id_cache_path, "rb") as f:
                    id_name_map = pickle.load(f)
                for key in key_variants:
                    id_name_map.pop(key, None)
                with open(food_id_cache_path, "wb") as f:
                    pickle.dump(id_name_map, f)
                print(f"✓ Updated food ID cache")

            # Save updated index to disk
            faiss.write_index(index, faiss_bin_path)
            print(f"✓ Updated FAISS .bin file")

            return True
        else:
            print(f"⚠ Food ID {food_id} not found in FAISS index")
            return False

    except Exception as e:
        print(f"Error removing from FAISS index: {e}")
        import traceback
        traceback.print_exc()
        return False


async def update_faiss_index(db=None, user=None, request: Request = None):
    print("Updating FAISS indexes...")

    if db is None or user is None:
        from pymongo import MongoClient
        mongo_uri = os.getenv("MONGO_URI")
        db_name = os.getenv("DB_NAME", "nutramapper")
        mongo_client = MongoClient(mongo_uri)
        db = mongo_client[db_name]
        user = {"_id": "system"}

    try:
        pq = False

        # ========================================
        # BUILD FOODS INDEX
        # ========================================
        print("\n" + "="*50)
        print("Building FAISS index for foods...")
        print("="*50)

        # Index every food that has an embedding (USDA + all users' custom foods).
        # Per-user scoping is applied at search time, so a rebuild triggered by one
        # user (or by the system) must not drop other users' custom foods. Foods
        # without an embedding are skipped instead of raising KeyError.
        embedding_id_map = {
            food["_id"]: food["embedding"]
            for food in db.foods.find(
                {"embedding": {"$exists": True, "$ne": None}},
                {"_id": 1, "embedding": 1}
            ).sort("_id", 1)
            if food.get("embedding")
        }

        if not embedding_id_map:
            print("No food embeddings found in database")
            return None, None

        print(f"Found {len(embedding_id_map)} food embeddings for FAISS index")

        # CRITICAL: Build embeddings list and id_list in the SAME order
        # Use embedding_id_map.keys() to ensure perfect alignment
        food_ids = list(embedding_id_map.keys())
        embeddings = [embedding_id_map[food_id] for food_id in food_ids]

        # Build id_name_map with the SAME food IDs and order
        id_name_map = {}
        for food_id in food_ids:
            # Query MongoDB for the food name
            food_doc = db.foods.find_one({"_id": food_id}, {"food_name": 1})
            if food_doc:
                id_name_map[food_id] = {"name": food_doc["food_name"]}
            else:
                print(f"⚠ Warning: Food ID {food_id} not found in database")
                id_name_map[food_id] = {"name": f"Unknown food ({food_id})"}

        # Save the correctly ordered id_name_map to pickle cache
        food_id_cache_path = os.getenv("FOOD_ID_CACHE")
        with open(food_id_cache_path, "wb") as f:
            pickle.dump(id_name_map, f)
        print(f"✓ Saved food ID cache with {len(id_name_map)} entries")

        # Update app state
        if request is not None:
            request.app.state.id_name_map = id_name_map
            request.app.state.id_list = food_ids  # Save the ordered list too
            print(f"✓ Stored id_list in app.state ({len(food_ids)} entries)")

        # Convert list of embeddings to numpy array with proper dtype
        embedding_matrix = np.array(embeddings, dtype=np.float32)

        # Check if we have any embeddings
        if embedding_matrix.size == 0:
            print("No embeddings provided to create index")
            return None, None

        # Make sure the matrix is 2D
        if len(embedding_matrix.shape) == 1:
            # If we have a single embedding, reshape to 2D
            embedding_matrix = embedding_matrix.reshape(1, -1)

        # Normalize vectors to use cosine similarity
        faiss.normalize_L2(embedding_matrix)
        dim = embedding_matrix.shape[1]

        # Initialize GPU resources if available
        gpu_resources, use_gpu = _init_gpu_resources()

        # product quantizers have to be trained our data. we're not using it bc our data is too small, leading to suboptimal results
        if pq:
            nlist = min(int(4 * math.sqrt(len(embeddings))), 100)  # number of clusters
            m = 4  # number of subquantizers
            bits = 8  # bits per subquantizer

            # use IndexFlatL2 for euclidean distance, IndexFlatIP for cosine similarity
            quantizer = faiss.IndexFlatIP(dim)
            index = faiss.IndexIVFPQ(quantizer, dim, nlist, m, bits)

            # Train the index
            index.train(embedding_matrix)

            # Move to GPU if available
            if use_gpu and gpu_resources:
                index = faiss.index_cpu_to_gpu(gpu_resources, 0, index)
                print("✓ FAISS PQ index moved to GPU")
        else:
            # Use IndexIDMap to enable removal of individual vectors
            base_index = faiss.IndexFlatIP(dim)

            # Move base index to GPU if available
            if use_gpu and gpu_resources:
                base_index = faiss.index_cpu_to_gpu(gpu_resources, 0, base_index)
                print("✓ FAISS base index moved to GPU")

            index = faiss.IndexIDMap(base_index)

        # Add vectors to the index with IDs
        # Convert food_ids to numpy array of int64
        # For custom foods (ObjectId), use hash as ID
        ids = [faiss_id_for(food_id) for food_id in food_ids]

        ids_array = np.array(ids, dtype=np.int64)
        index.add_with_ids(embedding_matrix, ids_array)

        # update bin
        faiss.write_index(index, "faiss_index_update.bin")

        # Move to final location (handles cross-filesystem moves)
        old_bin_path = os.getenv("FAISS_BIN")
        shutil.move("faiss_index_update.bin", old_bin_path)

        if request is not None:
            request.app.state.faiss_index = index
            print(f"✓ Stored foods FAISS index in app.state ({index.ntotal} vectors)")
        # Keep module cache in sync so background searches (request=None) see the rebuild
        _index_cache['faiss_index'] = index
        _id_list_cache['id_list'] = food_ids

        print(f"✓ Finished building FAISS index for foods ({index.ntotal} vectors)")

        # ========================================
        # BUILD NUTRIENTS INDEX
        # ========================================
        print("\n" + "="*50)
        print("Building FAISS index for nutrients...")
        print("="*50)

        # Get all nutrients with embeddings from MongoDB
        # Exclude kJ Energy (ID: 1062) - we only want kcal Energy (ID: 1008)
        nutrients = list(db.nutrients.find(
            {"embedding": {"$exists": True}, "_id": {"$ne": 1062}},
            {"_id": 1, "nutrient_name": 1, "embedding": 1}
        ).sort("_id", 1))

        if not nutrients:
            print("No nutrient embeddings found in database")
        else:
            # Build nutrient embedding matrix and id list
            nutrient_embeddings = []
            nutrient_id_list = []
            nutrient_id_name_map = {}

            for nutrient in nutrients:
                nutrient_embeddings.append(nutrient["embedding"])
                nutrient_id = str(nutrient["_id"])
                nutrient_id_list.append(nutrient_id)
                nutrient_id_name_map[nutrient_id] = {"name": nutrient["nutrient_name"]}

            print(f"Found {len(nutrient_embeddings)} nutrient embeddings")

            # Convert to numpy array
            nutrient_embedding_matrix = np.array(nutrient_embeddings, dtype=np.float32)

            # Make sure the matrix is 2D
            if len(nutrient_embedding_matrix.shape) == 1:
                nutrient_embedding_matrix = nutrient_embedding_matrix.reshape(1, -1)

            # Normalize vectors
            faiss.normalize_L2(nutrient_embedding_matrix)
            nutrient_dim = nutrient_embedding_matrix.shape[1]

            # Create nutrient index (using same settings as foods)
            nutrient_index = faiss.IndexFlatIP(nutrient_dim)

            # Move to GPU if available
            if use_gpu and gpu_resources:
                nutrient_index = faiss.index_cpu_to_gpu(gpu_resources, 0, nutrient_index)
                print("✓ Nutrient FAISS index moved to GPU")

            nutrient_index.add(nutrient_embedding_matrix)

            # Save nutrient index to separate bin file
            nutrient_bin_path = os.getenv("NUTRIENT_FAISS_BIN", "./nutrient_faiss_index.bin")
            faiss.write_index(nutrient_index, nutrient_bin_path)
            print(f"✓ Saved nutrient FAISS index to {nutrient_bin_path}")

            # Save nutrient id list to pickle file
            nutrient_cache_path = os.getenv("NUTRIENT_ID_CACHE", "./nutrient_ids.pkl")
            with open(nutrient_cache_path, "wb") as f:
                pickle.dump(nutrient_id_name_map, f)
            print(f"✓ Saved nutrient ID cache to {nutrient_cache_path}")

            # Store in app state
            if request is not None:
                request.app.state.nutrient_faiss_index = nutrient_index
                request.app.state.nutrient_id_list = nutrient_id_list
                print(f"✓ Stored nutrient FAISS index in app.state ({nutrient_index.ntotal} vectors)")
            _index_cache['nutrient_faiss_index'] = nutrient_index
            _id_list_cache['nutrient_id_list'] = nutrient_id_list

            print(f"✓ Finished building FAISS index for nutrients ({nutrient_index.ntotal} vectors)")

        # Commit changes to Modal volume (if running on Modal)
        try:
            # Check if FAISS_BIN path starts with /data/ (indicates Modal deployment)
            faiss_bin_path = os.getenv("FAISS_BIN", "")
            if faiss_bin_path.startswith("/data/"):
                print("Attempting to commit changes to Modal persistent volume...")
                import modal
                volume = modal.Volume.from_name("nutramap-indexes")
                volume.commit()
                print("✓ Committed FAISS indexes to persistent volume")
            else:
                print("Local deployment detected - skipping volume commit")
        except ImportError:
            print("Modal not available - skipping volume commit")
        except Exception as e:
            print(f"⚠ Failed to commit to volume: {e}")
            import traceback
            traceback.print_exc()

        return index, id_name_map.keys()

    except Exception as e:
        print(f"Error updating FAISS indexes: {e}")
        import traceback
        traceback.print_exc()
        return None, None

async def embed_query(text: str):
    client = _get_client()
    response = client.embeddings.create(
        model="text-embedding-3-large",
        input=text
    )
    embedding = np.array(response.data[0].embedding, dtype=np.float32)
    
    # Normalize the query embedding
    embedding = embedding.reshape(1, -1)  # Ensure it's 2D
    faiss.normalize_L2(embedding)
    return embedding


async def find_and_print_matches(text: str, db, user):
    try:
        top_matches = await find_dense_matches(text, db, user, None, 40, 20)
        
        food_names = await food_name_map(None, db, user)
        print("Top matches:")
        for food_id, similarity_score in top_matches.items():
            food_name = food_names.get(food_id, "Unknown Food")
            print(f"{food_name} - {similarity_score:.4f}")
        
    except Exception as e:
        print(f"Error in find_and_print_matches: {e}")
        import traceback
        traceback.print_exc()
    
def _load_faiss_index(request: Request, index_attr: str, bin_env_var: str, bin_default: str, entity_type: str):
    """
    Helper function to load FAISS index from module cache, app state, or bin file.

    Args:
        request: FastAPI request object (may be None for background tasks)
        index_attr: Attribute name in app.state (e.g., 'faiss_index', 'nutrient_faiss_index')
        bin_env_var: Environment variable name for bin path
        bin_default: Default bin file path
        entity_type: Type of entity for logging (e.g., 'food', 'nutrient')

    Returns:
        Loaded FAISS index or None
    """
    # App state is authoritative when available (incremental adds/rebuilds update it)
    if request is not None and getattr(request.app.state, index_attr, None) is not None:
        index = getattr(request.app.state, index_attr)
        _index_cache[index_attr] = index  # keep module cache in sync
        return index

    # Module-level cache — avoids disk I/O when request is None (background tasks)
    if index_attr in _index_cache:
        return _index_cache[index_attr]

    # Last resort: load from bin file (blocks event loop — only happens once)
    bin_path = os.getenv(bin_env_var, bin_default)
    if os.path.exists(bin_path) and os.path.getsize(bin_path) > 0:
        index = faiss.read_index(bin_path)
        print(f"⚠ Loaded {entity_type} FAISS index from bin file ({index.ntotal} vectors)")
        if request is not None:
            setattr(request.app.state, index_attr, index)
        _index_cache[index_attr] = index  # populate module cache
        return index

    print(f"⚠ No {entity_type} FAISS index found")
    return None


def _load_id_list(request: Request, list_attr: str, cache_env_var: str, cache_default: str, entity_type: str):
    """
    Helper function to load ID list from module cache, app state, or pickle cache.

    Args:
        request: FastAPI request object (may be None for background tasks)
        list_attr: Attribute name in app.state (e.g., 'id_list', 'nutrient_id_list')
        cache_env_var: Environment variable name for cache path
        cache_default: Default cache file path
        entity_type: Type of entity for logging (e.g., 'food', 'nutrient')

    Returns:
        List of IDs or None
    """
    # App state is authoritative when available (incremental adds/rebuilds update it)
    if request is not None and getattr(request.app.state, list_attr, None) is not None:
        id_list = getattr(request.app.state, list_attr)
        _id_list_cache[list_attr] = id_list  # keep module cache in sync
        return id_list

    # Module-level cache — avoids disk I/O when request is None (background tasks)
    if list_attr in _id_list_cache:
        return _id_list_cache[list_attr]

    # Last resort: load from pickle cache (blocks event loop — only happens once)
    cache_path = os.getenv(cache_env_var, cache_default)
    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            id_name_map = pickle.load(f)
            id_list = list(id_name_map.keys())
        print(f"⚠ Loaded {entity_type}_id_list from pickle cache ({len(id_list)} entries)")
        _id_list_cache[list_attr] = id_list  # populate module cache
        return id_list

    print(f"⚠ No {entity_type} ID cache found")
    return None


async def _search_faiss_index(query_text: str, faiss_index, id_list, threshold: float, limit: int):
    """
    Helper function to perform FAISS search and process results.

    Args:
        query_text: Text to search for
        faiss_index: FAISS index to search
        id_list: List of IDs corresponding to index positions
        threshold: Minimum score threshold (0-100)
        limit: Maximum number of results

    Returns:
        Dictionary of {id: score}
    """
    # Create query embedding
    query_embedding = await embed_query(query_text)

    # Search
    k = min(limit, faiss_index.ntotal)
    if k == 0:
        print("No vectors in index, returning empty results")
        return {}

    D, I = faiss_index.search(query_embedding, k)

    # Check if we're using IndexIDMap (foods) or plain IndexFlatIP (nutrients)
    # IndexIDMap returns custom IDs, IndexFlatIP returns sequential positions
    is_id_map = hasattr(faiss_index, 'id_map') or 'IDMap' in str(type(faiss_index))

    # Build reverse mapping: FAISS ID -> food ID (for IndexIDMap only)
    # This allows O(1) lookup instead of scanning id_list for each result
    faiss_id_to_food_id = {}
    if is_id_map:
        for food_id in id_list:
            if isinstance(food_id, (str, ObjectId)) and not str(food_id).strip().isdigit():
                # Custom food - always return the string form so it merges with
                # sparse (Typesense) results, which use string IDs for custom foods
                result_food_id = str(food_id)
                faiss_id_to_food_id[faiss_id_for(food_id)] = result_food_id
                faiss_id_to_food_id[_legacy_faiss_id_for(food_id)] = result_food_id
            else:
                # USDA food - direct mapping
                faiss_id_to_food_id[int(food_id)] = int(food_id)

    # Process search results in parallel
    async def process_result(idx):
        faiss_result = int(I[0][idx])  # FAISS returns numpy int64

        # Determine the actual ID based on index type
        if is_id_map:
            # IndexIDMap: I contains the actual IDs we stored
            result_id = faiss_id_to_food_id.get(faiss_result)
        else:
            # Plain IndexFlatIP: I contains sequential positions (0, 1, 2...)
            # Use position to look up ID in id_list
            if 0 <= faiss_result < len(id_list):
                result_id = id_list[faiss_result]
            else:
                result_id = None

        if result_id is None or result_id == -1:
            return None

        # Keep result_id as is for database lookup
        similarity_score = float(D[0][idx])
        # Convert to 0-100 scale
        normalized_score = round(max(0, min(100, similarity_score * 100)))
        if normalized_score >= threshold:
            return (result_id, normalized_score)
        return None

    # Create a list of indices to process
    indices = list(range(len(I[0])))

    # Process all results in parallel
    results = await parallel_process(indices, process_result)

    # Filter out None results and convert to dictionary
    results_dict = {}
    for result in results:
        if result is not None:
            result_id, score = result
            results_dict[result_id] = score

    return results_dict


async def find_dense_nutrient_matches(text: str, db, request: Request = None, threshold: float = 70, limit: int = 50):
    """
    Search for nutrients using dense (embedding-based) search with FAISS.
    """
    # Load nutrient FAISS index
    nutrient_faiss_index = _load_faiss_index(
        request,
        'nutrient_faiss_index',
        'NUTRIENT_FAISS_BIN',
        './nutrient_faiss_index.bin',
        'nutrient'
    )
    if nutrient_faiss_index is None:
        return {}

    # Load nutrient ID list
    nutrient_id_list = _load_id_list(
        request,
        'nutrient_id_list',
        'NUTRIENT_ID_CACHE',
        './nutrient_ids.pkl',
        'nutrient'
    )
    if nutrient_id_list is None:
        return {}

    # Perform search
    return await _search_faiss_index(text, nutrient_faiss_index, nutrient_id_list, threshold, limit)


async def find_dense_matches(text: str, db, user, request: Request = None, threshold: float = 40, limit: int = 50):
    """
    Search for foods using dense (embedding-based) search with FAISS.
    """
    # Load food FAISS index
    faiss_index = _load_faiss_index(
        request,
        'faiss_index',
        'FAISS_BIN',
        './faiss_index.bin',
        'food'
    )

    # If no index found, create new one
    if faiss_index is None:
        print("⚠ No FAISS index found, creating new one...")
        faiss_index, _ = await update_faiss_index(db, user, request)
        if faiss_index is None:
            return {}

    # Load food ID list
    id_list = _load_id_list(
        request,
        'id_list',
        'FOOD_ID_CACHE',
        './food_ids.pkl',
        'food'
    )
    if id_list is None:
        return {}

    # Perform search, then drop other users' custom foods (the index is shared)
    results = await _search_faiss_index(text, faiss_index, id_list, threshold, limit)
    return filter_foods_for_user(results, db, user)

if __name__ == "__main__":
  
  import os
  import asyncio
  from pymongo import MongoClient
  from dotenv import load_dotenv
    
  # Load environment variables
  load_dotenv()
    
  # Connect to MongoDB
  mongo_uri = os.getenv("MONGO_URI")
  db_name = os.getenv("DB_NAME")
  
  mongo_client = MongoClient(mongo_uri)
  mongo_db = mongo_client[db_name]
    
  # Mock user for testing
  mock_user = {"_id": "test_user_id"}
  # Test data
  food = "butter"

  asyncio.run(find_and_print_matches(food, mongo_db, mock_user))