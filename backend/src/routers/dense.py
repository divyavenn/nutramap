import os
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

# When running as a module within the application, use relative imports
try:
    from ..databases.mongo import get_data
    from ..routers.foods import get_food_embeddings, get_id_name_map
    from ..routers.auth import get_current_user

# When running this file directly, use absolute imports
except ImportError:
    import sys
    import os
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    from src.databases.mongo import get_data
    from src.routers.foods import get_food_embeddings, get_id_name_map
    from src.routers.auth import get_current_user


db = Annotated[Database, Depends(get_data)]
user = Annotated[dict, Depends(get_current_user)]

# Load environment variables
load_dotenv()

# Initialize OpenAI client
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY environment variable is not set")

client = OpenAI(api_key=api_key)

# Define the structured output response format
response_format = { "type": "json_object" }


async def update_id_list(db=None, user=None, request: Request = None):
    if db is None or user is None:
        from pymongo import MongoClient
        mongo_uri = os.getenv("MONGO_URI")
        db_name = os.getenv("DB_NAME", "nutramapper")
        mongo_client = MongoClient(mongo_uri)
        db = mongo_client[db_name]
        user = {"_id": "system"}

    id_name_map = await get_id_name_map(db, user)
    
    # save list to cache
    with open(os.getenv("FOOD_ID_CACHE"), "wb") as f:
        pickle.dump(id_name_map, f)
            
    # update app state
    if request is not None:
        request.app.state.id_name_map = id_name_map
        
    return id_name_map
    
async def update_faiss_index(db=None, user=None, request: Request = None):
    print("Updating FAISS index...")
    
    if db is None or user is None:
        from pymongo import MongoClient
        mongo_uri = os.getenv("MONGO_URI")
        db_name = os.getenv("DB_NAME", "nutramapper")
        mongo_client = MongoClient(mongo_uri)
        db = mongo_client[db_name]
        user = {"_id": "system"}
    
    try:
        pq = False
        embedding_id_map = await get_food_embeddings(db, user)
        
        if not embedding_id_map:
            print("No embeddings found in database")
            return None, None
        
        embeddings = list(embedding_id_map.values())
        # Print some debug info
        print(f"Found {len(embeddings)} embeddings for FAISS index")
        
        id_name_map = await update_id_list(db, user, request)
        
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
        else:
            index = faiss.IndexFlatIP(dim)


        # Add vectors to the index
        index.add(embedding_matrix)
        
        # update bin 
        faiss.write_index(index, "faiss_index_update.bin")
        
        # Delete old bin file if it exists
        old_bin_path = os.getenv("FAISS_BIN")
        if os.path.exists(old_bin_path):
            os.remove(old_bin_path)
        
        # rename the update bin to the name specified in .env
        os.rename("faiss_index_update.bin", old_bin_path)
        
        #
        if request is not None:
            request.app.state.faiss_index = index
            # Verify it was stored
            print(f"Verification - Has faiss_index: {hasattr(request.app.state, 'faiss_index')}")
            if hasattr(request.app.state, 'faiss_index'):
                print(f"Verification - faiss_index is None: {request.app.state.faiss_index is None}")
            
            return index, id_name_map.keys()
        
    except Exception as e:
        print(f"Error updating FAISS index: {e}")
        import traceback
        traceback.print_exc()
        return None, None

async def embed_query(text: str):
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
        
        food_names = await get_id_name_map(db, user)
        print("Top matches:")
        for food_id, similarity_score in top_matches.items():
            food_name = food_names.get(food_id, "Unknown Food")
            print(f"{food_name} - {similarity_score:.4f}")
        
    except Exception as e:
        print(f"Error in find_and_print_matches: {e}")
        import traceback
        traceback.print_exc()
    
async def find_dense_matches(text: str, db, user, request: Request = None, threshold: float = 40, limit: int = 50):
    
    global faiss_index, id_list
    
    print("Searching for faiss index in app state...")
    # if not in app state, check bin. if not in bin, run update
    if request is not None and hasattr(request.app.state, 'faiss_index') and request.app.state.faiss_index is not None:
        faiss_index = request.app.state.faiss_index
    else:
        print("Searching for faiss index in BIN...")
        faiss_path = os.getenv("FAISS_BIN")
        if os.path.exists(faiss_path) and os.path.getsize(faiss_path) > 0:
            faiss_index = faiss.read_index(faiss_path)
        else:
            faiss_index, id_list = await update_faiss_index(db, user, request)
    
    if request is not None and hasattr(request.app.state, 'id_list') and request.app.state.id_list is not None:
        id_list = request.app.state.id_list
    else:
        with open(os.getenv("FOOD_ID_CACHE"), "rb") as f:
            id_name_map = pickle.load(f)
            id_list = list(id_name_map.keys())
    
    print(f"Found {len(id_list)} food IDs")
        
    # Create query embedding
    query_embedding = await embed_query(text)
        
    # D is similarity scores, I is the index of the food
    k = min(limit, faiss_index.ntotal)  # Don't request more results than we have embeddings
    if k == 0:
        print("No vectors in index, returning empty results")
        return {}
        
    D, I = faiss_index.search(query_embedding, k)
        
    # Get matching IDs and scores - I[0] contains indices into our embeddings list
    results_dict = {}
    for idx, i in enumerate(I[0]):
        if 0 <= i < len(id_list):  # Make sure index is valid
            food_id = id_list[i]
            similarity_score = float(D[0][idx])
            # Convert to 0-100 scale for consistency with sparse search
            normalized_score = round(max(0, min(100, similarity_score * 100)))
            if normalized_score >= threshold:
                results_dict[food_id] = normalized_score
        
    return results_dict

# For standalone execution
faiss_index = None
id_list_global = []
index_generation_in_progress = False

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
  food = "Greek yogurt made with skim milk"

  asyncio.run(update_faiss_index(mongo_db, mock_user))
  asyncio.run(find_and_print_matches(food, mongo_db, mock_user))