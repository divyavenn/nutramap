from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError
from sqlalchemy.orm import Session
from databases.user_models_mongo import User, UserCreate, Log, LogCreate, Requirement, RequirementCreate
from databases.user_data_connect import get_user_data
from databases.food_data_connect import get_session
from typing import List
from typing_extensions import Annotated
from databases.food_models import Food, Nutrient
from bson import ObjectId
import hashlib
import datetime
from datetime import timedelta, timezone
from routers.food_data import get_food_data, amount_by_weight, get_food_name
from routers.auth import hash_password, get_current_user


router = APIRouter(
    # groups API endpoints together
    prefix='/user', 
    tags=['user']
)

user_dependency = Annotated[dict, Depends(get_current_user)]

def make_log_readable(logs: List[Log], food_db):
    for log in logs:
        # Replace food_id with food_name
        log["food_name"] = str(get_food_name(food_db, log["food_id"])).strip("(')',")
        
        log.pop("food_id")  # Remove the food_id key
        log.pop("user_id")
        log.pop("_id")
        
        # Format the date
        if "date" in log:
            log["date"] = str(log["date"].strftime("%b %-d %-H:%-M"))
    return logs 

def make_requirement_readable(requirements: list[Requirement, food_db])

            
def count_unique_days(logs: List[Log]) -> int:
    unique_days = set()
    for log in logs:
        # Extract the date part from the datetime and add to the set
        unique_days.add(log["date"].date())
    return len(unique_days)

@router.post("/new", response_model=User)
def create_user(user: UserCreate, db: Database = Depends(get_user_data)):
    # converts to dictionary
    user_dict = user.model_dump()
    # this removes the password field and assigns the value to the password_hash field, allowing hashing for security purposes
    user_dict["password_hash"] = hash_password(user_dict.pop("password"))
    user_dict["_id"] = str(ObjectId())
    
    try:
        # Insert the new user, relying on the unique index to enforce uniqueness
        db.users.insert_one(user_dict)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    
    return User(**user_dict)

@router.get("/all", response_model=List[User])
def get_user(user_db: Database = Depends(get_user_data)):
    users = list(user_db.users.find({}))
    #for user in users:
    #   user["user_id"] = str(user.pop("_id"))  # Convert ObjectId to string
    return [User(**user) for user in users]

def get_logs_for_user(user, user_db, time_ago : timedelta = None):
    query = {"user_id": str(user["_id"])}
    if time_ago:
        cutoff_datetime = datetime.now() - time_ago
        query["date"] = {"$gte": cutoff_datetime}
    
    logs = user_db.logs.find(query)
    return logs

def get_requirements_for_user(user, user_db):
    query = {"user_id": str(user["_id"])}
    return user_db.requirements.find(query)

@router.get("/logs", response_model = None)
def get_logs(user: user_dependency, user_db: Database = Depends(get_user_data), food_db : Session = Depends(get_session)):
    logs = list(get_logs_for_user(user, user_db))
    #for user in users:
    #   user["user_id"] = str(user.pop("_id"))  # Convert ObjectId to string
    return make_log_readable(logs, food_db)

@router.get("/requirements", response_model = None)
def get_requirements(user: user_dependency, user_db: Database = Depends(get_user_data), food_db : Session = Depends(get_session)):
    requirements = list(get_logs_for_user(user, user_db))
    #for user in users:
    #   user["user_id"] = str(user.pop("_id"))  # Convert ObjectId to string
    return make_log_readable(logs, food_db)

@router.post("/add/log", response_model=Log)
def add_log(user: user_dependency, log: LogCreate, food_db: Session = Depends(get_session), user_db: Database = Depends(get_user_data)):
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    

    # Validate that the food exists in SQLite
    food = food_db.query(Food).filter(Food.food_id == log.food_id).first()
    if not food:
        raise HTTPException(status_code=404, detail="Food not found")

    # Insert log into MongoDB
    log_dict = log.model_dump()
    
    log_dict["date"] = datetime.datetime.now()
    # set log ID to current logged in user
    log_dict["user_id"] = user["_id"]
    log_dict["_id"] = str(ObjectId())  # Ensure log_id is returned as a string

    
    user_db.logs.insert_one(log_dict)
    
    return Log(**log_dict)

@router.delete("/remove/log")
def remove_log(user: user_dependency, log_id: str, user_db: Database = Depends(get_user_data)):
    return None

@router.get("/meets_target")
def meets(user: user_dependency, user_db: Database = Depends(get_user_data), food_db: Session = Depends(get_session)):
    # Validate that the food exists in SQLite
    logs = get_logs_for_user(user, user_db)
    
    if len(logs) == 0:
        raise HTTPException(status_code=404, detail="No data logged for this user")

    
    requirements = user_db.requirements.find({"user_id" : user["_id"]})
    
    if user_db.requirements.count_documents({"user_id" : user["_id"]}) == 0:
        raise HTTPException(status_code=404, detail="This user has no requirements.")
    
    tally = {}
    
    for r in requirements:
      tally[r["nutrient_id"]] = {"name" : None, "target" : r["amt"], "intake" : 0, "avg_intake" : 0, "should_exceed": r["should_exceed"]}
      
    for log in logs:
      data = get_food_data(food_db, log["food_id"])
      for d in data:
          if d.nutrient_id in tally:
            tally[d.nutrient_id]["name"] = d.nutrient_name
            tally[d.nutrient_id]["intake"] += amount_by_weight(d.amt, log["amount_in_grams"])
    
    # number of days 
    days = count_unique_days(logs)
    

    for nutrient in tally:
      stats = tally[nutrient]
      stats["avg_intake"]= stats["intake"] / days
      stats["meets"] = (stats["should_exceed"] and stats["avg_intake"] >= stats["target"]) or (not stats["should_exceed"] and stats["avg_intake"] <= stats["target"])
    
    return tally
      

@router.post("/add/requirement", response_model=Requirement)
def add_requirement(user: user_dependency, requirement: RequirementCreate, food_db: Session = Depends(get_session), user_db: Database = Depends(get_user_data)):
    # Validate that the user exists in MongoDB
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate that the nutrient exists in MongoDB
    nutrient = food_db.query(Nutrient).filter(Nutrient.nutrient_id == requirement.nutrient_id).first()
    
    if not nutrient:
        raise HTTPException(status_code=404, detail="Nutrient not found")

    # Insert requirement into MongoDB 
    req_dict = requirement.model_dump()
    req_dict["user_id"] = user["_id"]
    user_db.requirements.insert_one(req_dict)
    return Requirement(**req_dict)

@router.delete("/remove/requirement")
def remove_requirement(user: user_dependency, requirement_id: str, user_db: Database = Depends(get_user_data)):
    return None