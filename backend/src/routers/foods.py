from typing_extensions import Annotated
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pymongo.database import Database
from decimal import Decimal
from typing import Dict, List, Union
from src.routers.auth import get_current_user
import pickle
import os

from src.databases.mongo import get_data

__package__ = "backend.routers"

db = Annotated[Database, Depends(get_data)]

router = APIRouter(   # groups API endpoints together
    prefix='/food', 
    tags=['food'])


def get_nutrient_amount(db, food_id : int):
    food = db.foods.find_one({"_id": food_id}, {"nutrients": 1, "_id": 0})
    if not food or "nutrients" not in food:
        return [] 
    
    result = []
    for nutrient in food["nutrients"]:
        if nutrient["amt"] > 0:
            result.append({
                "id": nutrient["nutrient_id"],
                "amount": nutrient["amt"]})

    return result

@router.get("/panel", response_model = None)
def get_nutrient_panel(food_id : int, db : db):
    food = db.foods.find_one({"_id": food_id}, {"nutrients": 1, "_id": 0})
    if not food or "nutrients" not in food:
        return [] 
    
    result = []
    for nutrient in food["nutrients"]:
        if nutrient["amt"] > 0:
            details = get_nutrient_details(db, nutrient["nutrient_id"])
            result.append({
                "id": nutrient["nutrient_id"],
                "amount": nutrient["amt"],
                "name" : details["name"],
                "unit" : details["unit"]
            })

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
    if hasattr(request.app.state, 'id_name_map') and food_id in request.app.state.id_name_map:
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
    if hasattr(request.app.state, 'id_name_map'):
        return request.app.state.id_name_map

    # Then check pickle
    try:
        with open(os.getenv("FOOD_ID_CACHE"), 'rb') as f:
            foods = pickle.load(f)
            request.app.state.id_name_map = foods
            return foods
    except (FileNotFoundError, pickle.UnpicklingError):
        pass

    # Finally, default to MongoDB query
    foods = list(db.foods.find(
        {"$or": [{"source": "USDA"}, {"source": user["_id"]}]},
        {"_id": 1, "food_name": 1}
    ).sort("_id", 1))
    if not foods:
        return JSONResponse(content={"message": "No data found."}, status_code=404)
    
    id_name_map = {food["_id"]: food["food_name"] for food in foods}
    request.app.state.id_name_map = id_name_map
    with open(os.getenv("FOOD_ID_CACHE"), 'wb') as f:
        pickle.dump(id_name_map, f)
    return id_name_map


# returns data as a list of dictionaries
@router.get("/all")
async def get_all_foods(request: Request, db: db, user: dict = Depends(get_current_user)):
    foods = await retrieve_id_food_map(request, db, user)
    result = {food["food_name"]: food["_id"] for food in foods}

    # Update app state and pickle for future use
    request.app.state.all_foods = result
    with open(os.getenv("ALL_FOODS_CACHE"), 'wb') as f:
        pickle.dump(result, f)

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
    
    if result.inserted_id:
        return JSONResponse(content={"message": "Food added successfully", "food_id": str(result.inserted_id)}, status_code=201)
    else:
        return JSONResponse(content={"message": "Failed to add food"}, status_code=500)
