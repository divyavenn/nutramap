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

from fastapi import APIRouter, Depends, Request, Body, Query
from fastapi.responses import JSONResponse
from fastapi import BackgroundTasks
from typing import Dict, List
import asyncio
import time

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
     
    # if there any perfect sparse matches, return them directly
    # if not, move on to RRF fusion.
    if sparse_score_groups:
      return [sparse_score_groups[100]]
  
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
            weight_in_grams = await estimate_grams(ingredient['food_name'], portion)

            # Find matches
            sparse_results, dense_results = await get_matches(ingredient, db, user, request)
            matches = await rrf_fusion(sparse_results, dense_results)

            return {
                "food_id": int(matches[0]),
                "amount": portion,  # Store natural portion
                "weight_in_grams": weight_in_grams,  # Store converted grams
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


@router.get("/search/sparse")
async def test_sparse_food_search(
    food_name: str = Query(..., description="Food name to search for"),
    threshold: float = Query(40, description="Minimum score threshold (0-100)", ge=0, le=100),
    limit: int = Query(50, description="Maximum number of results", ge=1, le=100),
    user: user = None,
    db: db = None
):
        # Time ONLY the search, not the name lookup
        start_time = time.perf_counter()
        results = await get_sparse_index(food_name, db, user, threshold, limit)
        end_time = time.perf_counter()
        elapsed_ms = round((end_time - start_time) * 1000, 2)

        if not results:
            return {
                "query": food_name,
                "method": "sparse (Typesense)",
                "elapsed_ms": elapsed_ms,
                "results_count": 0,
                "matches": {},
                "message": "No foods found matching the query"
            }

        # AFTER timing, get food names for the matched IDs
        food_details = {}
        for food_id, score in results.items():
            # Query the database directly to get the food name
            try:
                # Handle both ObjectId (custom foods) and integer (USDA foods)
                try:
                    # Try as integer first (USDA foods)
                    food_doc = db.foods.find_one({"_id": int(food_id)})
                except (ValueError, TypeError):
                    # If that fails, try as ObjectId (custom foods)
                    from bson import ObjectId
                    food_doc = db.foods.find_one({"_id": ObjectId(food_id)})

                if food_doc and "food_name" in food_doc:
                    food_details[str(food_id)] = {
                        "name": food_doc["food_name"],
                        "score": score
                    }
                else:
                    food_details[str(food_id)] = {
                        "name": "Unknown food",
                        "score": score
                    }
            except Exception as e:
                print(f"Error looking up food {food_id}: {e}")
                food_details[str(food_id)] = {
                    "name": "Error retrieving name",
                    "score": score
                }

        return {
            "query": food_name,
            "method": "sparse (Typesense)",
            "elapsed_ms": elapsed_ms,
            "results_count": len(results),
            "matches": food_details
        }


@router.get("/search/dense")
async def test_dense_food_search(
    food_name: str = Query(..., description="Food name to search for"),
    threshold: float = Query(40, description="Minimum similarity threshold (0-100)", ge=0, le=100),
    limit: int = Query(50, description="Maximum number of results", ge=1, le=100),
    user: user = None,
    db: db = None,
    request: Request = None
):
    """
    Test dense (semantic/embedding-based) food search using FAISS.
    Uses cosine similarity with OpenAI embeddings.

    Example queries:
    - "butter"
    - "poultry"
    - "fruit"
    """
    try:
        # Time ONLY the search, not the name lookup
        start_time = time.perf_counter()
        results = await find_dense_matches(food_name, db, user, request, threshold, limit)
        end_time = time.perf_counter()
        elapsed_ms = round((end_time - start_time) * 1000, 2)

        if not results:
            return {
                "query": food_name,
                "method": "dense (FAISS embeddings)",
                "elapsed_ms": elapsed_ms,
                "results_count": 0,
                "matches": {},
                "message": "No foods found matching the query"
            }

        # AFTER timing, get food names for the matched IDs
        food_details = {}
        for food_id, score in results.items():
            # Query the database directly to get the food name
            try:
                # Handle both ObjectId (custom foods) and integer (USDA foods)
                try:
                    # Try as integer first (USDA foods)
                    food_doc = db.foods.find_one({"_id": int(food_id)})
                except (ValueError, TypeError):
                    # If that fails, try as ObjectId (custom foods)
                    from bson import ObjectId
                    food_doc = db.foods.find_one({"_id": ObjectId(food_id)})

                if food_doc and "food_name" in food_doc:
                    food_details[str(food_id)] = {
                        "name": food_doc["food_name"],
                        "score": score
                    }
                else:
                    food_details[str(food_id)] = {
                        "name": "Unknown food",
                        "score": score
                    }
            except Exception as e:
                print(f"Error looking up food {food_id}: {e}")
                food_details[str(food_id)] = {
                    "name": "Error retrieving name",
                    "score": score
                }

        return {
            "query": food_name,
            "method": "dense (FAISS embeddings)",
            "elapsed_ms": elapsed_ms,
            "results_count": len(results),
            "matches": food_details
        }
    except Exception as e:
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )


@router.get("/search/rrf")
async def test_rrf_food_search(
    food_name: str = Query(..., description="Food name to search for"),
    sparse_threshold: float = Query(60, description="Minimum sparse score threshold (0-100)", ge=0, le=100),
    dense_threshold: float = Query(40, description="Minimum dense score threshold (0-100)", ge=0, le=100),
    limit: int = Query(30, description="Maximum number of results per method", ge=1, le=100),
    top_n: int = Query(10, description="Number of top results to return after fusion", ge=1, le=50),
    user: user = None,
    db: db = None,
    request: Request = None
):
    """
    Test RRF (Reciprocal Rank Fusion) hybrid food search.
    Combines sparse (Typesense) and dense (FAISS) search with weighted fusion.

    Example queries:
    - "butter"
    - "chicken"
    - "apple juice"
    """
    try:
        # Time the entire search process
        start_time = time.perf_counter()

        # Get sparse and dense results in parallel
        sparse_start = time.perf_counter()
        sparse_results, dense_results = await asyncio.gather(
            get_sparse_index(food_name, db, user, sparse_threshold, limit),
            find_dense_matches(food_name, db, user, request, dense_threshold, limit)
        )
        search_time = time.perf_counter() - sparse_start

        # Perform RRF fusion
        fusion_start = time.perf_counter()
        top_food_ids = await rrf_fusion(sparse_results, dense_results, k=30, n=top_n)
        fusion_time = time.perf_counter() - fusion_start

        end_time = time.perf_counter()
        elapsed_ms = round((end_time - start_time) * 1000, 2)
        search_ms = round(search_time * 1000, 2)
        fusion_ms = round(fusion_time * 1000, 2)

        if not top_food_ids:
            return {
                "query": food_name,
                "method": "RRF (sparse + dense fusion)",
                "elapsed_ms": elapsed_ms,
                "search_ms": search_ms,
                "fusion_ms": fusion_ms,
                "sparse_count": len(sparse_results),
                "dense_count": len(dense_results),
                "results_count": 0,
                "matches": [],
                "message": "No foods found matching the query"
            }

        # AFTER all timing, get food names and scores for the top results
        food_details = []
        for rank, food_id in enumerate(top_food_ids, 1):
            # Query the database directly to get the food name
            try:
                # Handle both ObjectId (custom foods) and integer (USDA foods)
                try:
                    # Try as integer first (USDA foods)
                    food_doc = db.foods.find_one({"_id": int(food_id)})
                except (ValueError, TypeError):
                    # If that fails, try as ObjectId (custom foods)
                    from bson import ObjectId
                    food_doc = db.foods.find_one({"_id": ObjectId(food_id)})

                if food_doc and "food_name" in food_doc:
                    food_details.append({
                        "rank": rank,
                        "food_id": str(food_id),
                        "name": food_doc["food_name"],
                        "sparse_score": sparse_results.get(food_id),
                        "dense_score": dense_results.get(food_id)
                    })
                else:
                    food_details.append({
                        "rank": rank,
                        "food_id": str(food_id),
                        "name": "Unknown food",
                        "sparse_score": sparse_results.get(food_id),
                        "dense_score": dense_results.get(food_id)
                    })
            except Exception as e:
                print(f"Error looking up food {food_id}: {e}")
                food_details.append({
                    "rank": rank,
                    "food_id": str(food_id),
                    "name": "Error retrieving name",
                    "sparse_score": sparse_results.get(food_id),
                    "dense_score": dense_results.get(food_id)
                })

        return {
            "query": food_name,
            "method": "RRF (sparse + dense fusion)",
            "elapsed_ms": elapsed_ms,
            "search_ms": search_ms,
            "fusion_ms": fusion_ms,
            "sparse_count": len(sparse_results),
            "dense_count": len(dense_results),
            "results_count": len(food_details),
            "matches": food_details
        }
    except Exception as e:
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )


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
