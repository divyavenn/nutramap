

from fastapi import APIRouter, Depends, HTTPException, Form
from pymongo.database import Database
from sqlalchemy.orm import Session
from typing import List
from typing_extensions import Annotated
from bson import ObjectId
from datetime import timedelta, datetime


from ..databases.main_connection import get_user_data, Log, LogCreate, get_session, Food
from .foods import get_food_data, amount_by_weight, get_food_name, get_nutrient_details
from .auth import get_current_user

__package__ = "nutramap.routers"

router = APIRouter(
    # groups API endpoints together
    prefix='/logs',
    tags=['logs']
)

user_dependency = Annotated[dict, Depends(get_current_user)]
user_db_dependency = Annotated[Database, Depends(get_user_data)]
food_db_dependency = Annotated[Session, Depends(get_session)] 




def get_day_logs(user, date: datetime, user_db):
        # Set the start of the day (00:00:00) for the given date
    start_of_day = datetime(date.year, date.month, date.day)

    # Set the end of the day (23:59:59) for the given date
    end_of_day = start_of_day + timedelta(days=1) - timedelta(seconds=1)
    
    query = {"user_id": str(user["_id"]),
             "date": {
                 "$gte": start_of_day,
                 "$lte": end_of_day
             }}
    logs = user_db.logs.find(query)
    return logs

def get_logs_for_user(user, startDate : datetime, endDate: datetime, user_db):
    query = {"user_id": str(user["_id"]),
             "date" : { "$gte" : startDate,
                        "$lte" : endDate}}
    print(query)
    logs = user_db.logs.find(query)
    return logs

# outpuwqt form:
# food_name: string
# date: Optional[datetime]
# amount_in_grams: float
def make_log_readable(logs: List[Log], food_db):
    for log in logs:
        # Replace food_id with food_name
        log["food_name"] = str(get_food_name(food_db, log["food_id"])).strip("(')',")
        
        log.pop("food_id")  # Remove the food_id key
        log.pop("user_id")

        
        # Format the date
        #if "date" in log:
        #    log["date"] = str(log["date"].strftime("%b %-d %-H:%-M"))
    
    return logs 
              
def count_unique_days(logs: List[Log]) -> int:
    unique_days = set()
    for log in logs:
        # Extract the date part from the datetime and add to the set
        unique_days.add(log["date"].date())
    return len(unique_days)

#--------------------------------------end points------------------------------------------------------# 

@router.get("/get", response_model = None)
def get_logs(endDate : datetime, startDate : datetime, user : user_dependency, user_db : user_db_dependency, food_db : food_db_dependency):
    logs = list(get_logs_for_user(user, startDate, endDate, user_db)) 
    return make_log_readable(logs, food_db)
  
  
@router.post("/new")
def handle_login(user : user_dependency, food_db : food_db_dependency, user_db : user_db_dependency, food_id: str = Form(...), amount_in_grams: str = Form(...), date: str = Form(...)):
    try:
        log_data = LogCreate(food_id=int(food_id), amount_in_grams=float(amount_in_grams), date = date)
        return add_log(
            user=user,
            log=log_data,
            food_db=food_db,
            user_db=user_db)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid data format for food_id or amount_in_grams")

def add_log(user: user_dependency, log: LogCreate, food_db : food_db_dependency, user_db : user_db_dependency):

    # Validate that the food exists in SQLite
    food = food_db.query(Food).filter(Food.food_id == log.food_id).first()
    if not food:
        raise HTTPException(status_code=404, detail="Food not found")

    # Insert log into MongoDB
    log_dict = log.model_dump()
    
    # set log ID to current logged in user
    log_dict["user_id"] = user["_id"]
    log_dict["_id"] = str(ObjectId())  # Ensure log_id is returned as a string

    
    user_db.logs.insert_one(log_dict)
    
    return Log(**log_dict)

@router.delete("/delete")
def remove_log(user: user_dependency, log_id: str, user_db : user_db_dependency):
    log = user_db.logs.find_one({"_id": log_id, "user_id": str(user["_id"])})
    
    if not log:
        raise HTTPException(status_code=404, detail="Log not found.")
    
    print(log)

    # Perform the update operation
    result = user_db.logs.delete_one({"_id": log_id})
  
    
    # Check if the document was deleted
    if result.deleted_count > 0:
      print("Log deleted successfully.")
      return None
    else:
      print("No document matched the filter criteria.")
      raise HTTPException(status_code=404, detail="Something went wrong, log not deleted.")
    

@router.post("/edit")
def edit_log(user: user_dependency, user_db : user_db_dependency, log_id: str = Form(...), food_id: str = Form(...), amount_in_grams: str = Form(...), date : str = Form(...)):
    # Check if the log exists and belongs to the user
    print("looking for " + log_id + "for user" + str(user["_id"]) + " name " + user["name"])
    print(amount_in_grams + "    " + date)
    log = user_db.logs.find_one({"_id": log_id, "user_id": str(user["_id"])})
    
    if not log:
        raise HTTPException(status_code=404, detail="Log not found.")
    
    
    # Update the fields in the log
    update_data = {
        "food_id": int(food_id),
        "amount_in_grams": float(amount_in_grams),
        "date": datetime.strptime(date, "%Y-%m-%dT%H:%M:%S")  # Update the date to the current time
    }

    # Perform the update operation
    result = user_db.logs.update_one({"_id": log_id}, {"$set": update_data})
  
    if result.matched_count == 0:
        raise HTTPException(status_code=500, detail="Something went wrong; log not updated.")
    
    # Retrieve the updated log
    updated_log = user_db.logs.find_one({"_id": log_id})
    if updated_log:
      return Log(**updated_log)
    return None
   
 

@router.get("/day_intake")
def day_intake(date: datetime, user: user_dependency, user_db : user_db_dependency, food_db : food_db_dependency):
    requirements = user_db.requirements.find({"user_id" : user["_id"]})
    tally = {}
    if user_db.requirements.count_documents({"user_id" : user["_id"]}) == 0:
        return tally
    
    for r in requirements:
      name, units = get_nutrient_details(food_db, r["nutrient_id"])
      tally[r["nutrient_id"]] = 0
    
    # Validate that the food exists in SQLite
    logs = list(get_day_logs(user, date, user_db))
    for log in logs:
      data = get_food_data(food_db, log["food_id"])
      for d in data:
          if d.nutrient_id in tally:
            tally[d.nutrient_id] += amount_by_weight(d.amt, log["amount_in_grams"])

    return tally
    
# 2024-10-01T00:00:00
# 2024-10-31T23:59:59
@router.get("/range_intake")
def meets(startDate : datetime, endDate: datetime, user: user_dependency, user_db : user_db_dependency, food_db : food_db_dependency):
    requirements = user_db.requirements.find({"user_id" : user["_id"]})
    tally = {}
    if user_db.requirements.count_documents({"user_id" : user["_id"]}) == 0:
        return tally
    
    for r in requirements:
      name, units = get_nutrient_details(food_db, r["nutrient_id"])
      tally[r["nutrient_id"]] = 0
    
    # Validate that the food exists in SQLite
    logs = list(get_logs_for_user(user,startDate, endDate, user_db))
    for log in logs:
      data = get_food_data(food_db, log["food_id"])
      for d in data:
          if d.nutrient_id in tally:
            tally[d.nutrient_id] += amount_by_weight(d.amt, log["amount_in_grams"])
    
    # number of days 
    days = count_unique_days(logs)
    if (days > 0):
        for nutrient in tally:
            total = tally[nutrient]
            avg = total / days
            tally[nutrient] = avg
    
    return tally
