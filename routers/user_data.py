from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError
from sqlalchemy.orm import Session
from databases.user_models_mongo import User, UserCreate, Log, LogCreate, Requirement
from databases.user_data_connect import get_user_data
from databases.food_data_connect import get_session
from typing import List
from databases.food_models import Food, Nutrient
from bson import ObjectId
import hashlib
import datetime
from routers.food_data import get_food_data, amount_by_weight

router = APIRouter()

def count_unique_days(logs: List[Log]) -> int:
    unique_days = set()
    for log in logs:
        # Extract the date part from the datetime and add to the set
        unique_days.add(log["date"].date())
    return len(unique_days)

@router.post("/users/", response_model=User)
def create_user(user: UserCreate, db: Database = Depends(get_user_data)):
    # converts to dictionary
    user_dict = user.model_dump()
    # this removes the password field and assigns the value to the password_hash field, allowing hashing for security purposes
    user_dict["password_hash"] = hashlib.sha256(user_dict.pop("password").encode()).hexdigest()
    user_dict["_id"] = str(ObjectId())
    
    try:
        # Insert the new user, relying on the unique index to enforce uniqueness
        db.users.insert_one(user_dict)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    
    return User(**user_dict)

@router.get("/allusers", response_model=List[User])
def get_user(db: Database = Depends(get_user_data)):
    users = list(db.users.find({}))
    #for user in users:
    #   user["user_id"] = str(user.pop("_id"))  # Convert ObjectId to string
    return [User(**user) for user in users]



@router.post("/users/logs/", response_model=Log)
def add_log(log: LogCreate, food_db: Session = Depends(get_session), user_db: Database = Depends(get_user_data)):
    # Validate that the user exists in MongoDB
    user = user_db.users.find_one({"_id": str(log.user_id)})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate that the food exists in SQLite
    food = food_db.query(Food).filter(Food.food_id == log.food_id).first()
    if not food:
        raise HTTPException(status_code=404, detail="Food not found")

    # Insert log into MongoDB
    log_dict = log.model_dump()
    
    log_dict["date"] = datetime.datetime.now()
    log_dict["_id"] = str(ObjectId())  # Ensure log_id is returned as a string
    
    print(log_dict)
    
    user_db.logs.insert_one(log_dict)
    
    return Log(**log_dict)

@router.get("/meets_targets/{user_id}")
def meets(user_id: str, user_db: Database = Depends(get_user_data), food_db: Session = Depends(get_session)):
    # Validate that the user exists in MongoDB
    user = user_db.users.find_one({"_id": str(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate that the food exists in SQLite
    logs = list(user_db.logs.find({"user_id" : str(user_id)}))
    
    if len(logs) == 0:
        raise HTTPException(status_code=404, detail="No data logged for this user")

    
    requirements = user_db.requirements.find({"user_id" : user_id})
    
    if user_db.requirements.count_documents({"user_id" : user_id}) == 0:
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
      
      

@router.post("/users/{user_id}/requirements/", response_model=Requirement)
def add_requirement(requirement: Requirement, food_db: Session = Depends(get_session), db: Database = Depends(get_user_data)):
    # Validate that the user exists in MongoDB
    user = db.users.find_one({"_id": requirement.user_id})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate that the nutrient exists in MongoDB
    nutrient = food_db.query(Nutrient).filter(Nutrient.nutrient_id == requirement.nutrient_id).first()
    
    if not nutrient:
        raise HTTPException(status_code=404, detail="Nutrient not found")

    # Insert requirement into MongoDB 
    req_dict = requirement.model_dump()
    req_dict["user_id"] = requirement.user_id
    db.requirements.insert_one(requirement.model_dump())
    return requirement