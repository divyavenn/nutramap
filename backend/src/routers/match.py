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
from .parse import parse_meal_description
from .sparse import get_sparse_index
from .dense import find_dense_matches
from .logs import add_log
from .auth import get_current_user
from pymongo.database import Database
from typing_extensions import Annotated
from src.databases.mongo import get_data

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

def rrf_fusion(sparse_results: Dict, dense_results: Dict, k: int = 60) -> str:
    """
    Perform Reciprocal Rank Fusion on two dictionaries of food_id -> score
    Returns the food_id with the highest combined score
    """
    combined_scores = {}
    
    # Convert sparse results dictionary to sorted list for ranking
    sparse_ranked = sorted(sparse_results.items(), key=lambda x: x[1], reverse=True)
    
    # Convert dense results dictionary to sorted list for ranking
    dense_ranked = sorted(dense_results.items(), key=lambda x: x[1], reverse=True)
    
    # Process sparse results
    for i, (food_id, _) in enumerate(sparse_ranked):
        combined_scores[food_id] = 1 / (k + i + 1)
    
    # Process dense results
    for i, (food_id, _) in enumerate(dense_ranked):
        combined_scores[food_id] = combined_scores.get(food_id, 0) + 1 / (k + i + 1)
    
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
        print("food_id" + str(best_match_id))
        return {
            "food_id": int(best_match_id),
            "amount_in_grams": ingredient['amount_in_grams'],
            "date": timestamps.get(ingredient['food_name']),
            "user_id": user["_id"]
        }

    log_entries = await asyncio.gather(*[process_ingredient(ingredient) for ingredient in parsed_foods])
    
    await asyncio.gather(*[add_log(user, log_entry, db) for log_entry in log_entries])

    return {"status": "success", "message": f"Logged {len(log_entries)} items"}
