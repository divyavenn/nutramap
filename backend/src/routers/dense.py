import os
from openai import OpenAI
from dotenv import load_dotenv
from typing import List, Dict
from typing_extensions import Annotated
from scipy.spatial.distance import cosine
from fastapi import Depends, Request
from pymongo.database import Database
import asyncio
import numpy as np
import faiss
import math

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
            return
            
        embeddings = list(embedding_id_map.values())
        id_list = list(embedding_id_map.keys())
        
        # Print some debug info
        print(f"Found {len(embeddings)} embeddings for FAISS index")
        
        # Convert list of embeddings to numpy array with proper dtype
        embedding_matrix = np.array(embeddings, dtype=np.float32)
        
        # Check if we have any embeddings
        if embedding_matrix.size == 0:
            print("No embeddings provided to create index")
            return
        
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
        
        if request is not None:
            request.app.state.faiss_index = index
            request.app.state.id_list = id_list
            print(f"FAISS index stored in app.state with {len(id_list)} items")
        else:
            global faiss_index, id_list_global
            faiss_index = index
            id_list_global = id_list
            print(f"FAISS index stored in global variables with {len(id_list)} items")
        
    except Exception as e:
        print(f"Error updating FAISS index: {e}")
        import traceback
        traceback.print_exc()

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
        top_matches = await find_dense_matches(text, db, user)
        
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
    global faiss_index, id_list_global  # Move global statement to the beginning of the function
    try:
        # Get the index and ID list from app.state if available
        if request is not None:
            # Running as part of FastAPI app
            if hasattr(request.app.state, 'faiss_index') and request.app.state.faiss_index is not None:
                # Index already exists in app state, use it
                print("Using existing FAISS index from app.state")
                faiss_index = request.app.state.faiss_index
                id_list = request.app.state.id_list
            else:
                # Index not initialized, create it
                print("FAISS index not initialized in app.state, updating now...")
                await update_faiss_index(db, user, request)
                
                # If still not initialized, return empty results
                if not hasattr(request.app.state, 'faiss_index') or request.app.state.faiss_index is None:
                    print("Failed to initialize FAISS index")
                    return {}
                
                # Get the newly created index
                faiss_index = request.app.state.faiss_index
                id_list = request.app.state.id_list
        else:
            # Running standalone
            # Check if index is initialized
            if 'faiss_index' not in globals() or faiss_index is None:
                print("FAISS index not initialized in globals, updating now...")
                await update_faiss_index(db, user)
                
                # If still not initialized, return empty results
                if 'faiss_index' not in globals() or faiss_index is None:
                    print("Failed to initialize FAISS index")
                    return {}
            
            id_list = id_list_global
        
        # Create query embedding
        query_embedding = await embed_query(text)
        
        # D is similarity scores, I is the index of the food
        k = min(limit, faiss_index.ntotal)  # Don't request more results than we have embeddings
        if k == 0:
            return {}
            
        D, I = faiss_index.search(query_embedding, k)
        
        # Print debug info about search results
        print(f"Search results - D: {D}, I: {I}")
        
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
    except Exception as e:
        print(f"Error in find_dense_matches: {e}")
        import traceback
        traceback.print_exc()
        return {}

# For standalone execution
faiss_index = None
id_list_global = []

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