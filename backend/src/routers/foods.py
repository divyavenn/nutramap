from typing_extensions import Annotated
from fastapi import APIRouter, Depends, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from pymongo.database import Database
from bson import ObjectId
from decimal import Decimal
from typing import Dict, List, Union
from src.routers.auth import get_current_user
import pickle
import datetime
import os
import asyncio
from src.routers.parallel import parallel_process

# When running as a module within the application, use relative imports
try:
    from src.databases.mongo import get_data


# When running this file directly, use absolute imports
except ImportError:
    import sys
    import os
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    from src.databases.mongo import get_data


__package__ = "backend.routers"

db = Annotated[Database, Depends(get_data)]

router = APIRouter(   # groups API endpoints together
    prefix='/food', 
    tags=['food'])




async def process_nutrient_conversion(target_id_pair, convert_map, expanded_nutrient_ids, conversion_sources):
    """Process a single nutrient ID for conversion mapping"""
    target_id = target_id_pair
    if target_id in convert_map:
        # For each target nutrient, add all source nutrients to the expanded list
        for source_dict in convert_map[target_id]:
            for source_id in source_dict:
                if source_id not in expanded_nutrient_ids:
                    expanded_nutrient_ids.append(source_id)
                # Track which sources map to which targets and their conversion factors
                if target_id not in conversion_sources:
                    conversion_sources[target_id] = []
                conversion_sources[target_id].append((source_id, source_dict[source_id]))
    return target_id

async def apply_conversion(conversion_pair, tally):
    """Apply conversion factor to a single source-target pair"""
    target_id, sources = conversion_pair
    for source_id, conversion_factor in sources:
        if source_id in tally:
            # Convert the source amount and add it to the target
            converted_amount = tally[source_id] * conversion_factor
            if target_id in tally:
                tally[target_id] += converted_amount
            else:
                tally[target_id] = converted_amount
    return target_id

def consolidate_amounts(db, user_id, start_date: datetime, end_date: datetime, nutrient_ids: list):
    return asyncio.run(consolidate_amounts_async(db, user_id, start_date, end_date, nutrient_ids))

async def consolidate_amounts_async(db, user_id, start_date: datetime, end_date: datetime, nutrient_ids: list):

    expanded_nutrient_ids = nutrient_ids.copy()
    conversion_sources = {}
    
    # Process nutrient conversions in parallel
    await parallel_process(
        nutrient_ids, 
        process_nutrient_conversion, 
        [convert_map, expanded_nutrient_ids, conversion_sources]
    )
    
    # Step 2: Get the total nutrients for the expanded list
    tally = get_total_nutrients(db, user_id, start_date, end_date, expanded_nutrient_ids)
    
    # Step 3: Apply conversions and consolidate amounts in parallel
    if conversion_sources:
        conversion_items = list(conversion_sources.items())
        await parallel_process(
            conversion_items,
            apply_conversion,
            [tally]
        )
    
    # Step 4: Remove source nutrients that were only used for conversion
    # (only if they weren't in the original nutrient_ids list)
    final_tally = {}
    for nutrient_id in nutrient_ids:
        if nutrient_id in tally:
            final_tally[nutrient_id] = tally[nutrient_id]
        else:
            final_tally[nutrient_id] = 0
            
    return final_tally

vit_d_iu = .025

# a table of nutrient_id with functional equivalents
# mapped to a list of equivalent nutrient_ids that should be included in their total mapped to conversion factor
convert_map = {1114 : [{1110 : .025}]}

def get_total_nutrients(db, user_id: str, start_date: datetime, end_date: datetime, nutrient_ids: list):
    pipeline = [
        {
            "$match": {
                "user_id": ObjectId(user_id),
                "date": {
                    "$gte": start_date,
                    "$lte": end_date
                }
            }
        },
        {
            "$lookup": {
                "from": "foods",
                "localField": "food_id",
                "foreignField": "_id",
                "as": "food"
            }
        },
        { "$unwind": "$food" },
        { "$unwind": "$food.nutrients" },
        {
            "$match": {
                "food.nutrients.nutrient_id": { "$in": nutrient_ids }
            }
        },
        {
            "$project": {
                "nutrient_id": "$food.nutrients.nutrient_id",
                "scaled_amt": {
                    "$multiply": [
                        "$food.nutrients.amt",
                        { "$divide": ["$amount_in_grams", 100] }
                    ]
                }
            }
        },
        {
            "$group": {
                "_id": "$nutrient_id",
                "total": { "$sum": "$scaled_amt" }
            }
        }
    ]

    # Get the aggregation results
    results = list(db.logs.aggregate(pipeline))
    
    # Convert from list of dictionaries to a single dictionary
    tally = {}
    for result in results:
        tally[result["_id"]] = result["total"]
    
    # Initialize any missing nutrients to 0
    for nutrient_id in nutrient_ids:
        if nutrient_id not in tally:
            tally[nutrient_id] = 0
            
    return tally

@router.get("/panel", response_model=None)
async def get_nutrient_panel(log_id: str, db: db):
    log = db.logs.find_one({"_id": ObjectId(log_id)})
    if not log:
        return {}

    food = db.foods.find_one({"_id": log["food_id"]}, {"nutrients": 1, "_id": 0})
    if not food or "nutrients" not in food:
        return {}

    proration_factor = log["amount_in_grams"] / 100  # Assuming nutrients are per 100g
    result = {}

    for nutrient in food["nutrients"]:
        prorated_amount = nutrient["amt"] * proration_factor
        if prorated_amount > 0:
            result[nutrient["nutrient_id"]] = prorated_amount

    return result
    
# def get_nutrient_panel(db, food_id: int):
#     """
#     Retrieve nutrient data for a specific food from MongoDB.
#     """
#     # Find the food with the given `food_id`
#     food = db.foods.find_one({"_id": food_id}, {"nutrients": 1, "_id": 0})
#     if not food or "nutrients" not in food:
#         return []  # Return an empty list if no data found


#     # Extract the nutrient IDs from the embedded nutrients
#     nutrient_ids = [nutrient["nutrient_id"] for nutrient in food["nutrients"]]
    
#     # Query the nutrients collection for all required nutrient details in a single call
#     # nutrient_details = db.nutrients.find(
#     #     {"_id": {"$in": nutrient_ids}}, 
#     #     {"_id": 1, "nutrient_name": 1, "unit": 1}
#     # )
    
#     # # Create a mapping of nutrient_id to nutrient details for fast lookup
#     # nutrient_details_map = {
#     #     nutrient["_id"]: {
#     #         "name": nutrient["nutrient_name"],
#     #         "unit": nutrient["unit"]
#     #     }
#     #     for nutrient in nutrient_details
#     # }

#     # Convert the embedded nutrients to the desired format
#     result = []
#     for nutrient in food["nutrients"]:
#         if nutrient["amt"] > 0:
#             # nutrient_detail = nutrient_details_map.get(nutrient["nutrient_id"], {})
#             result.append({
#                 "id": nutrient["nutrient_id"],
#                 "name": "name", #nutrient_detail.get("name"),
#                 "amount": nutrient["amt"],
#                 "unit": "unit" #nutrient_detail.get("unit")  
#             })

#     return result
    

def get_nutrient_details(db, nutrient_id: int):
    """
    Retrieve nutrient details (name and unit) from MongoDB.
    """
    # Query the nutrients collection for the given nutrient ID
    nutrient = db.nutrients.find_one({"_id": nutrient_id}, {"nutrient_name": 1, "unit": 1, "_id": 1})
    
    if not nutrient:
        raise LookupError("no nutrients of that id")
    
    return {
        "name": nutrient["nutrient_name"],
        "unit": nutrient["unit"]
    }
    

def get_food_name(food_id: int, db = db, request: Request = None):
    # Check app state first
    if request is not None and hasattr(request.app.state, 'id_name_map') and food_id in request.app.state.id_name_map:
        return request.app.state.id_name_map[food_id]
    
    # Then check pickle
    try:
        with open(os.getenv("FOOD_ID_CACHE"), 'rb') as f:
            food_names = pickle.load(f)
            if food_id in food_names:
                return food_names[food_id]
    except (FileNotFoundError, pickle.UnpicklingError):
        pass
    
    # Finally, default to MongoDB query
    food = db.foods.find_one({"_id": food_id}, {"food_name": 1, "_id": 0})
    
    if not food:
        return "No data found."
    
    return food["food_name"]


def amount_by_weight(amt: float, grams: float):
  return Decimal(amt) * Decimal(grams/100.0)



async def retrieve_id_food_map(request: Request, db: db, user: dict = Depends(get_current_user)):
    # Check app state first
    if request is not None and hasattr(request.app.state, 'id_name_map'):
        return request.app.state.id_name_map

    # Then check pickle
    try:
        with open(os.getenv("FOOD_ID_CACHE"), 'rb') as f:
            foods = pickle.load(f)
            request.app.state.id_name_map = foods
            return foods
    except (FileNotFoundError, pickle.UnpicklingError):
        pass

    # Finally, default to MongoDB query using the parallel processing function
    id_name_map = await get_id_name_map(db, user)
    
    # Store in app state and cache
    if not isinstance(id_name_map, JSONResponse):  # Make sure it's not an error response
        request.app.state.id_name_map = id_name_map
        with open(os.getenv("FOOD_ID_CACHE"), 'wb') as f:
            pickle.dump(id_name_map, f)
    
    return id_name_map


# returns data as a list of dictionaries
@router.get("/all")
async def get_all_foods(request: Request, db: db, user: dict = Depends(get_current_user)):
    id_name_map = await retrieve_id_food_map(request, db, user)
    
    # Swap keys and values: from {id: name} to {name: id}
    result = {food_name: food_id for food_id, food_name in id_name_map.items()}

    return result



async def get_id_name_map(db: db, user: dict = Depends(get_current_user)): 
  foods = list(db.foods.find(
        {"$or": [{"source": "USDA"}, {"source": user["_id"]}]},  # Match source "USDA" or user ID
        {"_id": 1, "food_name": 1}  # Retrieve only `_id` and `food_name`
    ).sort("_id", 1))
  if not foods:
      return JSONResponse(content={"message": "No data found."}, status_code=404)

  # Format the result as a dictionary
  return {food["_id"]: food["food_name"] for food in foods}

async def get_food_embeddings(db: db, user: dict = Depends(get_current_user)): 
  foods = list(db.foods.find(
        {"$or": [{"source": "USDA"}, {"source": user["_id"]}]},  # Match source "USDA" or user ID
        {"_id": 1, "embedding": 1}  # Retrieve only `_id` and `embedding`
    ).sort("_id", 1))
  if not foods:
      return JSONResponse(content={"message": "No data found."}, status_code=404)

   # Format the result as a dictionary
  return {food["_id"]: food["embedding"] for food in foods}


@router.post("/add")
async def add_food(
    background_tasks: BackgroundTasks,
    request: Request,
    food_name: str,
    nutrients: List[Dict[str, Union[int, float]]],
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_data)
):
    # Validate nutrients
    for nutrient in nutrients:
        if not db.nutrients.find_one({"_id": nutrient["nutrient_id"]}):
            return JSONResponse(content={"message": f"Invalid nutrient ID: {nutrient['nutrient_id']}"}, status_code=400)

    new_food = {
        "food_name": food_name,
        "source": user["_id"],
        "nutrients": nutrients
    }
    
    result = db.foods.insert_one(new_food)

    async def update_indexes(db, user, request):
        try:
            # Import functions
            from .dense import update_id_list, update_faiss_index
            from .sparse import update_sparse_index
        
            # Run tasks in parallel
            await asyncio.gather(
                update_id_list(db, user, request),
                update_faiss_index(db, user, request),
                update_sparse_index(db, user)
            )
        except Exception as e:
            print(f"Error updating indexes: {e}")
    # Add index updates to background tasks
    background_tasks.add_task(update_indexes, db, user, request)
    
    if result.inserted_id:
        return JSONResponse(content={"message": "Food added successfully", "food_id": str(result.inserted_id)}, status_code=201)
    else:
        return JSONResponse(content={"message": "Failed to add food"}, status_code=500)
