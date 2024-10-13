from fastapi import APIRouter, Depends, HTTPException, Request
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError
from sqlalchemy.orm import Session
from typing import List
from typing_extensions import Annotated
from bson import ObjectId
from datetime import timedelta, datetime


from ..databases.main_connection import get_user_data, User, UserCreate, Log, LogCreate, Requirement, RequirementCreate, get_session, Food, Nutrient
from .food_data import get_food_data, amount_by_weight, get_food_name, get_nutrient_name
from .auth import hash_password, get_current_user
from ..imports import templates
from fastapi.responses import JSONResponse

__package__ = "nutramap.routers"

router = APIRouter(
    # groups API endpoints together
    prefix='/user', 
    tags=['user']
)

user_dependency = Annotated[dict, Depends(get_current_user)]
user_db_dependency = Annotated[Database, Depends(get_user_data)]
food_db_dependency = Annotated[Session, Depends(get_session)] 


#------------------------------------------pages-------------------------------------------------# 
@router.get("/dashboard")
def render_dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

#--------------------------------------helpers---------------------------------------------------# 

def get_logs_for_user(user, user_db, time_ago : timedelta = None):
    query = {"user_id": str(user["_id"])}
    if time_ago:
        cutoff_datetime = datetime.now() - time_ago
        query["date"] = {"$gte": cutoff_datetime}
    
    logs = user_db.logs.find(query)
    return logs

# output form:
# food_name: string
# date: Optional[datetime]
# amount_in_grams: float
def make_log_readable(logs: List[Log], food_db):
    for log in logs:
        # Replace food_id with food_name
        log["food_name"] = str(get_food_name(food_db, log["food_id"])).strip("(')',")
        
        log.pop("food_id")  # Remove the food_id key
        log.pop("user_id")
        log.pop("_id")
        
        # Format the date
        #if "date" in log:
        #    log["date"] = str(log["date"].strftime("%b %-d %-H:%-M"))
    
    return logs 

def make_requirement_readable(requirements: List[Requirement], food_db):
    for req in requirements:
        req["nutrient_name"] = get_nutrient_name(req["nutrient_id"])
        req.pop("nutrient_id")
        return
              
def count_unique_days(logs: List[Log]) -> int:
    unique_days = set()
    for log in logs:
        # Extract the date part from the datetime and add to the set
        unique_days.add(log["date"].date())
    return len(unique_days)

#--------------------------------------end points------------------------------------------------------# 

# A protected route that requires a valid token
@router.get("/info")
def protected_route(user: dict = Depends(get_current_user)):
    if user:
      print(user)
      return user
    else:
      return JSONResponse(content={"message": "You are not authenticated"}, status_code=401)


@router.post("/new", response_model=User)
def create_user(user: UserCreate, user_db : user_db_dependency):
    # converts to dictionary
    user_dict = user.model_dump()
    # this removes the password field and assigns the value to the password_hash field, allowing hashing for security purposes
    user_dict["password_hash"] = hash_password(user_dict.pop("password"))
    user_dict["_id"] = str(ObjectId())
    user_dict["role"] = "user"
    
    try:
        # Insert the new user, relying on the unique index to enforce uniqueness
        user_db.users.insert_one(user_dict)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    
    return User(**user_dict)

@router.get("/all", response_model=List[User])
def get_user(user_db : user_db_dependency):
    users = list(user_db.users.find({}))
    #for user in users:
    #   user["user_id"] = str(user.pop("_id"))  # Convert ObjectId to string
    return [User(**user) for user in users]

def get_requirements_for_user(user, user_db):
    query = {"user_id": str(user["_id"])}
    requirements = user_db.requirements.find(query)
    if requirements is None:
        raise HTTPException(status_code = 401, detail = "This user has no requirements.")
                                
    return requirements
    
    
@router.get("/logs", response_model = None)
def get_logs(user: user_dependency, user_db : user_db_dependency, food_db : food_db_dependency):
    logs = list(get_logs_for_user(user, user_db)) 
    return make_log_readable(logs, food_db)

@router.post("/update-password", response_model = User)
def update_password(new_password: str, user: user_dependency, user_db : user_db_dependency):
    query = {"_id": user["_id"]}
    
    user_to_update = user_db.users.find_one(query)
    if user_to_update is None:
        raise HTTPException(status_code = 401, detail = "This user does not exist")
    
    update = {"$set": {"password_hash": hash_password(new_password)}}
    user_db.users.update_one(query, update)
    
    return f"Password for {user_to_update['email']} updated!"

@router.post("/update-email", response_model = None)
def update_email(new_email: str, user: user_dependency, user_db : user_db_dependency):
    query_id = {"_id": user["_id"]}
    

    user_to_update = user_db.users.find_one(query_id)
    if user_to_update is None:
        raise HTTPException(status_code = 401, detail = "This user does not exist")
    
    query_email = {"email" : new_email}
    user_with_email = user_db.users.find_one(query_email)
    
    if user_with_email is not None:
        raise HTTPException(status_code = 401, detail = "Another user already has this email")
    
    # Update the user's role to admin
    old_email = user_to_update["email"]
    if old_email == new_email:
        return "This is already your current email."
    
    update = {"$set": {"email": new_email}}
    user_db.users.update_one(query_id, update)
    
    return f"Email changed from {old_email} to {new_email}"

@router.post("/make_admin", response_model = User)
def make_admin(email: str, user : user_dependency, user_db : user_db_dependency):
    if user is None or user['role'] != 'admin':
        raise HTTPException(status_code = 401, detail = "Invalid credentials; must be administrator")
    query = {"email": email}
    user_to_update = user_db.users.find_one(query)
    if user_to_update is None:
        raise HTTPException(status_code = 401, detail = "No user with this email exists.")
    
    
    # Update the user's role to admin
    update = {"$set": {"role": "admin"}}
    user_db.users.update_one(query, update)
    
    # Optionally, retrieve the updated user document
    updated_user = user_db.users.find_one(query)
    
    return User(**updated_user)

@router.post("/remove_admin", response_model = User)
def remove_admin(email: str, user : user_dependency, user_db : user_db_dependency):
    if user is None or user['role'] != 'admin':
        raise HTTPException(status_code = 401, detail = "Invalid credentials; must be administrator")
    query = {"email": email}
    user_to_update = user_db.users.find(query)
    if user_to_update is None:
        raise HTTPException(status_code = 401, detail = "No user with this email exists.")
    
    
    # Update the user's role to user
    update = {"$set": {"role": "user"}}
    user_db.users.update_one(query, update)
    
    # Optionally, retrieve the updated user document
    updated_user = user_db.users.find_one(query)
    
    return User(**updated_user)
        


@router.get("/requirements", response_model = None)
def get_requirements(user : user_dependency, user_db : user_db_dependency, food_db : food_db_dependency):
    requirements = list(get_requirements_for_user(user, user_db))
    return make_log_readable(requirements, food_db)

@router.post("/add/log", response_model=Log)
def add_log(user: user_dependency, log: LogCreate, food_db : food_db_dependency, user_db : user_db_dependency):

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
def remove_log(user: user_dependency, log_id: str, user_db : user_db_dependency):
    return None

@router.get("/meets_target")
def meets(user: user_dependency, user_db : user_db_dependency, food_db : food_db_dependency):
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
def add_requirement(user: user_dependency, requirement: RequirementCreate, food_db : food_db_dependency, user_db : user_db_dependency):
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
def remove_requirement(user: user_dependency, requirement_id: str, user_db : user_db_dependency):
    return None