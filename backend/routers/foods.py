from typing_extensions import Annotated
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from decimal import Decimal
from .auth import get_current_user

from ..databases.main_connection import get_data, Nutrient, Food, Data

__package__ = "backend.routers"

db = Annotated[Session, Depends(get_data)]

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
    

def get_food_name(db, food_id: int):
    """
    Retrieve the name of a specific food from MongoDB.
    """
    # Query for the food name based on the food ID
    food = db.foods.find_one({"_id": food_id}, {"food_name": 1, "_id": 0})
    
    if not food:
        return "No data found."
    
    return food["food_name"]

def amount_by_weight(amt: float, grams: float):
  return Decimal(amt) * Decimal(grams/100.0)


# returns data as a list of dictionaries
@router.get("/all")
async def get_all_foods(db: db, user: dict = Depends(get_current_user)): 
  foods = list(db.foods.find(
        {"$or": [{"source": "USDA"}, {"source": user["_id"]}]},  # Match source "USDA" or user ID
        {"_id": 1, "food_name": 1}  # Retrieve only `_id` and `food_name`
    ))
  if not foods:
      return JSONResponse(content={"message": "No data found."}, status_code=404)

  # Format the result as a dictionary
  return {food["food_name"]: food["_id"] for food in foods}
