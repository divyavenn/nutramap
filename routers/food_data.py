from typing_extensions import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from decimal import Decimal


from ..databases.main_connection import get_session, Nutrient, Food, Data

__package__ = "nutramap.routers"

food_db_dependency = Annotated[Session, Depends(get_session)]

router = APIRouter(   # groups API endpoints together
    prefix='/food', 
    tags=['food'])

def get_food_data(food_db: Session, food_id: int):
  data = food_db.query(Nutrient.nutrient_id, Nutrient.nutrient_name, Data.amt, Nutrient.unit).join(Data, Nutrient.nutrient_id == Data.nutrient_id).filter(Data.food_id == int(food_id), Data.amt > 0).all()
  if not data:
    return "No data found."
  return data

def get_food_name(food_db: Session, food_id: int):
  name = food_db.query(Food.food_name).filter(Food.food_id == food_id).first()
  if not name:
    return "No data found."
  return name

def get_nutrient_name(food_db: Session, nutrient_id: int):
  name = food_db.query(Nutrient.nutrient_name).filter(Nutrient.nutrient_id == nutrient_id).first()
  if not name:
    return "No data found."
  return name


def amount_by_weight(amt: float, grams: float):
  return amt * Decimal(grams/100.0)

@router.get("/nutrients")
async def find_nutrient_data_for_food(food_db: food_db_dependency, food_id : int): 
  data = get_food_data(food_db, food_id)
  return [{nutrient_name: str(amt) + " " + unit} for nutrient_id, nutrient_name, amt, unit in data]

@router.get("/all_nutrients")
async def get_all_nutrients(food_db: food_db_dependency): 
  data = food_db.query(Nutrient).all()
  if not data:
    return "No data found."
  return data

@router.get("/nutrients_by_weight")
async def data_for_food_by_weight(food_db: food_db_dependency, food_id : int, grams : float): 
  data = get_food_data(food_db, food_id)
  if not data:
    return "No data found."
  return [{nutrient_name: str(amount_by_weight(amt, grams)) + " " + unit} for nutrient_id, nutrient_name, amt, unit in data]

@router.get("/{food}")
async def find_food(food_db: food_db_dependency, food : str): 
  data = food_db.query(Food).filter(Food.food_name.like(f'{food}%')).all()
  if not data:
    return "No data found."
  return data