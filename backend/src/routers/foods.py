from typing import Optional
from typing_extensions import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pymongo.database import Database
from bson import ObjectId
from decimal import Decimal
import os
import shutil
import uuid
import pickle
import asyncio
from datetime import datetime

# Import database connection
from ..databases.mongo import get_data

# Import authentication
from ..routers.auth import get_current_user

# Import food parsing and nutrient search functions
from ..routers.parse_food import parse_new_food
from ..routers.sparse_search_nutrients import search_nutrients_by_name

# Import parallel processing function
from ..routers.parallel import parallel_process


router = APIRouter(prefix='/food', tags=['food'])

# Directory for storing uploaded images
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# a table of nutrient_id with functional equivalents
# mapped to a list of equivalent nutrient_ids that should be included in their total mapped to conversion factor
convert_map = {1114: [{1110: 0.025}]}

async def process_nutrient_conversion(target_id_pair, convert_map, expanded_nutrient_ids, conversion_sources):
    """Process a single nutrient ID for conversion mapping"""
    target_id = target_id_pair
    if target_id in convert_map:
        # For each target nutrient, add all source nutrients to the expanded list
        for source_dict in convert_map[target_id]:
            for source_id in source_dict:
                if source_id not in expanded_nutrient_ids:
                    expanded_nutrient_ids.append(source_id)
                # Track which sources map to which targets and their conversion factors
                if target_id not in conversion_sources:
                    conversion_sources[target_id] = []
                conversion_sources[target_id].append((source_id, source_dict[source_id]))
    return target_id

async def apply_conversion(conversion_pair, tally):
    """Apply conversion factor to a single source-target pair"""
    target_id, sources = conversion_pair
    for source_id, conversion_factor in sources:
        if source_id in tally:
            # Convert the source amount and add it to the target
            converted_amount = tally[source_id] * conversion_factor
            if target_id in tally:
                tally[target_id] += converted_amount
            else:
                tally[target_id] = converted_amount
    return target_id

def consolidate_amounts(db, user_id, start_date: datetime, end_date: datetime, nutrient_ids: list):
    return asyncio.run(consolidate_amounts_async(db, user_id, start_date, end_date, nutrient_ids))

async def consolidate_amounts_async(db, user_id, start_date: datetime, end_date: datetime, nutrient_ids: list):

    expanded_nutrient_ids = nutrient_ids.copy()
    conversion_sources = {}
    
    # Process nutrient conversions in parallel
    await parallel_process(
        nutrient_ids, 
        process_nutrient_conversion, 
        [convert_map, expanded_nutrient_ids, conversion_sources]
    )
    
    # Step 2: Get the total nutrients for the expanded list
    tally = get_total_nutrients(db, user_id, start_date, end_date, expanded_nutrient_ids)
    
    # Step 3: Apply conversions and consolidate amounts in parallel
    if conversion_sources:
        conversion_items = list(conversion_sources.items())
        await parallel_process(
            conversion_items,
            apply_conversion,
            [tally]
        )
    
    # Step 4: Remove source nutrients that were only used for conversion
    # (only if they weren't in the original nutrient_ids list)
    final_tally = {}
    for nutrient_id in nutrient_ids:
        if nutrient_id in tally:
            final_tally[nutrient_id] = tally[nutrient_id]
        else:
            final_tally[nutrient_id] = 0
            
    return final_tally

def get_total_nutrients(db, user_id: str, start_date: datetime, end_date: datetime, nutrient_ids: list):
    # Updated pipeline to handle new log structure with components array
    pipeline = [
        {
            "$match": {
                "user_id": ObjectId(user_id),
                "date": {
                    "$gte": start_date,
                    "$lte": end_date
                }
            }
        },
        # Unwind the components array to process each food item
        { "$unwind": "$components" },
        {
            "$lookup": {
                "from": "foods",
                "localField": "components.food_id",
                "foreignField": "_id",
                "as": "food"
            }
        },
        { "$unwind": "$food" },
        { "$unwind": "$food.nutrients" },
        {
            "$match": {
                "food.nutrients.nutrient_id": { "$in": nutrient_ids }
            }
        },
        {
            "$project": {
                "nutrient_id": "$food.nutrients.nutrient_id",
                "scaled_amt": {
                    "$multiply": [
                        "$food.nutrients.amt",
                        { "$divide": ["$components.weight_in_grams", 100] }
                    ]
                }
            }
        },
        {
            "$group": {
                "_id": "$nutrient_id",
                "total": { "$sum": "$scaled_amt" }
            }
        }
    ]

    # Get the aggregation results
    results = list(db.logs.aggregate(pipeline))

    # Convert from list of dictionaries to a single dictionary
    tally = {}
    for result in results:
        tally[result["_id"]] = result["total"]

    # Initialize any missing nutrients to 0
    for nutrient_id in nutrient_ids:
        if nutrient_id not in tally:
            tally[nutrient_id] = 0

    return tally

@router.get("/panel", response_model=None)
async def get_nutrient_panel(log_id: str, db: Annotated[Database, Depends(get_data)] = None):
    log = db.logs.find_one({"_id": ObjectId(log_id)})
    if not log:
        return {}

    # Handle new log structure with components array
    if "components" in log and isinstance(log["components"], list):
        result = {}

        # Aggregate nutrients from all components
        for component in log["components"]:
            food_id = component.get("food_id")
            weight_in_grams = component.get("weight_in_grams", 0)

            if not food_id:
                continue

            food = db.foods.find_one({"_id": food_id}, {"nutrients": 1, "_id": 0})
            if not food or "nutrients" not in food:
                continue

            proration_factor = weight_in_grams / 100  # Assuming nutrients are per 100g

            for nutrient in food["nutrients"]:
                prorated_amount = nutrient["amt"] * proration_factor
                if prorated_amount > 0:
                    nutrient_id = nutrient["nutrient_id"]
                    result[nutrient_id] = result.get(nutrient_id, 0) + prorated_amount

        return result

    # Fallback for old log structure (backward compatibility)
    elif "food_id" in log:
        food = db.foods.find_one({"_id": log["food_id"]}, {"nutrients": 1, "_id": 0})
        if not food or "nutrients" not in food:
            return {}

        proration_factor = log.get("weight_in_grams", 0) / 100  # Assuming nutrients are per 100g
        result = {}

        for nutrient in food["nutrients"]:
            prorated_amount = nutrient["amt"] * proration_factor
            if prorated_amount > 0:
                result[nutrient["nutrient_id"]] = prorated_amount

        return result

    return {}

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

def get_food_name(food_id: int, db: Annotated[Database, Depends(get_data)] = None, request: Request = None):
    # Check app state first
    if request is not None and hasattr(request.app.state, 'id_name_map') and food_id in request.app.state.id_name_map:
        return request.app.state.id_name_map[food_id]
    
    # Then check pickle
    try:
        with open(os.getenv("FOOD_ID_CACHE"), 'rb') as f:
            foods = pickle.load(f)
            if food_id in foods:
                return foods[food_id]
    except (FileNotFoundError, pickle.UnpicklingError):
        pass
    
    # Finally, default to MongoDB query
    food = db.foods.find_one({"_id": food_id}, {"food_name": 1, "_id": 0})
    
    if not food:
        return "No data found."
    
    return food["food_name"]

def amount_by_weight(amt: float, grams: float):
  return Decimal(amt) * Decimal(grams/100.0)

async def retrieve_food_list(request: Request, db: Annotated[Database, Depends(get_data)] = None, user: Annotated[dict, Depends(get_current_user)] = None):
    # Check app state first
    if request is not None and hasattr(request.app.state, 'id_name_map'):
        return request.app.state.id_name_map

    # Then check pickle
    try:
        with open(os.getenv("FOOD_ID_CACHE"), 'rb') as f:
            foods = pickle.load(f)
            request.app.state.id_name_map = foods
            return foods
    except (FileNotFoundError, pickle.UnpicklingError):
        pass

    # Finally, default to MongoDB query using the parallel processing function
    id_name_map = await get_foods_list(db, user)
    
    # Store in app state and cache
    if not isinstance(id_name_map, JSONResponse):  # Make sure it's not an error response
        request.app.state.id_name_map = id_name_map
        with open(os.getenv("FOOD_ID_CACHE"), 'wb') as f:
            pickle.dump(id_name_map, f)
    
    return id_name_map



async def get_foods_list(db: Annotated[Database, Depends(get_data)] = None, user: Annotated[dict, Depends(get_current_user)] = None): 
  foods = list(db.foods.find(
        {"$or": [{"source": "USDA"}, {"source": user["_id"]}]},  # Match source "USDA" or user ID
        {"_id": 1, "food_name": 1, "source": 1}  # Retrieve only `_id` and `food_name`
    ).sort("_id", 1))
  if not foods:
      return JSONResponse(content={"message": "No data found."}, status_code=404)

  # Format the result as a dictionary
  return {food["_id"]: {"name": food["food_name"]} for food in foods}

async def food_embedding_map(db: Annotated[Database, Depends(get_data)] = None, user: Annotated[dict, Depends(get_current_user)] = None): 
  foods = []
  async for food in db.foods.find(
        {"$or": [{"source": "USDA"}, {"source": user["_id"]}]},  # Match source "USDA" or user ID
        {"_id": 1, "embedding": 1}  # Retrieve only `_id` and `embedding`
    ).sort("_id", 1):
      foods.append(food)
  if not foods:
      return JSONResponse(content={"message": "No data found."}, status_code=404)

   # Format the result as a dictionary
  return {food["_id"]: food["embedding"] for food in foods}

async def food_name_map(request: Request, db: Annotated[Database, Depends(get_data)] = None, user: Annotated[dict, Depends(get_current_user)] = None):
    id_name_map = await retrieve_food_list(request, db, user)
    
    # Swap keys and values: from {id: {name, source}} to {name: {id, source}}
    result = {{food_info['name']: food_id} for food_id, food_info in id_name_map.items()}

    return result

@router.get("/custom-foods")
async def get_custom_foods(
    db: Annotated[Database, Depends(get_data)] = None,
    user: Annotated[dict, Depends(get_current_user)] = None,
    request: Request = None
):
    # Query MongoDB for custom foods
    custom_foods = list(db.foods.find(
        {"source": user["_id"]},
        {"_id": 1, "food_name": 1, "nutrients": 1}
    ))

    # Format the result
    formatted_foods = [
        {
            "_id": str(food["_id"]),
            "name": food["food_name"],
            "nutrients": {
                str(nutrient["nutrient_id"]): nutrient["amt"]
                for nutrient in food.get("nutrients", [])
            }
        }
        for food in custom_foods
    ]

    return formatted_foods


@router.post("/add_custom_food")
async def add_custom_food(
    background_tasks: BackgroundTasks,
    request: Request, 
    food_description: str = Form(...),
    food_image: Optional[UploadFile] = File(None),
    db: Annotated[Database, Depends(get_data)] = None,
    user: Annotated[dict, Depends(get_current_user)] = None
):
    print("hi!")
    try:
        # Process image if provided
        image_path = None
        if food_image:
            # Create a unique filename
            file_extension = os.path.splitext(food_image.filename)[1]
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            image_path = os.path.join(UPLOAD_DIR, unique_filename)
            
            # Save the uploaded file
            with open(image_path, "wb") as buffer:
                shutil.copyfileobj(food_image.file, buffer)
        
        # Parse the food description and image to get nutrients
        food_name, nutrients = await parse_new_food(food_description, image_path)
        
        # Map nutrient names to IDs using the sparse search
        nutrient_data = []
        for nutrient in nutrients:
            nutrient_name = nutrient.get("nutrient_name")
            amount = nutrient.get("amount", 0)
            
            # Skip if no nutrient name or amount is zero
            if not nutrient_name or amount <= 0:
                continue
            
            # Search for nutrient ID
            matches = await search_nutrients_by_name(nutrient_name)
            if matches:
                # Get the best match (highest score)
                best_match_id = max(matches.items(), key=lambda x: x[1])[0]
                nutrient_data.append({
                    "nutrient_id": best_match_id,
                    "amount": amount
                })
        
        # Create food document
        food_doc = {
            "name": food_name,
            "description": food_description,
            "nutrients": nutrient_data,
            "user_id": str(user["_id"]),  # Convert ObjectId to string
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "is_custom": True
        }
        
        # Add image path if available
        if image_path:
            relative_path = os.path.relpath(image_path, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
            food_doc["image_path"] = relative_path
        
        # Insert into database - convert back to ObjectId for MongoDB
        doc_to_insert = food_doc.copy()
        doc_to_insert["user_id"] = ObjectId(food_doc["user_id"])
        result = db.foods.insert_one(doc_to_insert)
        
        # Return the created food
        food_doc["_id"] = str(result.inserted_id)
        
        return JSONResponse(
            status_code=201,
            content={
                "message": "Food added successfully",
                "food": food_doc
            }
        )
    
    except Exception as e:
        print(f"Error adding food: {e}")
        raise HTTPException(status_code=500, detail=f"Error adding food: {str(e)}")

@router.delete("/custom_foods/{food_id}")
async def delete_custom_food(
    food_id: str,
    db: Annotated[Database, Depends(get_data)] = None,
    user: Annotated[dict, Depends(get_current_user)] = None
):
    """
    Delete a custom food.
    
    Args:
        food_id: ID of the food to delete
        db: MongoDB database connection
        user: Current authenticated user
        
    Returns:
        Success message
    """
    try:
        # Find the food to delete
        food = await db.foods.find_one({"_id": ObjectId(food_id), "user_id": user["_id"]})
        
        if not food:
            raise HTTPException(status_code=404, detail="Food not found")
        
        # Delete the food
        result = await db.foods.delete_one({"_id": ObjectId(food_id), "user_id": user["_id"]})
        
        # Delete the image if it exists
        if "image_path" in food and food["image_path"]:
            image_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), food["image_path"])
            if os.path.exists(image_path):
                os.remove(image_path)
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Food not found")
        
        return {"message": "Food deleted successfully"}
    
    except Exception as e:
        print(f"Error deleting food: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting food: {str(e)}")

@router.put("/custom_foods/{food_id}")
async def update_custom_food(
    food_id: str,
    name: str,
    db: Annotated[Database, Depends(get_data)] = None,
    user: Annotated[dict, Depends(get_current_user)] = None
):
    """
    Update a custom food's name.
    
    Args:
        food_id: ID of the food to update
        name: New name for the food
        db: MongoDB database connection
        user: Current authenticated user
        
    Returns:
        Updated food document
    """
    try:
        # Find the food to update
        food = await db.foods.find_one({"_id": ObjectId(food_id), "user_id": user["_id"]})
        
        if not food:
            raise HTTPException(status_code=404, detail="Food not found")
        
        # Update the food
        result = await db.foods.update_one(
            {"_id": ObjectId(food_id), "user_id": user["_id"]},
            {"$set": {"name": name, "updated_at": datetime.utcnow()}}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Food not found")
        
        # Get the updated food
        updated_food = await db.foods.find_one({"_id": ObjectId(food_id)})
        updated_food["_id"] = str(updated_food["_id"])
        
        return updated_food
    
    except Exception as e:
        print(f"Error updating food: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating food: {str(e)}")

@router.get("/custom_foods/{food_id}")
async def get_custom_food(
    food_id: str,
    db: Annotated[Database, Depends(get_data)] = None,
    user: Annotated[dict, Depends(get_current_user)] = None
):
    """
    Get a specific food by ID.
    
    Args:
        food_id: ID of the food to get
        db: MongoDB database connection
        user: Current authenticated user
        
    Returns:
        Food document
    """
    try:
        # Find the food
        food = await db.foods.find_one({"_id": ObjectId(food_id)})
        
        if not food:
            raise HTTPException(status_code=404, detail="Food not found")
        
        # Convert ObjectId to string
        food["_id"] = str(food["_id"])
        
        return food
    
    except Exception as e:
        print(f"Error getting food: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting food: {str(e)}")
