from fastapi import APIRouter, Depends, HTTPException, Form, Request
from pymongo.database import Database
from typing import List
from typing_extensions import Annotated
from bson import ObjectId
from datetime import timedelta, datetime

from src.databases.mongo import get_data
from src.databases.mongo_models import Log, LogEdit
from src.routers.foods import get_food_name, get_total_nutrients, consolidate_amounts
from src.routers.auth import get_current_user
from src.routers.parse import parse_meal_description, estimate_grams
from src.routers.trial_user import is_trial_user, can_create_log

__package__ = "nutramap.routers"

router = APIRouter(
    # groups API endpoints together
    prefix='/logs',
    tags=['logs']
)

user = Annotated[dict, Depends(get_current_user)]
db = Annotated[Database, Depends(get_data)]

# Load environment variables
# load_dotenv()

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
def make_log_readable(logs, db, request: Request = None):
    for log in logs:
        # Replace food_id with food_name
        log = serialize_document(log) 
        log["food_name"] = str(get_food_name(log["food_id"], db, request)).strip("(')',")    
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
def get_logs(endDate : datetime, startDate : datetime, user : user, db: db, request: Request = None):
    logs = list(get_logs_in_range(user, startDate, endDate, db))
    return make_log_readable(logs, db, request)
  
  
@router.post("/new")
async def new_log(user : user, db: db, food_id: str = Form(...), amount_in_grams: str = Form(...), date: str = Form(...)):
    try:
        log_data = Log.model_construct(food_id=int(food_id), amount_in_grams=float(amount_in_grams), date = datetime.fromisoformat(date))
        return await add_log(
            user=user,
            log=log_data,
            db=db)
        
    except ValueError:
        raise HTTPException(status_code=400)

async def add_log(user: user, log, db: db):
    # Check if trial user has reached log limit
    if is_trial_user(user) and not can_create_log(db, user):
        raise HTTPException(
            status_code=403,
            detail="Trial user log limit reached (10 logs maximum). Please create an account to continue."
        )

    # Check if log is a dictionary or a Log object
    print(log)
    if isinstance(log, dict):
        log_dict = log
        food_id = log_dict.get("food_id")
    else:
        # It's a Log object
        food_id = log.food_id
        log_dict = log.model_dump()

    # Validate that the food exists in MongoDB
    food = db.foods.find_one({"_id": food_id})
    if not food:
        raise HTTPException(status_code=404, detail="Food not found")

    # Insert log into MongoDB
    # If it's already a dict, use it directly
    if not isinstance(log, dict):
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
        raise HTTPException(status_code=500, detail="Something went wrong; log not updated.")
    
    # # Retrieve the updated log
    # updated_log = user_db.logs.find_one({"_id": target_log["_id"]})
    # if updated_log:
    #   return Log(**updated_log)
    return None


@router.post("/update-portion")
async def update_portion(
    user: user,
    db: db,
    log_id: str = Form(...),
    portion: str = Form(...),
    food_name: str = Form(...)
):
    """Update a log's portion and automatically recalculate grams"""
    # Check if the log exists and belongs to the user
    target_log = db.logs.find_one({"_id": ObjectId(log_id), "user_id": ObjectId(user["_id"])})

    if not target_log:
        raise HTTPException(status_code=404, detail="Log not found.")

    # Convert the new portion to grams using GPT
    amount_in_grams = await estimate_grams(food_name, portion)

    # Update both portion and amount_in_grams
    update_data = {
        "portion": portion,
        "amount_in_grams": amount_in_grams
    }

    # Perform the update operation
    result = db.logs.update_one({"_id": target_log["_id"]}, {"$set": update_data})

    if result.matched_count == 0:
        raise HTTPException(status_code=500, detail="Something went wrong; log not updated.")

    # Return the updated values
    return {
        "portion": portion,
        "amount_in_grams": amount_in_grams
    }


@router.get("/day_intake")
def day_intake(date: datetime, user: user, db : db):
    
    start_of_day = datetime(date.year, date.month, date.day)

    # Set the end of the day (23:59:59) for the given date
    end_of_day = start_of_day + timedelta(days=1) - timedelta(seconds=1)
    
    requirements = db.requirements.find({"user_id" : user["_id"]})
    nutrient_ids = [r["nutrient_id"] for r in requirements]
    if len(nutrient_ids) == 0:
        return {}
    return consolidate_amounts(db, user["_id"], start_of_day, end_of_day, nutrient_ids)

    
# 2024-10-01T00:00:00
# 2024-10-31T23:59:59
@router.get("/range_intake")
def meets(startDate : datetime, endDate: datetime, user: user, db : db):
    # Check if user has any requirements
    if db.requirements.count_documents({"user_id" : user["_id"]}) == 0:
        return {}
        
    # Get requirements and extract just the nutrient IDs
    requirements = list(db.requirements.find({"user_id" : user["_id"]}))
    nutrient_ids = [r["nutrient_id"] for r in requirements]
    
    if len(nutrient_ids) == 0:
        return {}
    
    # Get total nutrients for the date range
    tally = consolidate_amounts(db, user["_id"], startDate, endDate, nutrient_ids)
    
    # Count number of unique days in the range
    logs = list(get_logs_in_range(user, startDate, endDate, db))
    days = count_unique_days(logs)
    
    # Calculate daily average if there are days with logs
    if days > 0:
        for nutrient_id in tally:
            total = tally[nutrient_id]
            # Return 0 if total is 0 to avoid NaN
            avg = total / days if total != 0 else 0
            tally[nutrient_id] = avg
    
    return tally

@router.post("/parse-meal")
async def parse_meal(user: user, db: db, meal_description: str = Form(...)):
    """
    Parse a natural language meal description and create food logs.
    Example: "I had 2 slices of whole wheat bread with 1 tablespoon of peanut butter for breakfast at 8am"
    """
    try:
        
        # Parse the meal using OpenAI
        parsed_foods, timestamps = parse_meal_description(meal_description)
        
        # Create logs for each food
        logs = []
        current_time = datetime.now()
        
        for food in parsed_foods:
            food_id = food["food_id"]
            log = {
                "food_id": ObjectId(food_id),
                "amount_in_grams": float(food["amount_in_grams"]),
                "date": timestamps.get(food_id, current_time),  # Use mentioned time or current time
                "user_id": user["_id"]
            }
            result = await add_log(user, log, db)
            logs.append(result)
            
        return {"status": "success", "logs": logs}
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
