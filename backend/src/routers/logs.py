from fastapi import APIRouter, Depends, HTTPException, Form, Request
from pymongo.database import Database
from typing import List
from typing_extensions import Annotated
from bson import ObjectId
from datetime import timedelta, datetime


from src.databases.mongo import get_data
from src.databases.mongo_models import Log, LogEdit
from src.routers.foods import get_food_name, consolidate_amounts
from src.routers.auth import get_current_user
from src.routers.parse import estimate_grams
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

# output form:
# New structure: logs with components
# Each log has: meal_name, recipe_id, servings, date, components[]
# Each component has: food_id, food_name, amount, weight_in_grams
def make_log_readable(logs, db, request: Request = None):
    logs = [serialize_document(log) for log in logs]

    # Batch-fetch all recipes referenced by these logs (one query instead of N)
    recipe_ids = {log["recipe_id"] for log in logs if log.get("recipe_id")}
    recipe_map: dict = {}
    if recipe_ids:
        for user_doc in db.users.find(
            {"recipes.recipe_id": {"$in": list(recipe_ids)}},
            {"recipes": 1}
        ):
            for recipe in user_doc.get("recipes", []):
                rid = recipe.get("recipe_id")
                if rid and rid in recipe_ids:
                    recipe_map[rid] = recipe

    for log in logs:
        # Add food names to each component
        if "components" in log:
            for component in log["components"]:
                component["food_name"] = str(get_food_name(component["food_id"], db, request)).strip("(')',")

        # Attach recipe metadata from the batch-fetched map
        if log.get("recipe_id"):
            recipe = recipe_map.get(log["recipe_id"])
            log["recipe_exists"] = bool(recipe)
            if log.get("serving_unit"):
                log["serving_size_label"] = f"1 {str(log['serving_unit']).strip()}"
            elif log.get("serving_size_label"):
                log["serving_size_label"] = log.get("serving_size_label")
            else:
                log["serving_size_label"] = recipe.get("serving_size_label") if recipe else None
        else:
            log["recipe_exists"] = False
            if log.get("serving_unit"):
                log["serving_size_label"] = f"1 {str(log['serving_unit']).strip()}"
            else:
                log["serving_size_label"] = log.get("serving_size_label")

        log.pop("user_id", None)
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
async def new_log(
    user: user,
    db: db,
    food_id: str = Form(...),
    amount: str = Form(...),
    weight_in_grams: str = Form(...),
    date: str = Form(...),
    recipe_id: str = Form(None),
    recipe_servings: str = Form(None)
):
    try:
        log_data = Log.model_construct(
            food_id=int(food_id),
            amount=amount,
            weight_in_grams=float(weight_in_grams),
            date=datetime.fromisoformat(date),
            recipe_id=recipe_id if recipe_id else None,
            recipe_servings=float(recipe_servings) if recipe_servings else None
        )
        return await add_log(user=user, log=log_data, db=db)
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
    else:
        # It's a Log object
        log_dict = log.model_dump()

    # Validate that all component foods exist in MongoDB (new format)
    if "components" in log_dict and isinstance(log_dict["components"], list):
        valid_components = []
        for component in log_dict["components"]:
            food_id = component.get("food_id")
            if food_id:
                # Convert string ObjectIds to ObjectId for custom foods
                search_id = ObjectId(food_id) if isinstance(food_id, str) and len(str(food_id)) == 24 else food_id
                food = db.foods.find_one({"_id": search_id})
                if not food:
                    print(f"Warning: skipping component with missing food ID {food_id}")
                    continue
            valid_components.append(component)
        log_dict["components"] = valid_components
        if not valid_components:
            raise HTTPException(status_code=404, detail="No valid food components found for this log")
    # Old format validation (for backward compatibility with /logs/new endpoint)
    elif "food_id" in log_dict:
        food_id = log_dict.get("food_id")
        # Convert string ObjectIds to ObjectId for custom foods
        search_id = ObjectId(food_id) if isinstance(food_id, str) and len(str(food_id)) == 24 else food_id
        food = db.foods.find_one({"_id": search_id})
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
def edit_log(user: user, db: db, update_info: LogEdit):
    # Check if the log exists and belongs to the user
    print("looking for " + update_info.log_id + " for user " + str(user["_id"]) + " name " + user["name"])
    target_log = db.logs.find_one({"_id": ObjectId(update_info.log_id), "user_id": ObjectId(user["_id"])})

    if not target_log:
        raise HTTPException(status_code=404, detail="Log not found.")

    # Update the fields in the log
    update_data = {
        "food_id": update_info.food_id,
        "amount": update_info.amount,
        "weight_in_grams": update_info.weight_in_grams,
        "date": update_info.date
    }

    if update_info.recipe_id is not None:
        update_data["recipe_id"] = update_info.recipe_id
    if update_info.recipe_servings is not None:
        update_data["recipe_servings"] = update_info.recipe_servings

    # Perform the update operation
    result = db.logs.update_one({"_id": target_log["_id"]}, {"$set": update_data})

    if result.matched_count == 0:
        raise HTTPException(status_code=500, detail="Something went wrong; log not updated.")

    return None


@router.post("/update-portion")
async def update_portion(
    user: user,
    db: db,
    log_id: str = Form(...),
    amount: str = Form(...),
    food_name: str = Form(...)
):
    """Update a log's portion and automatically recalculate grams"""
    # Check if the log exists and belongs to the user
    target_log = db.logs.find_one({"_id": ObjectId(log_id), "user_id": ObjectId(user["_id"])})

    if not target_log:
        raise HTTPException(status_code=404, detail="Log not found.")

    # Convert the new portion to grams using GPT
    weight_in_grams = await estimate_grams(food_name, amount)

    # Update both amount and weight_in_grams
    update_data = {
        "amount": amount,
        "weight_in_grams": weight_in_grams
    }

    # Perform the update operation
    result = db.logs.update_one({"_id": target_log["_id"]}, {"$set": update_data})

    if result.matched_count == 0:
        raise HTTPException(status_code=500, detail="Something went wrong; log not updated.")

    # Return the updated values
    return {
        "amount": amount,
        "weight_in_grams": weight_in_grams
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


@router.delete("/delete-old-logs")
def delete_old_logs(user: user, db: db):
    """
    Delete all old-format logs that don't have a 'components' field.
    """
    # Delete all logs that don't have a 'components' field (old format)
    result = db.logs.delete_many({
        "user_id": user["_id"],
        "components": {"$exists": False}
    })

    return {
        "status": "success",
        "deleted_count": result.deleted_count,
        "message": f"Deleted {result.deleted_count} old logs"
    }



@router.post("/edit-recipe-log")
def edit_recipe_log(
    user: user,
    db: db,
    log_id: str = Form(...),
    servings: float = Form(...),
    date: str = Form(...)
):
    """
    Edit a recipe log's servings, date, and time.
    Updates the components' weights proportionally based on new servings.
    """
    # Check if the log exists and belongs to the user
    target_log = db.logs.find_one({"_id": ObjectId(log_id), "user_id": ObjectId(user["_id"])})

    if not target_log:
        raise HTTPException(status_code=404, detail="Log not found.")

    # Parse the date string
    try:
        date_str = date.replace('Z', '+00:00')
        new_date = datetime.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    # Calculate the ratio of new servings to old servings
    old_servings = target_log.get("servings", 1.0)
    servings_ratio = servings / old_servings if old_servings > 0 else 1.0

    # Update component weights and amounts proportionally
    updated_components = []
    if "components" in target_log:
        for component in target_log["components"]:
            updated_component = component.copy()
            updated_component["weight_in_grams"] = component["weight_in_grams"] * servings_ratio
            if component.get("amount"):
                from src.routers.parse import scale_portion_text
                updated_component["amount"] = scale_portion_text(component["amount"], servings_ratio)
            updated_components.append(updated_component)

    # Update the log
    total_weight_grams = sum(float(c.get("weight_in_grams", 0) or 0) for c in updated_components)

    update_data = {
        "servings": servings,
        "date": new_date,
        "components": updated_components,
        "logged_weight_grams": total_weight_grams,
    }

    result = db.logs.update_one({"_id": target_log["_id"]}, {"$set": update_data})

    if result.matched_count == 0:
        raise HTTPException(status_code=500, detail="Something went wrong; log not updated.")

    return {"status": "success", "message": "Recipe log updated successfully"}


@router.post("/add-component")
async def add_component(
    user: user,
    db: db,
    log_id: str = Form(...),
    food_name: str = Form(...),
    amount: str = Form(...),
    food_id: str = Form(None)
):
    """
    Append a new component to an existing log.
    Used when adding an ingredient to an unlinked meal.
    """
    target_log = db.logs.find_one({"_id": ObjectId(log_id), "user_id": ObjectId(user["_id"])})

    if not target_log:
        raise HTTPException(status_code=404, detail="Log not found.")

    # Resolve food_id
    if food_id:
        new_food_id = food_id
        try:
            new_food_id = int(new_food_id)
        except (ValueError, TypeError):
            pass
    else:
        from src.routers.match import rrf_fusion, get_sparse_index
        from src.routers.dense import find_dense_matches
        matches = await rrf_fusion(
            get_sparse_index, [food_name, db, user, 60, 50],
            find_dense_matches, [food_name, db, user, None, 40, 50],
            k=30, n=1
        )
        if not matches:
            raise HTTPException(status_code=404, detail="Food not found")
        new_food_id = matches[0]
        try:
            new_food_id = int(new_food_id)
        except (ValueError, TypeError):
            pass

    from src.routers.parse import estimate_grams
    weight_in_grams = await estimate_grams(food_name, amount)

    new_component = {
        "food_id": new_food_id,
        "amount": amount,
        "weight_in_grams": weight_in_grams
    }

    result = db.logs.update_one(
        {"_id": target_log["_id"]},
        {"$push": {"components": new_component}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=500, detail="Something went wrong; component not added.")

    return {
        "status": "success",
        "weight_in_grams": weight_in_grams,
        "food_name": food_name
    }


@router.delete("/delete-component")
def delete_component(
    user: user,
    db: db,
    log_id: str,
    component_index: int
):
    """
    Remove a specific component from a log.
    If it is the last component, deletes the whole log.
    """
    target_log = db.logs.find_one({"_id": ObjectId(log_id), "user_id": ObjectId(user["_id"])})

    if not target_log:
        raise HTTPException(status_code=404, detail="Log not found.")

    components = list(target_log.get("components", []))

    if component_index < 0 or component_index >= len(components):
        raise HTTPException(status_code=400, detail="Invalid component index.")

    if len(components) == 1:
        db.logs.delete_one({"_id": target_log["_id"]})
        return {"status": "deleted_log"}

    components.pop(component_index)
    db.logs.update_one(
        {"_id": target_log["_id"]},
        {"$set": {"components": components}}
    )

    return {"status": "success", "remaining_components": len(components)}


@router.post("/edit-component")
async def edit_component(
    user: user,
    db: db,
    log_id: str = Form(...),
    component_index: int = Form(...),
    food_name: str = Form(...),
    amount: str = Form(...),
    food_id: str = Form(None)  # Optional: food_id from autocomplete
):
    """
    Edit a specific component within a log.
    Updates the food and/or amount for that component.
    Unlinks from recipe if recipe_id exists.
    """
    # Check if the log exists and belongs to the user
    target_log = db.logs.find_one({"_id": ObjectId(log_id), "user_id": ObjectId(user["_id"])})

    if not target_log:
        raise HTTPException(status_code=404, detail="Log not found.")

    # Verify the component index exists
    if "components" not in target_log or component_index >= len(target_log["components"]):
        raise HTTPException(status_code=400, detail="Invalid component index.")

    # Get the original component
    original_component = target_log["components"][component_index]

    # Determine the new food_id
    if food_id:
        # Food ID was provided from autocomplete, use it directly
        new_food_id = food_id
        # Try to convert to int for USDA foods, but keep as string for custom foods
        try:
            new_food_id = int(new_food_id)
        except (ValueError, TypeError):
            # It's a custom food with ObjectId string, keep as is
            pass
    else:
        # No food_id provided, check if food name changed
        from src.routers.foods import get_food_name
        original_food_name = get_food_name(original_component["food_id"], db, None)
        food_changed = food_name.strip().lower() != original_food_name.strip().lower()

        if food_changed:
            # Search for the new food_id
            from src.routers.match import rrf_fusion, get_sparse_index
            from src.routers.dense import find_dense_matches

            matches = await rrf_fusion(
                get_sparse_index, [food_name, db, user, 60, 50],
                find_dense_matches, [food_name, db, user, None, 40, 50],
                k=30,
                n=1
            )

            if not matches or len(matches) == 0:
                raise HTTPException(status_code=404, detail="Food not found")

            new_food_id = matches[0]
            # Try to convert to int for USDA foods
            try:
                new_food_id = int(new_food_id)
            except (ValueError, TypeError):
                pass
        else:
            # Food didn't change, keep the same food_id
            new_food_id = original_component["food_id"]

    # Always recalculate grams based on the amount
    from src.routers.parse import estimate_grams
    weight_in_grams = await estimate_grams(food_name, amount)

    # Update the component
    updated_components = target_log["components"].copy()
    updated_components[component_index] = {
        "food_id": new_food_id,
        "amount": amount,
        "weight_in_grams": weight_in_grams
    }

    # Prepare the update data
    update_data = {"components": updated_components}

    # If this log has a recipe_id, unlink it from the recipe
    # When a user edits a component, they're customizing the meal, so it should no longer be linked to the recipe
    if target_log.get("recipe_id"):
        update_data["recipe_id"] = None

    # Update the log
    result = db.logs.update_one(
        {"_id": target_log["_id"]},
        {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=500, detail="Something went wrong; component not updated.")

    return {
        "status": "success",
        "message": "Component updated successfully",
        "weight_in_grams": weight_in_grams
    }
