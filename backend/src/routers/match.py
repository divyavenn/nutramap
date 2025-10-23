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

from fastapi import APIRouter, Depends, Request, Body
from fastapi.responses import JSONResponse
from fastapi import BackgroundTasks
from typing import Dict, List
import asyncio

# When running as a module within the application, use relative imports
try:
    from .parse import parse_meal_description, estimate_grams
    from .sparse import get_sparse_index
    from .dense import find_dense_matches
    from .logs import add_log
    from .auth import get_current_user
    from src.databases.mongo import get_data
    from .foods import get_food_name
    from .parallel import parallel_process

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
    from src.routers.parallel import parallel_process

from pymongo.database import Database
from typing_extensions import Annotated

router = APIRouter(
      # groups API endpoints together
    prefix='/match',
    tags=['match']
)

user = Annotated[dict, Depends(get_current_user)]
db = Annotated[Database, Depends(get_data)]

async def get_matches(ingredient: Dict, db: Database, user: Dict, request: Request = None, k : int = 30):
    sparse_results, dense_results = await asyncio.gather(
        get_sparse_index(ingredient['food_name'], db, user, 60, k),
        find_dense_matches(ingredient['food_name'], db, user, request, 40, k)
    )
    return sparse_results, dense_results

async def rrf_fusion(sparse_results: Dict, dense_results: Dict, k: int = 30, n : int = 1) -> str:
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
    
    # Define the process function for sparse scores
    async def process_sparse_score(score):
        nonlocal current_rank
        food_ids = sparse_score_groups[score]
        # All items with the same score get the same rank
        norm_score = score / 100.0 if score > 0 else 0
        rank_score = 1 / (k + current_rank + 1)
        score_results = {
            food_id: sparse_weight * (0.7 * rank_score + 0.3 * norm_score)
            for food_id in food_ids
        }
        current_rank += len(food_ids)
        return score_results
    
    # Initialize current_rank for sparse processing
    current_rank = 0
    
    # Process sparse scores in parallel
    sparse_results_list = await parallel_process(sorted_sparse_scores, process_sparse_score)
    
    # Combine sparse results
    for result in sparse_results_list:
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
    
    # Define the process function for dense scores
    async def process_dense_score(score):
        nonlocal current_rank
        food_ids = dense_score_groups[score]
        norm_score = score / 100.0 if score > 0 else 0
        rank_score = 1 / (k + current_rank + 1)
        score_results = {
            food_id: dense_weight * (0.5 * rank_score + 0.5 * norm_score)
            for food_id in food_ids
        }
        current_rank += len(food_ids)
        return score_results
    
    # Reset current_rank for dense processing
    current_rank = 0
    
    # Process dense scores in parallel
    dense_results_list = await parallel_process(sorted_dense_scores, process_dense_score)
    
    async def combine_results(result):
        for food_id, score in result.items():
            combined_scores[food_id] = combined_scores.get(food_id, 0) + score
    
    await parallel_process(dense_results_list, combine_results)
    
    # Debug: Print top 5 combined results
    #top_combined = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)[:5]
    
    # print("\nTop 5 combined results:")
    #for food_id, score in top_combined:
        #food_id_int = int(food_id)
        #food_name = get_food_name(food_id_int, None, None)
        # print(f"{food_name}: {score:.4f}")
    
    # Return the top n food_ids with the highest combined scores
    if not combined_scores:
        return []
    sorted_scores = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)
    return [food_id for food_id, _ in sorted_scores[:n]]

@router.post("/log-meal")
async def log_meal(  
    user: user,
    db: db,
    request: Request,
    background: BackgroundTasks, 
    request_data: dict = Body(...),
):
    meal_description = request_data.get("meal_description", "")
    # print(meal_description)
    
    parsed_foods, timestamps = await parse_meal_description(meal_description)
    
    # Convert datetime objects to ISO format strings for JSON serialization
    serializable_timestamps = {
        food_name: timestamp.isoformat() 
        for food_name, timestamp in timestamps.items()
    }
    
    # Return early with the number of logs that will be processed
    # This allows the frontend to start showing animations while processing continues
    response = JSONResponse(
        content={
            "status": "processing", 
            "log_count": len(parsed_foods),
            "foods": [{item["food_name"] : serializable_timestamps[item["food_name"]]} for item in parsed_foods]
        }
    )
    background.add_task(process_logs, user, db, request, parsed_foods, timestamps)
    
    return response

@router.post("/log-meal-now")
async def log_meal_now(  
    user: user,
    db: db,
    request: Request,
    request_data: dict = Body(...),
):
    meal_description = request_data.get("meal_description", "")
    # print(meal_description)
    
    parsed_foods, timestamps = await parse_meal_description(meal_description)
    
    await process_logs(user, db, request, parsed_foods, timestamps)

    return {"status": "success", "message": f"Logged {len(parsed_foods)} items"}

async def process_logs(user, db, request, parsed_foods, timestamps):
    """Process logs in the background after initial response is sent"""
    try:
        async def process_ingredient(ingredient):
            # Convert portion to grams using GPT
            portion = ingredient.get('portion', '1 serving')
            amount_in_grams = await estimate_grams(ingredient['food_name'], portion)

            # Find matches
            sparse_results, dense_results = await get_matches(ingredient, db, user, request)
            matches = await rrf_fusion(sparse_results, dense_results)

            return {
                "food_id": int(matches[0]),
                "portion": portion,  # Store natural portion
                "amount_in_grams": amount_in_grams,  # Store converted grams
                "date": timestamps.get(ingredient['food_name']),
                "user_id": user["_id"]
            }

        log_entries = await asyncio.gather(*[process_ingredient(ingredient) for ingredient in parsed_foods])

        await asyncio.gather(*[add_log(user, log_entry, db) for log_entry in log_entries])

        # print(f"Successfully processed {len(log_entries)} log entries in the background")
    except Exception as e:
        print(f"Error in background log processing: {e}")
        import traceback
        traceback.print_exc()


@router.post("/autocomplete", response_model=List[str])
async def autocomplete(user : user, db : db, request : Request, prompt: str):
    try:
        sparse_results, dense_results = await get_matches({"food_name": prompt}, db, user, request)
        matches = await rrf_fusion(sparse_results, dense_results, 10, 10)
        output = []
        async def add_names( match_id, output, db, request):
            output.append(get_food_name(match_id, db, request))
        
        await parallel_process(matches, add_names, [output, db, request])
        
        return output
        
        
    except Exception as e:
        print(f"Error in background log processing: {e}")
        import traceback
        traceback.print_exc()
    

if __name__ == "__main__":
    # Import needed modules for standalone testing
    import os
    import pickle
    from dotenv import load_dotenv
    
    # Load environment variables
    load_dotenv()
    
    async def main():
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
        
        print(await autocomplete(mock_user, mongo_db, None, sample_prompt))
        
        # # Get matches for the sample prompt using real data
        # sparse_results, dense_results = await get_matches({"food_name": sample_prompt}, mongo_db, mock_user, None)

        # # Test rrf_fusion function
        # best_match_id = await rrf_fusion(sparse_results, dense_results)
        
        # # Load food names for better output
        # try:
        #     food_id_cache = os.getenv("FOOD_ID_CACHE")
        #     if food_id_cache and os.path.exists(food_id_cache):
        #         with open(food_id_cache, 'rb') as f:
        #             food_names = pickle.load(f)
        #         food_name = food_names.get(int(best_match_id), f"Unknown food ({best_match_id})")
        #         print(f"\nBest match: {food_name} (ID: {best_match_id})")
        #     else:
        #         print(f"\nBest match ID: {best_match_id}")
        #         print(f"Food ID cache not found at {food_id_cache}")
        # except Exception as e:
        #     print(f"\nBest match ID: {best_match_id}")
        #     print(f"Error displaying food name: {e}")
    
    # Run the async main function
    asyncio.run(main())
