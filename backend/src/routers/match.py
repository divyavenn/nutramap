# use openAI to parse user inputted food descripiont
# make sure all the ingredients are processed in batches/parallel if possible 
# sparse index already stored in Typesense CLoud, store FAISS index in RAM
# use sparse index + dense index + Reciprocal Rank Fusion (RRF) to find matches
# add to log
# accuracy is good so no need for cross-recoder ranking using BERT model
# implement optimized product quantization with rotation matrix 
# cache queries
# For twitter trawl: 
# Add GPU acceleration with FAISS-GPU
#	Experiment with distilled vector models for compactness
#Try compressed sparse vector fusion

from fastapi import APIRouter, Depends, HTTPException, Request, Body
from typing import Dict
import asyncio

# When running as a module within the application, use relative imports
try:
    from .parse import parse_meal_description
    from .sparse import get_sparse_index
    from .dense import find_dense_matches
    from .logs import add_log
    from .auth import get_current_user
    from src.databases.mongo import get_data
    from .foods import get_food_name

# When running this file directly, use absolute imports
except ImportError:
    import sys
    import os
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    from src.routers.parse import parse_meal_description
    from src.routers.sparse import get_sparse_index
    from src.routers.dense import find_dense_matches
    from src.routers.logs import add_log
    from src.routers.auth import get_current_user
    from src.databases.mongo import get_data
    from src.routers.foods import get_food_name

from pymongo.database import Database
from typing_extensions import Annotated

router = APIRouter(
      # groups API endpoints together
    prefix='/match',
    tags=['match']
)

user = Annotated[dict, Depends(get_current_user)]
db = Annotated[Database, Depends(get_data)]

async def get_matches(ingredient: Dict, db: Database, user: Dict, request: Request = None):
    sparse_results, dense_results = await asyncio.gather(
        get_sparse_index(ingredient['food_name'], db, user, 60, 50),
        find_dense_matches(ingredient['food_name'], db, user, request, 40, 50)
    )
    return sparse_results, dense_results

async def rrf_fusion(sparse_results: Dict, dense_results: Dict, k: int = 60) -> str:
    """
    Perform Reciprocal Rank Fusion on two dictionaries of food_id -> score
    Returns the food_id with the highest combined score
    """
    combined_scores = {}
    
    # Weight factors - give more importance to dense search for semantic matching
    sparse_weight = 0.4
    dense_weight = 0.6
    
    # Process sparse results with proper tie handling
    # Group items by score to handle ties
    sparse_score_groups = {}
    for food_id, score in sparse_results.items():
        if score not in sparse_score_groups:
            sparse_score_groups[score] = []
        sparse_score_groups[score].append(food_id)
    
    # Sort scores in descending order
    sorted_sparse_scores = sorted(sparse_score_groups.keys(), reverse=True)
    # Assign ranks to items, with ties getting the same rank
    current_rank = 0
    
    async def process_score(score, food_ids):
        nonlocal current_rank
        # All items with the same score get the same rank
        norm_score = score / 100.0 if score > 0 else 0
        rank_score = 1 / (k + current_rank + 1)
        score_results = {
            food_id: sparse_weight * (0.7 * rank_score + 0.3 * norm_score)
            for food_id in food_ids
        }
        current_rank += len(food_ids)
        return score_results
    
    tasks = [process_score(score, sparse_score_groups[score]) for score in sorted_sparse_scores]
    results = await asyncio.gather(*tasks)
    
    for result in results:
        combined_scores.update(result)
    
    # Process dense results with proper tie handling
    # Group items by score to handle ties
    dense_score_groups = {}
    for food_id, score in dense_results.items():
        if score not in dense_score_groups:
            dense_score_groups[score] = []
        dense_score_groups[score].append(food_id)
    
    # Sort scores in descending order
    sorted_dense_scores = sorted(dense_score_groups.keys(), reverse=True)
    
    # Assign ranks to items, with ties getting the same rank
    current_rank = 0
    for score in sorted_dense_scores:
        food_ids = dense_score_groups[score]
        # All items with the same score get the same rank
        for food_id in food_ids:
            # Normalize score to 0-1 range
            norm_score = score / 100.0 if score > 0 else 0
            # Use the same rank for all items with the same score
            rank_score = 1 / (k + current_rank + 1)
            combined_scores[food_id] = combined_scores.get(food_id, 0) + dense_weight * (0.5 * rank_score + 0.5 * norm_score)
        # Increment rank by the number of items at this score level
        current_rank += len(food_ids)
    
    # Debug: Print top 5 combined results
    top_combined = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)[:5]
    print("\nTop 5 combined results:")
    for food_id, score in top_combined:
        food_id_int = int(food_id)
        food_name = get_food_name(food_id_int, db, None)
        print(f"{food_name}: {score:.4f}")
    
    # Return the food_id with the highest combined score
    if not combined_scores:
        return None
    return max(combined_scores, key=combined_scores.get)

@router.post("/log-meal")
async def log_meal(  
    user: user,
    db: db,
    request: Request,
    request_data: dict = Body(...),
):
    meal_description = request_data.get("meal_description", "")
    print(meal_description)
    
    parsed_foods, timestamps = parse_meal_description(meal_description)
    
    async def process_ingredient(ingredient):
        sparse_results, dense_results = await get_matches(ingredient, db, user, request)
        best_match_id = rrf_fusion(sparse_results, dense_results)
        return {
            "food_id": int(best_match_id),
            "amount_in_grams": ingredient['amount_in_grams'],
            "date": timestamps.get(ingredient['food_name']),
            "user_id": user["_id"]
        }

    log_entries = await asyncio.gather(*[process_ingredient(ingredient) for ingredient in parsed_foods])
    
    await asyncio.gather(*[add_log(user, log_entry, db) for log_entry in log_entries])

    return {"status": "success", "message": f"Logged {len(log_entries)} items"}

if __name__ == "__main__":
    # Import needed modules for standalone testing
    import os
    import pickle
    from dotenv import load_dotenv
    
    # Load environment variables
    load_dotenv()
    
    print("Testing RRF fusion algorithm...")
    
    # Create mock user for testing
    mock_user = {"_id": "system"}
    
    # Sample prompt for testing
    sample_prompt = "butter"
    
    # Connect to MongoDB
    from pymongo import MongoClient
    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("DB_NAME", "nutramapper")
    mongo_client = MongoClient(mongo_uri)
    mongo_db = mongo_client[db_name]
    
    print(f"Connected to MongoDB, testing with real data for '{sample_prompt}'...")
    
    # Get matches for the sample prompt using real data
    sparse_results, dense_results = asyncio.run(get_matches({"food_name": sample_prompt}, mongo_db, mock_user, None))

    # Test rrf_fusion function
    best_match_id = rrf_fusion(sparse_results, dense_results)
    
    # Load food names for better output
    try:
        food_id_cache = os.getenv("FOOD_ID_CACHE")
        if food_id_cache and os.path.exists(food_id_cache):
            with open(food_id_cache, 'rb') as f:
                food_names = pickle.load(f)
            food_name = food_names.get(int(best_match_id), f"Unknown food ({best_match_id})")
            print(f"\nBest match: {food_name} (ID: {best_match_id})")
        else:
            print(f"\nBest match ID: {best_match_id}")
            print(f"Food ID cache not found at {food_id_cache}")
    except Exception as e:
        print(f"\nBest match ID: {best_match_id}")
        print(f"Error displaying food name: {e}")
