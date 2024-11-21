from typing_extensions import Annotated
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from decimal import Decimal


from ..databases.main_connection import get_session, Nutrient, Food, Data

__package__ = "backend.routers"

food_db_dependency = Annotated[Session, Depends(get_session)]

router = APIRouter(   # groups API endpoints together
    prefix='/food', 
    tags=['food'])


def get_food_data(food_db: Session, food_id: int):
  data = food_db.query(Nutrient.nutrient_id, Nutrient.nutrient_name, Nutrient.unit, Data.amt).join(Data, Nutrient.nutrient_id == Data.nutrient_id).filter(Data.food_id == int(food_id), Data.amt > 0).all()
  if not data:
    return []  # Return an empty list if no data found

  # Convert the results to a list of dictionaries
  result = [
    {"id": nutrient_id, "name": nutrient_name, "amount": amt, "unit" : unit} for nutrient_id, nutrient_name, unit, amt in data
  ]
  return result

@router.get("/nutrient_data")
def foo(food_db: food_db_dependency, food_id : int):
  return get_food_data(food_db, food_id)

def get_food_name(food_db: Session, food_id: int):
  name = food_db.query(Food.food_name).filter(Food.food_id == food_id).first()
  if not name:
    return "No data found."
  return name

def get_nutrient_details(food_db: Session, nutrient_id: int):
  details = food_db.query(Nutrient.nutrient_name, Nutrient.unit).filter(Nutrient.nutrient_id == nutrient_id).first()
  if not details:
    return "No data found."
  return details


def amount_by_weight(amt: float, grams: float):
  return amt * Decimal(grams/100.0)

@router.get("/nutrients")
async def find_nutrient_data_for_food(food_db: food_db_dependency, food_id : int): 
  return get_food_data(food_db, food_id)

# returns data as a list of lists
@router.get("/all_nutrients")
async def get_all_nutrients(food_db: food_db_dependency): 
  data = food_db.query(Nutrient.nutrient_name, Nutrient.nutrient_id, Nutrient.unit).all()
  
  filtered_data = [
    (nutrient_name, nutrient_id, unit)
    for nutrient_name, nutrient_id, unit in data
    if nutrient_id not in {1062, 2047, 2048}
  ]
      
  if not filtered_data:
    return JSONResponse(content={"message": "No data found."}, status_code=404)
  return {nutrient_name : {"id" : nutrient_id, "unit" : unit}  for nutrient_name, nutrient_id, unit in filtered_data}
 
# returns data as a list of dictionaries
@router.get("/all_foods")
async def get_all_food(food_db: food_db_dependency): 
  data = food_db.query(Food.food_id, Food.food_name).all()
  if not data:
    return JSONResponse(content={"message": "No data found."}, status_code=404)
  return {food_name: food_id for food_id, food_name in data}


@router.get("/{food}")
async def find_food(food_db: food_db_dependency, food : str): 
  data = food_db.query(Food).filter(Food.food_name.like(f'{food}%')).all()
  if not data:
    return "No data found."
  return data