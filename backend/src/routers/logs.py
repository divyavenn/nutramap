

from fastapi import APIRouter, Depends, HTTPException, Form
from pymongo.database import Database
from typing import List
from typing_extensions import Annotated
from bson import ObjectId
from datetime import timedelta, datetime


from src.databases.mongo import get_data
from src.databases.mongo_models import Log, LogEdit
from src.routers.foods import get_nutrient_amount, amount_by_weight, get_food_name
from src.routers.auth import get_current_user

__package__ = "nutramap.routers"

router = APIRouter(
    # groups API endpoints together
    prefix='/logs',
    tags=['logs']
)

user = Annotated[dict, Depends(get_current_user)]
db = Annotated[Database, Depends(get_data)]


def serialize_document(doc):
    """Convert ObjectId fields to strings in a MongoDB document."""
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            doc[key] = str(value)
    return doc

def get_logs_for_day(user, date: datetime, user_db):
        # Set the start of the day (00:00:00) for the given date
    start_of_day = datetime(date.year, date.month, date.day)

    # Set the end of the day (23:59:59) for the given date
    end_of_day = start_of_day + timedelta(days=1) - timedelta(seconds=1)
    # print("start: " + str(start_of_day) + "end: " + str(end_of_day))
    
    query = {"user_id": user["_id"],
             "date": {
                 "$gte": start_of_day,
                 "$lte": end_of_day
             }}
    logs = user_db.logs.find(query)
    return logs

def get_logs_in_range(user, startDate : datetime, endDate: datetime, user_db):
    query = {"user_id": user["_id"],
             "date" : { "$gte" : startDate,
                        "$lte" : endDate}
            }
    logs = user_db.logs.find(query)
    return logs

# outpuwqt form:
# food_name: string
# date: Optional[datetime]
# amount_in_grams: float
def make_log_readable(logs, db):
    for log in logs:
        # Replace food_id with food_name
        log = serialize_document(log) 
        log["food_name"] = str(get_food_name(db, log["food_id"])).strip("(')',")    
        log.pop("food_id")  # Remove the food_id key
        log.pop("user_id")
    return logs 
              
def count_unique_days(logs: List[Log]) -> int:
    unique_days = set()
    for log in logs:
        # Extract the date part from the datetime and add to the set
        unique_days.add(log["date"].date())
    return len(unique_days)

#--------------------------------------end points------------------------------------------------------# 

@router.get("/get", response_model = None)
def get_logs(endDate : datetime, startDate : datetime, user : user, db: db):
    logs = list(get_logs_in_range(user, startDate, endDate, db))
    return make_log_readable(logs, db)
  
  
@router.post("/new")
def new_log(user : user, db: db, food_id: str = Form(...), amount_in_grams: str = Form(...), date: str = Form(...)):
    try:
        log_data = Log.model_construct(food_id=int(food_id), amount_in_grams=float(amount_in_grams), date = datetime.fromisoformat(date))
        return add_log(
            user=user,
            log=log_data,
            db=db)
        
    except ValueError:
        raise HTTPException(status_code=400)

def add_log(user: user, log: Log, db: db):
    # Validate that the food exists in SQLite
    food = db.foods.find_one({"_id" : log.food_id})
    if not food:
        raise HTTPException(status_code=404, detail="Food not found")

    # Insert log into MongoDB
    log_dict = log.model_dump()
    # set log ID to current logged in user
    log_dict["user_id"] = user["_id"]
    log_dict["_id"] = ObjectId()  # Ensure it is unique
    
    db.logs.insert_one(log_dict)
    

@router.delete("/delete")
def remove_log(user: user, log_id: str, db : db):
    log = db.logs.find_one({"_id": ObjectId(log_id), "user_id": ObjectId(user["_id"])})
    
    if not log:
        raise HTTPException(status_code=404, detail="Log not found.")
    
    print(log)

    # Perform the update operation
    result = db.logs.delete_one({"_id": ObjectId(log_id), "user_id": ObjectId(user["_id"])})
  
    
    # Check if the document was deleted
    if result.deleted_count > 0:
      print("Log deleted successfully.")
      return None
    else:
      print("No document matched the filter criteria.")
      raise HTTPException(status_code=404, detail="Something went wrong, log not deleted.")
    
    
@router.post("/edit")
def edit_log(user: user, db : db, update_info: LogEdit):
    # Check if the log exists and belongs to the user
    print("looking for " + update_info.log_id + " for user " + str(user["_id"]) + " name " + user["name"])
    # print(log.amount_in_grams + "    " + log.date)
    target_log = db.logs.find_one({"_id": ObjectId(update_info.log_id), "user_id": ObjectId(user["_id"])})
    
    if not target_log:
        raise HTTPException(status_code=404, detail="Log not found.")
    
    
    # Update the fields in the log
    update_data = {
        "food_id" : update_info.food_id,
        "amount_in_grams" : update_info.amount_in_grams,
        "date" : update_info.date  # Update the date to the current time
    }

    # Perform the update operation
    result = db.logs.update_one({"_id": target_log["_id"]}, {"$set": update_data})
  
    if result.matched_count == 0:
        raise HTTPException(status_code=500, detaily="Something went wrong; log not updated.")
    
    # # Retrieve the updated log
    # updated_log = user_db.logs.find_one({"_id": target_log["_id"]})
    # if updated_log:
    #   return Log(**updated_log)
    return None
   
 

@router.get("/day_intake")
def day_intake(date: datetime, user: user, db : db):
    requirements = db.requirements.find({"user_id" : user["_id"]})
    tally = {}
    if db.requirements.count_documents({"user_id" : user["_id"]}) == 0:
        return tally
    
    for r in requirements:
      tally[r["nutrient_id"]] = 0
    
    # Validate that the food exists in SQLite
    logs = list(get_logs_for_day(user, date, db))
    # print(logs)
    for log in logs:
      data = get_nutrient_amount(db, log["food_id"])
      for d in data:
          if d["id"] in tally:
            tally[d["id"]] += amount_by_weight(d["amount"], log["amount_in_grams"])

    return tally
    
# 2024-10-01T00:00:00
# 2024-10-31T23:59:59
@router.get("/range_intake")
def meets(startDate : datetime, endDate: datetime, user: user, db : db):
    requirements = db.requirements.find({"user_id" : user["_id"]})
    tally = {}
    if db.requirements.count_documents({"user_id" : user["_id"]}) == 0:
        return tally
    
    for r in requirements:
      tally[r["nutrient_id"]] = 0

    # Validate that the food exists in SQLite
    logs = list(get_logs_in_range(user,startDate, endDate, db))
    for log in logs:
      data = get_nutrient_amount(db, log["food_id"])
      for d in data:
          if d["id"]in tally:
            tally[d["id"]] += amount_by_weight(d["amount"], log["amount_in_grams"])
    
    # number of days 
    days = count_unique_days(logs)
    if (days > 0):
        for nutrient in tally:
            total = tally[nutrient]
            avg = total / days
            tally[nutrient] = avg
    
    return tally
