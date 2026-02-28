from typing import Optional
from typing_extensions import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pymongo.database import Database
from bson import ObjectId
from bson.errors import InvalidId
from decimal import Decimal
import os
import shutil
import uuid
import pickle
import asyncio
import json
from datetime import datetime
from openai import OpenAI
import numpy as np
import faiss

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

def serialize_bson(value):
    """Recursively convert BSON types (like ObjectId) to JSON-safe values."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {k: serialize_bson(v) for k, v in value.items()}
    if isinstance(value, list):
        return [serialize_bson(v) for v in value]
    return value

def normalize_nutrient_id(value):
    """Convert nutrient IDs to ints when possible, otherwise keep the original value."""
    if isinstance(value, int):
        return value
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return value

def normalize_nutrient_amount(value):
    """Normalize nutrient amounts to numeric values."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        return value
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0

def normalize_nutrients_to_list(nutrients):
    """
    Normalize nutrient payloads to list form:
    [{nutrient_id: int|str, amt: number}, ...]
    """
    if isinstance(nutrients, list):
        normalized = []
        for nutrient in nutrients:
            if not isinstance(nutrient, dict):
                continue
            if "nutrient_id" not in nutrient:
                continue
            nutrient_id = normalize_nutrient_id(nutrient.get("nutrient_id"))
            amount = nutrient.get("amt", nutrient.get("amount", 0))
            normalized.append({
                "nutrient_id": nutrient_id,
                "amt": normalize_nutrient_amount(amount),
            })
        return normalized

    if isinstance(nutrients, dict):
        return [
            {
                "nutrient_id": normalize_nutrient_id(nutrient_id),
                "amt": normalize_nutrient_amount(amount),
            }
            for nutrient_id, amount in nutrients.items()
        ]

    return []

def normalize_nutrients_to_dict(nutrients):
    """Normalize nutrient payloads to dict form: {nutrient_id: amount}."""
    normalized = {}
    for nutrient in normalize_nutrients_to_list(nutrients):
        nutrient_id = nutrient.get("nutrient_id")
        if nutrient_id is None:
            continue
        normalized[str(nutrient_id)] = nutrient.get("amt", 0)
    return normalized

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

@router.get("/nutrients", response_model=None)
async def get_food_nutrients(
    food_id: str,
    amount_in_grams: float,
    db: Annotated[Database, Depends(get_data)] = None
):
    """
    Get nutrients for a specific food with a given amount in grams.
    Supports both USDA foods (integer IDs) and custom foods (ObjectId strings).
    """
    try:
        # Convert string ObjectIds to ObjectId for custom foods, keep integers for USDA foods
        if isinstance(food_id, str) and len(food_id) == 24:
            # Custom food with ObjectId
            search_id = ObjectId(food_id)
        else:
            # USDA food with integer ID
            try:
                search_id = int(food_id)
            except ValueError:
                # If it's not a valid int or ObjectId, return empty
                return {}

        # Query the food
        food = db.foods.find_one({"_id": search_id}, {"nutrients": 1, "_id": 0})

        if not food or "nutrients" not in food:
            return {}

        # Calculate prorated amounts (nutrients are per 100g)
        proration_factor = amount_in_grams / 100
        result = {}

        for nutrient in food["nutrients"]:
            prorated_amount = nutrient["amt"] * proration_factor
            if prorated_amount > 0:
                result[nutrient["nutrient_id"]] = prorated_amount

        return result

    except Exception as e:
        print(f"Error getting food nutrients: {e}")
        import traceback
        traceback.print_exc()
        return {}

@router.get("/panel", response_model=None)
async def get_nutrient_panel(log_id: str, db: Annotated[Database, Depends(get_data)] = None):
    # Check if log_id is actually a component ID (format: "log_id-component_index")
    component_index = None
    actual_log_id = log_id

    if "-" in log_id:
        parts = log_id.split("-")
        # Check if the last part is a digit (component index)
        if len(parts) >= 2 and parts[-1].isdigit():
            component_index = int(parts[-1])
            # Reconstruct the log_id without the component index
            actual_log_id = "-".join(parts[:-1])

    log = db.logs.find_one({"_id": ObjectId(actual_log_id)})
    if not log:
        return {}

    # Handle new log structure with components array
    if "components" in log and isinstance(log["components"], list):
        result = {}

        # If component_index is specified, only show that component's nutrients
        if component_index is not None:
            if component_index < len(log["components"]):
                component = log["components"][component_index]
                food_id = component.get("food_id")
                weight_in_grams = component.get("weight_in_grams", 0)

                if food_id:
                    food = db.foods.find_one({"_id": food_id}, {"nutrients": 1, "_id": 0})
                    if food and "nutrients" in food:
                        proration_factor = weight_in_grams / 100

                        for nutrient in food["nutrients"]:
                            prorated_amount = nutrient["amt"] * proration_factor
                            if prorated_amount > 0:
                                result[nutrient["nutrient_id"]] = prorated_amount

            return result

        # Otherwise, aggregate nutrients from all components (full recipe)
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
    lookup_id = food_id
    if isinstance(food_id, str):
        stripped = food_id.strip()
        if stripped.isdigit():
            lookup_id = int(stripped)

    if request is not None and hasattr(request.app.state, 'id_name_map') and lookup_id in request.app.state.id_name_map:
        food_data = request.app.state.id_name_map[lookup_id]
        # Handle both dict format {"name": "..."} and string format
        return food_data["name"] if isinstance(food_data, dict) else food_data

    # Then check pickle
    try:
        cache_path = os.getenv("FOOD_ID_CACHE")
        if not cache_path:
            raise FileNotFoundError("FOOD_ID_CACHE is not configured")

        with open(cache_path, 'rb') as f:
            foods = pickle.load(f)
            if lookup_id in foods:
                food_data = foods[lookup_id]
                # Handle both dict format {"name": "..."} and string format
                return food_data["name"] if isinstance(food_data, dict) else food_data
    except (FileNotFoundError, pickle.UnpicklingError, TypeError, OSError) as e:
        print(f"Warning: Failed to load pickle cache: {e}")

    # Finally, default to MongoDB query
    # Convert IDs safely:
    # - numeric strings map to int USDA IDs
    # - 24-char ObjectId strings map to ObjectId
    # - invalid strings return "No data found." instead of throwing InvalidId
    query_id = lookup_id
    if isinstance(lookup_id, str):
        stripped = lookup_id.strip()
        if stripped.isdigit():
            query_id = int(stripped)
        elif len(stripped) == 24 and ObjectId.is_valid(stripped):
            query_id = ObjectId(stripped)
        else:
            print(f"Warning: Invalid food ID format: {food_id}")
            return "No data found."

    food = db.foods.find_one({"_id": query_id}, {"food_name": 1, "_id": 0})

    if not food:
        print(f"Warning: Food ID {food_id} not found in database")
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
  # Use regular for loop since pymongo cursors are synchronous
  foods = list(db.foods.find(
        {"$or": [{"source": "USDA"}, {"source": user["_id"]}]},  # Match source "USDA" or user ID
        {"_id": 1, "embedding": 1}  # Retrieve only `_id` and `embedding`
    ).sort("_id", 1))

  if not foods:
      return JSONResponse(content={"message": "No data found."}, status_code=404)

  # Format the result as a dictionary
  return {food["_id"]: food["embedding"] for food in foods}

async def food_name_map(request: Request, db: Annotated[Database, Depends(get_data)] = None, user: Annotated[dict, Depends(get_current_user)] = None):
    id_name_map = await retrieve_food_list(request, db, user)
    
    # Swap keys and values: from {id: {name, source}} to {name: {id, source}}
    result = {{food_info['name']: food_id} for food_id, food_info in id_name_map.items()}

    return result

async def get_user_custom_foods(db: Database, user: dict):
    """
    Get user's custom foods with descriptions.
    Returns a list of dictionaries with food_id and food_name.
    Used internally by parse_meal and other functions.
    """
    # Get user's custom food IDs
    user_doc = db.users.find_one({"_id": user["_id"]})
    if not user_doc or "custom_foods" not in user_doc:
        return []

    custom_food_ids = user_doc.get("custom_foods", [])

    if not custom_food_ids:
        return []

    # Convert string IDs to ObjectIds for query
    object_ids = [ObjectId(food_id) for food_id in custom_food_ids]

    # Query foods collection for these IDs
    custom_foods = list(db.foods.find(
        {"_id": {"$in": object_ids}},
        {"_id": 1, "food_name": 1}
    ))

    # Format result
    result = [
        {
            "food_id": str(food["_id"]),
            "food_name": food.get("food_name", "Unknown")
        }
        for food in custom_foods
    ]

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
            "name": food.get("food_name", ""),
            "nutrients": normalize_nutrients_to_dict(food.get("nutrients", [])),
        }
        for food in custom_foods
    ]

    return formatted_foods


@router.get("/custom_foods/{food_id}/used-in")
def get_food_usage(
    food_id: str,
    db: Database = Depends(get_data),
    user: dict = Depends(get_current_user),
):
    """Return the names of recipes that contain this custom food as a component."""
    food = db.foods.find_one({"_id": ObjectId(food_id), "source": user["_id"]})
    if not food:
        raise HTTPException(status_code=404, detail="Food not found")

    recipes = list(db.recipes.find(
        {"user_id": user["_id"], "components.food_id": food_id},
        {"description": 1, "_id": 0}
    ))
    recipe_names = [r.get("description", "Unknown recipe") for r in recipes]
    return {"recipe_names": recipe_names}


@router.delete("/custom_foods/{food_id}")
def delete_custom_food(
    food_id: str,
    db: Database = Depends(get_data),
    user: dict = Depends(get_current_user),
    request: Request = None
):
    """
    Delete a custom food and remove from search indexes.

    Args:
        food_id: ID of the food to delete
        db: MongoDB database connection
        user: Current authenticated user
        request: FastAPI request object for accessing app state

    Returns:
        Success message
    """
    try:
        # Find the food to delete (custom foods use 'source' field, not 'user_id')
        food = db.foods.find_one({"_id": ObjectId(food_id), "source": user["_id"]})

        if not food:
            raise HTTPException(status_code=404, detail="Food not found")

        # Delete the food from MongoDB
        result = db.foods.delete_one({"_id": ObjectId(food_id), "source": user["_id"]})

        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Food not found")

        # Remove food from any recipe components that reference it
        result_recipes = db.recipes.update_many(
            {"user_id": user["_id"], "components.food_id": food_id},
            {"$pull": {"components": {"food_id": food_id}}}
        )
        if result_recipes.modified_count:
            print(f"✓ Removed food {food_id} from {result_recipes.modified_count} recipe(s)")

        # Remove food_id from user's custom_foods array
        db.users.update_one(
            {"_id": ObjectId(user["_id"])},
            {"$pull": {"custom_foods": food_id}}
        )
        print(f"✓ Removed food_id {food_id} from user's custom_foods list")

        # Delete the image if it exists
        if "image_path" in food and food["image_path"]:
            image_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), food["image_path"])
            if os.path.exists(image_path):
                os.remove(image_path)

        # Remove from Typesense (sparse search) index
        try:
            from .sparse import _get_client as get_typesense_client

            typesense_client = get_typesense_client()
            if typesense_client:
                typesense_client.collections['foods'].documents[food_id].delete()
                print(f"✓ Removed food from Typesense index: {food_id}")
        except Exception as e:
            print(f"⚠ Warning: Could not remove from Typesense: {e}")

        # Remove from FAISS index incrementally using IndexIDMap
        try:
            from ..routers.dense import remove_from_faiss_index
            success = remove_from_faiss_index(food_id, request)
            if success:
                print(f"✓ Removed food from FAISS index: {food_id}")
            else:
                print(f"⚠ Could not remove from FAISS index, may need rebuild")
        except Exception as e:
            print(f"⚠ Warning: Error removing from FAISS index: {e}")
            import traceback
            traceback.print_exc()

        print(f"✓ Deleted custom food: {food.get('food_name', food_id)}")
        return {"message": "Food deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting food: {e}")
        import traceback
        traceback.print_exc()
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


@router.put("/update-nutrients/{food_id}")
def update_food_nutrients(
    food_id: str,
    nutrients: str = Form(...),
    db: Database = Depends(get_data),
    user: dict = Depends(get_current_user)
):
    """
    Update a custom food's nutrients.

    Args:
        food_id: ID of the food to update
        nutrients: JSON string of nutrient array [{"nutrient_id": int, "amt": float}, ...]
        db: MongoDB database connection
        user: Current authenticated user

    Returns:
        Success message
    """
    try:
        # Parse the nutrients JSON
        nutrients_data = json.loads(nutrients)

        # Keep nutrient storage consistent with foods collection:
        # [{nutrient_id, amt}, ...]
        nutrients_list = normalize_nutrients_to_list(nutrients_data)

        # Update the food
        result = db.foods.update_one(
            {"_id": ObjectId(food_id), "source": user["_id"]},
            {"$set": {"nutrients": nutrients_list}}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Food not found")

        return {"message": "Nutrients updated successfully"}

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for nutrients")
    except Exception as e:
        print(f"Error updating food nutrients: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating nutrients: {str(e)}")

@router.get("/all")
async def get_all_foods(db: Annotated[Database, Depends(get_data)] = None):
    """
    Get all foods as a dictionary mapping food names to food IDs.
    Used by frontend for autocomplete and caching.
    """
    try:
        foods = {}
        cursor = db.foods.find({}, {"_id": 1, "name": 1})
        async for food in cursor:
            foods[food["name"]] = food["_id"]
        return foods
    except Exception as e:
        print(f"Error fetching all foods: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/custom_foods/{food_id}")
def get_custom_food(
    food_id: str,
    db: Database = Depends(get_data),
    user: dict = Depends(get_current_user)
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
        object_id = ObjectId(food_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid food ID")

    try:
        # Find the food
        food = db.foods.find_one({"_id": object_id, "source": user["_id"]})

        if not food:
            raise HTTPException(status_code=404, detail="Food not found")

        return serialize_bson(food)

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting food: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting food: {str(e)}")

async def _process_and_add_food_bg(
    description: Optional[str],
    image_bytes_list: list,
    user: dict,
    db,
    request=None,
):
    """
    Background task: process food images (or text description) and save to the database.
    Called by /food/process_and_add so the HTTP connection can close immediately.
    """
    try:
        import openai as _openai
        import base64

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("Background food processing error: OPENAI_API_KEY not set")
            return

        client = _openai.OpenAI(api_key=api_key)

        def _clean_json(text: str) -> str:
            text = text.strip()
            if text.startswith("```"):
                nl = text.find("\n")
                if nl != -1:
                    text = text[nl + 1:]
                if text.endswith("```"):
                    text = text[:-3]
            return text.strip()

        result_description = description
        result_nutrients: list = []

        # ── Step 1: classify and analyse images ──────────────────────────────
        if image_bytes_list:
            label_b64s: list = []
            food_b64s: list = []

            for contents in image_bytes_list:
                b64 = base64.b64encode(contents).decode("utf-8")
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": [
                        {"type": "text", "text": "Is this image a nutrition facts label? Answer with only 'yes' or 'no'."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                    ]}],
                    max_tokens=10,
                    temperature=0,
                )
                cls = resp.choices[0].message.content.strip().lower()
                (label_b64s if "yes" in cls else food_b64s).append(b64)

            # Description from images if not supplied
            if not result_description:
                src = food_b64s if food_b64s else label_b64s
                if src:
                    resp = client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{"role": "user", "content": [
                            {"type": "text", "text": "Describe this food item in a concise phrase (e.g. 'Grilled chicken breast'). Return only the food name."},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{src[0]}"}},
                        ]}],
                        max_tokens=50,
                    )
                    result_description = resp.choices[0].message.content.strip()

            # Nutrition from labels
            if label_b64s:
                for b64 in label_b64s:
                    resp = client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{"role": "user", "content": [
                            {"type": "text", "text": (
                                "Extract all nutritional information from this nutrition facts label and convert to per 100g.\n\n"
                                "CRITICAL: (amount / serving_size_grams) * 100 for every nutrient.\n\n"
                                'Return ONLY JSON:\n{"serving_size":"33g","nutrients":[{"name":"Energy","amount":250,"unit":"KCAL"},...]}\n\n'
                                "Use standard USDA names. Energy in KCAL, G/MG/UG for mass. Return ONLY the JSON."
                            )},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                        ]}],
                        max_tokens=1000,
                        temperature=0,
                    )
                    try:
                        data = json.loads(_clean_json(resp.choices[0].message.content))
                        for n in data.get("nutrients", []):
                            existing = next((x for x in result_nutrients if x["name"] == n["name"]), None)
                            if existing:
                                existing["amount"] = (existing["amount"] + n["amount"]) / 2
                            else:
                                result_nutrients.append(n)
                    except json.JSONDecodeError as e:
                        print(f"Background food: failed to parse label JSON: {e}")

            elif food_b64s:
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": [
                        {"type": "text", "text": (
                            "Estimate nutritional content per 100g for this food.\n"
                            'Return ONLY JSON:\n{"nutrients":[{"name":"Energy","amount":250,"unit":"KCAL"},...]}\n'
                            "Use standard USDA names. Return ONLY the JSON."
                        )},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{food_b64s[0]}"}},
                    ]}],
                    max_tokens=1000,
                    temperature=0,
                )
                try:
                    data = json.loads(_clean_json(resp.choices[0].message.content))
                    result_nutrients = data.get("nutrients", [])
                except json.JSONDecodeError as e:
                    print(f"Background food: failed to parse food-image JSON: {e}")

        # ── Step 2: map nutrient names → IDs ─────────────────────────────────
        name_mappings = {
            "total fat": "Total lipid (fat)", "fat": "Total lipid (fat)",
            "total lipid (fat)": "Total lipid (fat)",
            "carbohydrates": "Carbohydrate, by difference",
            "carbohydrate, by difference": "Carbohydrate, by difference",
            "carbs": "Carbohydrate, by difference",
            "fiber": "Fiber, total dietary", "dietary fiber": "Fiber, total dietary",
            "sugars": "Sugars, total including NLEA",
            "protein": "Protein", "sodium": "Sodium, Na",
            "potassium": "Potassium, K", "iron": "Iron, Fe", "energy": "Energy",
        }
        nutrients_to_save: list = []
        for nutrient in result_nutrients:
            nutrient_name = nutrient["name"].lower().strip()
            doc = db.nutrients.find_one({"nutrient_name": {"$regex": f"^{nutrient['name']}$", "$options": "i"}})
            if not doc:
                mapped = name_mappings.get(nutrient_name)
                if mapped:
                    doc = db.nutrients.find_one({"nutrient_name": {"$regex": f"^{mapped}$", "$options": "i"}})
            if not doc:
                try:
                    results = await search_nutrients_by_name(nutrient["name"], db=db, threshold=0.5, limit=1)
                    if results:
                        best_id = max(results, key=results.get)
                        doc = db.nutrients.find_one({"_id": int(best_id)})
                except Exception as e:
                    print(f"Background food: hybrid search failed for '{nutrient['name']}': {e}")
            if doc:
                nutrients_to_save.append({"nutrient_id": doc["_id"], "amt": nutrient["amount"]})

        # ── Step 3: save food ─────────────────────────────────────────────────
        food_name = result_description or "Unknown food"
        embedding = None
        try:
            embed_resp = client.embeddings.create(
                model="text-embedding-3-large",
                input=food_name.lower().strip(),
            )
            embedding = embed_resp.data[0].embedding
            print(f"✓ Generated embedding for '{food_name}' ({len(embedding)} dims)")
        except Exception as e:
            print(f"Warning: could not generate embedding for '{food_name}': {e}")

        food_doc = {
            "_id": ObjectId(),
            "food_name": food_name,
            "nutrients": nutrients_to_save,
            "is_custom": True,
            "source": user["_id"],
            "created_at": datetime.now(),
        }
        if embedding:
            food_doc["embedding"] = embedding

        result = db.foods.insert_one(food_doc)
        food_id = str(result.inserted_id)

        db.users.update_one(
            {"_id": ObjectId(user["_id"])},
            {"$addToSet": {"custom_foods": food_id}},
        )
        print(f"✓ Added food to DB: {food_name} ({food_id})")

        # Add to search indexes
        if embedding:
            try:
                from .sparse import _get_client as _get_typesense
                tc = _get_typesense()
                if tc:
                    tc.collections["foods"].documents.create({"id": food_id, "food_name": food_name})
                    print(f"✓ Added to Typesense: {food_name}")
            except Exception as e:
                print(f"Warning: Typesense update failed: {e}")

            if request and hasattr(request.app.state, "faiss_index") and request.app.state.faiss_index is not None:
                try:
                    faiss_index = request.app.state.faiss_index
                    id_list = getattr(request.app.state, "id_list", [])
                    if len(embedding) == faiss_index.d:
                        emb_arr = np.array([embedding], dtype=np.float32)
                        faiss.normalize_L2(emb_arr)
                        faiss_id = hash(food_id) & 0x7FFFFFFFFFFFFFFF
                        faiss_index.add_with_ids(emb_arr, np.array([faiss_id], dtype=np.int64))
                        id_list.append(food_id)
                        request.app.state.id_list = id_list
                        faiss_bin_path = os.getenv("FAISS_BIN", "./faiss_index.bin")
                        faiss.write_index(faiss_index, faiss_bin_path)
                        food_id_cache_path = os.getenv("FOOD_ID_CACHE")
                        if food_id_cache_path:
                            with open(food_id_cache_path, "rb") as f:
                                id_name_map = pickle.load(f)
                            id_name_map[food_id] = {"name": food_name}
                            with open(food_id_cache_path, "wb") as f:
                                pickle.dump(id_name_map, f)
                        print(f"✓ Added to FAISS: {food_name}")
                except Exception as e:
                    print(f"Warning: FAISS update failed: {e}")

        print(f"✓ Background food processing complete: {food_name}")

    except Exception as e:
        print(f"Error in background food processing: {e}")
        import traceback
        traceback.print_exc()


@router.post("/process_and_add")
async def process_and_add_food(
    background_tasks: BackgroundTasks,
    description: Optional[str] = Form(None),
    images: list[UploadFile] = File([]),
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_data),
    request: Request = None,
):
    """
    Submit a food for processing and saving. Returns immediately (HTTP 200).
    Image processing and DB writes happen in a background task so the client
    can navigate away without interrupting the work.
    """
    # Read image bytes while the request is still open — UploadFile streams
    # are closed when the response is sent.
    image_bytes_list = [await img.read() for img in images]

    background_tasks.add_task(
        _process_and_add_food_bg,
        description,
        image_bytes_list,
        user,
        db,
        request,
    )

    return {"status": "processing"}


@router.post("/process_images")
async def process_food_images(
    description: Optional[str] = Form(None),
    images: list[UploadFile] = File([]),
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_data)
):
    """
    Process uploaded images to extract food description and nutrition information.

    - Accepts multiple images via the 'images' parameter
    - If description is provided, use it; otherwise generate from images
    - Detects which images are nutrition labels vs food photos
    - Extracts nutrition from labels, estimates from food photos
    - Returns: {description: str, nutrients: List[{nutrient_id, name, amount, unit}]}
    """
    try:
        import openai
        import base64
        import json

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key not configured")

        client = openai.OpenAI(api_key=api_key)

        result_description = description
        result_nutrients = []

        # If no images provided, return early
        if not images:
            return {
                "description": result_description or "Unknown food",
                "nutrients": []
            }

        # Helper function to encode image
        async def encode_image(upload_file: UploadFile) -> str:
            contents = await upload_file.read()
            return base64.b64encode(contents).decode('utf-8')

        # Helper function to clean JSON response (remove markdown code blocks)
        def clean_json_response(text: str) -> str:
            text = text.strip()
            # Remove markdown code blocks if present
            if text.startswith('```'):
                # Find the first newline after the opening ```
                first_newline = text.find('\n')
                if first_newline != -1:
                    text = text[first_newline + 1:]
                # Remove the closing ```
                if text.endswith('```'):
                    text = text[:-3]
            return text.strip()

        # Classify images as labels or food photos
        label_images = []
        food_images = []

        for img in images:
            base64_img = await encode_image(img)
            await img.seek(0)  # Reset file pointer

            # Ask GPT to classify the image
            classify_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Is this image a nutrition facts label? Answer with only 'yes' or 'no'."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_img}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=10,
                temperature=0
            )

            classification = classify_response.choices[0].message.content.strip().lower()

            if "yes" in classification:
                label_images.append((img, base64_img))
            else:
                food_images.append((img, base64_img))

        # Step 1: Generate description if not provided
        if not result_description:
            # Prefer food images for description, fall back to label images
            images_for_description = food_images if food_images else label_images

            if images_for_description:
                _, base64_image = images_for_description[0]

                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Describe this food item in a concise phrase (e.g., 'Homemade chocolate chip cookie with walnuts', 'Grilled chicken breast', etc.). Just return the food name, nothing else."
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{base64_image}"
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens=50
                )
                result_description = response.choices[0].message.content.strip()

        # Step 2: Extract nutrition from labels
        if label_images:
            for img, base64_label in label_images:
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": """Extract all nutritional information from this nutrition facts label and convert to per 100g.

                                    CRITICAL CONVERSION INSTRUCTIONS:
                                    1. First, identify the serving size on the label (e.g., "33g", "10g", "1 cup (240ml)")
                                    2. Convert ALL nutrient amounts to per 100g by calculating: (amount / serving_size_in_grams) * 100
                                    3. If serving size is in volume (cups, ml), estimate the weight (e.g., 1 cup = ~240g for liquids)

                                    Return ONLY a JSON object with this exact format:
                                    {
                                      "serving_size": "33g",
                                      "nutrients": [
                                        {"name": "Energy", "amount": 250, "unit": "KCAL"},
                                        {"name": "Protein", "amount": 5.2, "unit": "G"},
                                        {"name": "Total lipid (fat)", "amount": 12.0, "unit": "G"},
                                        {"name": "Carbohydrate, by difference", "amount": 30.5, "unit": "G"}
                                      ]
                                    }

                                    Important:
                                    - ALL nutrient values MUST be converted to per 100g
                                    - serving_size field is for reference only, shows the original serving size on the label
                                    - Use standard USDA nutrient names when possible
                                    - Energy should be in KCAL
                                    - Use G for grams, MG for milligrams, UG for micrograms
                                    - Include as many nutrients as visible on the label
                                    - Return ONLY the JSON, no other text

                                    Example: If label shows "Serving size: 33g, Protein: 3g", convert to per 100g: (3/33)*100 = 9.09g"""
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{base64_label}"
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens=1000,
                    temperature=0
                )

                # Parse JSON response
                try:
                    cleaned_response = clean_json_response(response.choices[0].message.content)
                    nutrition_json = json.loads(cleaned_response)
                    extracted_nutrients = nutrition_json.get("nutrients", [])

                    # Merge nutrients (if multiple labels, combine them)
                    for nutrient in extracted_nutrients:
                        existing = next((n for n in result_nutrients if n["name"] == nutrient["name"]), None)
                        if existing:
                            # Average the amounts if duplicate
                            existing["amount"] = (existing["amount"] + nutrient["amount"]) / 2
                        else:
                            result_nutrients.append(nutrient)

                except json.JSONDecodeError as e:
                    print(f"Failed to parse nutrition JSON: {response.choices[0].message.content}")
                    print(f"Error: {e}")

        # Step 3: Estimate nutrition from food images if no labels
        elif food_images:
            # Use the first food image for estimation
            _, base64_food = food_images[0]

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": """Estimate the nutritional content per 100g for this food.
                                Return ONLY a JSON object with this exact format:
                                {
                                  "nutrients": [
                                    {"name": "Energy", "amount": 250, "unit": "KCAL"},
                                    {"name": "Protein", "amount": 5.2, "unit": "G"},
                                    {"name": "Total lipid (fat)", "amount": 12.0, "unit": "G"},
                                    {"name": "Carbohydrate, by difference", "amount": 30.5, "unit": "G"}
                                  ]
                                }

                                Provide reasonable estimates for common nutrients (energy, protein, fat, carbs, fiber, sugar, sodium, etc.).
                                Use standard USDA nutrient names.
                                Return ONLY the JSON, no other text."""
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_food}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=1000,
                temperature=0
            )

            # Parse JSON response
            try:
                cleaned_response = clean_json_response(response.choices[0].message.content)
                nutrition_json = json.loads(cleaned_response)
                result_nutrients = nutrition_json.get("nutrients", [])
            except json.JSONDecodeError as e:
                print(f"Failed to parse nutrition JSON: {response.choices[0].message.content}")
                print(f"Error: {e}")

        # Map nutrient names to IDs with hybrid search
        from ..routers.sparse_search_nutrients import search_nutrients_by_name

        nutrients_with_ids = []
        for nutrient in result_nutrients:
            nutrient_name = nutrient["name"].lower().strip()

            # Step 1: Try exact match first
            nutrient_doc = db.nutrients.find_one({"nutrient_name": {"$regex": f"^{nutrient['name']}$", "$options": "i"}})

            # Step 2: If not found, try common name mappings
            if not nutrient_doc:
                name_mappings = {
                    "total fat": "Total lipid (fat)",
                    "total lipid (fat)": "Total lipid (fat)",
                    "fat": "Total lipid (fat)",
                    "carbohydrates": "Carbohydrate, by difference",
                    "carbohydrate, by difference": "Carbohydrate, by difference",
                    "carbs": "Carbohydrate, by difference",
                    "fiber": "Fiber, total dietary",
                    "dietary fiber": "Fiber, total dietary",
                    "sugars": "Sugars, total including NLEA",
                    "protein": "Protein",
                    "sodium": "Sodium, Na",
                    "potassium": "Potassium, K",
                    "iron": "Iron, Fe",
                    "energy": "Energy"
                }

                mapped_name = name_mappings.get(nutrient_name)
                if mapped_name:
                    nutrient_doc = db.nutrients.find_one({"nutrient_name": {"$regex": f"^{mapped_name}$", "$options": "i"}})

            # Step 3: If still not found, use hybrid vector search
            if not nutrient_doc:
                try:
                    search_results = await search_nutrients_by_name(nutrient["name"], db=db, threshold=0.5, limit=1)
                    if search_results:
                        # Get the top match
                        best_nutrient_id = max(search_results, key=search_results.get)
                        nutrient_doc = db.nutrients.find_one({"_id": int(best_nutrient_id)})
                        if nutrient_doc:
                            print(f"Matched '{nutrient['name']}' to '{nutrient_doc['nutrient_name']}' via hybrid search (score: {search_results[best_nutrient_id]:.2f})")
                except Exception as e:
                    print(f"Error during hybrid search for '{nutrient['name']}': {e}")

            if nutrient_doc:
                nutrients_with_ids.append({
                    "nutrient_id": nutrient_doc["_id"],
                    "name": nutrient_doc["nutrient_name"],  # Use database name
                    "amount": nutrient["amount"],
                    "unit": nutrient["unit"]
                })
            else:
                # If not found after all attempts, still include it
                print(f"Warning: Could not find nutrient '{nutrient['name']}' in database after all matching attempts")
                nutrients_with_ids.append({
                    "nutrient_id": -1,  # Unknown
                    "name": nutrient["name"],
                    "amount": nutrient["amount"],
                    "unit": nutrient["unit"]
                })

        return {
            "description": result_description or "Unknown food",
            "nutrients": nutrients_with_ids
        }

    except Exception as e:
        print(f"Error processing images: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing images: {str(e)}")


@router.post("/add_custom_food")
async def add_custom_food(
    request: Request,
    name: str = Form(...),
    nutrients: str = Form("[]"),
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_data)
):
    """
    Add a custom food with optional nutrition data.

    - name: Food name/description
    - nutrients: JSON string of nutrients array
    """
    try:
        import json

        # Parse nutrients JSON
        try:
            nutrients_list = json.loads(nutrients) if isinstance(nutrients, str) else nutrients
        except json.JSONDecodeError:
            nutrients_list = []

        # Generate embedding for the custom food name
        # Using OpenAI embeddings (3072 dims) to match FAISS index
        embedding = None

        try:
            # Use OpenAI API (3072 dimensions) - matches FAISS index
            client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.embeddings.create(
                model="text-embedding-3-large",
                input=name.lower().strip()
            )
            embedding = response.data[0].embedding
            print(f"✓ Generated OpenAI embedding for custom food: {name} ({len(embedding)} dims)")

        except Exception as e:
            print(f"⚠ Warning: Could not generate embedding for custom food '{name}': {e}")
            # Continue without embedding - food will still be added but won't appear in dense search

        # Create custom food document
        food_doc = {
            "_id": ObjectId(),
            "food_name": name,
            "nutrients": [
                {
                    "nutrient_id": n.get("nutrient_id", -1),
                    "amt": n.get("amount", 0)
                }
                for n in nutrients_list
                if n.get("nutrient_id", -1) != -1  # Only include mapped nutrients
            ],
            "is_custom": True,
            "source": user["_id"],
            "created_at": datetime.now()
        }

        # Add embedding if generated
        if embedding:
            food_doc["embedding"] = embedding

        # Insert into foods collection
        result = db.foods.insert_one(food_doc)
        food_id = str(result.inserted_id)

        # Add food_id to user's custom_foods array
        db.users.update_one(
            {"_id": ObjectId(user["_id"])},
            {"$addToSet": {"custom_foods": food_id}}
        )
        print(f"✓ Added food_id {food_id} to user's custom_foods list")

        # Add to search indexes immediately if embedding was generated
        if embedding:
            # 1. Add to Typesense (sparse search) index
            try:
                from .sparse import _get_client as get_typesense_client

                typesense_client = get_typesense_client()
                if typesense_client:
                    document = {
                        'id': food_id,
                        'food_name': name
                    }
                    typesense_client.collections['foods'].documents.create(document)
                    print(f"✓ Added custom food to Typesense index: {name}")
            except Exception as e:
                print(f"⚠ Warning: Could not add to Typesense: {e}")

            # 2. Add to FAISS (dense search) index
            try:
                # Get the FAISS index from app state
                if request and hasattr(request.app.state, 'faiss_index') and request.app.state.faiss_index is not None:
                    faiss_index = request.app.state.faiss_index
                    id_list = request.app.state.id_list if hasattr(request.app.state, 'id_list') else []

                    # Validate embedding dimension matches FAISS index
                    if len(embedding) != faiss_index.d:
                        print(f"⚠ Warning: Embedding dimension mismatch! Embedding: {len(embedding)} dims, FAISS index: {faiss_index.d} dims")
                        print(f"⚠ Skipping FAISS index add. Food will be searchable via Typesense only.")
                        raise ValueError(f"Dimension mismatch: {len(embedding)} != {faiss_index.d}")

                    # Prepare embedding as numpy array
                    embedding_array = np.array([embedding], dtype=np.float32)
                    faiss.normalize_L2(embedding_array)  # Normalize for cosine similarity

                    # Check if index is trained (should always be true for IndexFlat)
                    if not faiss_index.is_trained:
                        print(f"⚠ Warning: FAISS index not trained, skipping add")
                    else:
                        # Add to FAISS index with ID (required for IndexIDMap)
                        # Generate FAISS ID for this custom food (same logic as in dense.py)
                        faiss_id = hash(food_id) & 0x7FFFFFFFFFFFFFFF  # Hash ObjectId string, ensure positive int64
                        id_array = np.array([faiss_id], dtype=np.int64)

                        faiss_index.add_with_ids(embedding_array, id_array)
                        print(f"✓ Added embedding to FAISS index with ID {faiss_id} (new total: {faiss_index.ntotal})")

                        # Add food_id to the id_list (this maps FAISS IDs to food IDs)
                        # Custom foods use ObjectId strings, so store as string
                        id_list.append(food_id)
                        request.app.state.id_list = id_list
                        print(f"✓ Updated id_list in app.state (new length: {len(id_list)})")

                        # Update the cached pickle file
                        try:
                            food_id_cache_path = os.getenv("FOOD_ID_CACHE")
                            if food_id_cache_path:
                                with open(food_id_cache_path, "rb") as f:
                                    id_name_map = pickle.load(f)
                                # Store with string key for custom foods (ObjectId)
                                id_name_map[food_id] = {"name": name}
                                with open(food_id_cache_path, "wb") as f:
                                    pickle.dump(id_name_map, f)
                                print(f"✓ Updated food ID cache with {food_id}")
                        except Exception as cache_error:
                            print(f"⚠ Warning: Could not update food ID cache: {cache_error}")

                        # Persist to .bin file for durability
                        try:
                            faiss_bin_path = os.getenv("FAISS_BIN", "./faiss_index.bin")
                            faiss.write_index(faiss_index, faiss_bin_path)
                            print(f"✓ Persisted FAISS index to {faiss_bin_path}")
                        except Exception as bin_error:
                            print(f"⚠ Warning: Could not persist FAISS index: {bin_error}")

                        print(f"✓ Added custom food to FAISS index: {name} (index now has {faiss_index.ntotal} vectors)")
                else:
                    print(f"⚠ Warning: FAISS index not available in app state (will be included in next rebuild)")
            except Exception as e:
                print(f"⚠ Warning: Could not add to FAISS index: {e}")
                import traceback
                traceback.print_exc()

        return {
            "status": "success",
            "food_id": food_id,
            "message": "Custom food added successfully"
        }

    except Exception as e:
        print(f"Error adding custom food: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error adding custom food: {str(e)}")


@router.post("/rebuild-index")
async def rebuild_faiss_index(
    request: Request,
    db: Annotated[Database, Depends(get_data)]
):
    """
    Rebuild both food and nutrient FAISS indexes from scratch.
    Updates all bin files and .pkl caches, then verifies with test queries.
    Use this after deleting custom foods or when the index is out of sync.

    No authentication required - this is a system maintenance endpoint.
    """
    try:
        print("\n" + "="*70)
        print("REBUILDING FAISS INDEXES (FOODS + NUTRIENTS)")
        print("="*70)

        # Import the update function and search functions from dense router
        from ..routers.dense import update_faiss_index, find_dense_matches, find_dense_nutrient_matches

        # Rebuild both food and nutrient indexes
        # This function already:
        # - Builds food index and saves to FAISS_BIN
        # - Builds nutrient index and saves to NUTRIENT_FAISS_BIN
        # - Updates food ID cache (FOOD_ID_CACHE .pkl)
        # - Updates nutrient ID cache (NUTRIENT_ID_CACHE .pkl)
        # - Updates app.state for both indexes
        food_index, _ = await update_faiss_index(db=db, user=None, request=request)

        if food_index is None:
            raise Exception("Failed to build FAISS indexes")

        print("\n" + "="*70)
        print("VERIFYING REBUILD WITH TEST QUERIES")
        print("="*70)

        # Test query 1: Search for "bagel" in foods
        print("\n[TEST 1] Searching for 'bagel' in foods...")
        bagel_results = await find_dense_matches(
            text="bagel",
            db=db,
            user=None,
            request=request,
            threshold=40,
            limit=5
        )

        bagel_success = len(bagel_results) > 0
        bagel_top_match = None
        if bagel_success:
            # Get the top match details
            top_id = max(bagel_results, key=bagel_results.get)
            top_score = bagel_results[top_id]
            food_doc = db.foods.find_one({"_id": top_id}, {"food_name": 1})
            bagel_top_match = {
                "id": str(top_id),
                "name": food_doc.get("food_name", "Unknown") if food_doc else "Unknown",
                "score": top_score
            }
            print(f"✓ Found {len(bagel_results)} results. Top match: '{bagel_top_match['name']}' (score: {top_score})")
        else:
            print("✗ No results found for 'bagel'")

        # Test query 2: Search for "protein" in nutrients
        print("\n[TEST 2] Searching for 'protein' in nutrients...")
        protein_results = await find_dense_nutrient_matches(
            text="protein",
            db=db,
            request=request,
            threshold=30,  # Lower threshold for better matches
            limit=5
        )

        protein_success = len(protein_results) > 0
        protein_top_match = None
        if protein_success:
            # Get the top match details
            top_id = max(protein_results, key=protein_results.get)
            top_score = protein_results[top_id]
            nutrient_doc = db.nutrients.find_one({"_id": int(top_id)}, {"nutrient_name": 1})
            protein_top_match = {
                "id": str(top_id),
                "name": nutrient_doc.get("nutrient_name", "Unknown") if nutrient_doc else "Unknown",
                "score": top_score
            }
            print(f"✓ Found {len(protein_results)} results. Top match: '{protein_top_match['name']}' (score: {top_score})")
        else:
            print("✗ No results found for 'protein'")

        # Overall verification status
        verification_passed = bagel_success and protein_success

        print("\n" + "="*70)
        if verification_passed:
            print("✓ ALL TESTS PASSED - INDEXES REBUILT AND VERIFIED SUCCESSFULLY")
        else:
            print("⚠ VERIFICATION INCOMPLETE - Some tests failed")
        print("="*70 + "\n")

        return {
            "status": "success" if verification_passed else "partial_success",
            "message": "FAISS indexes rebuilt successfully" if verification_passed else "Indexes rebuilt but verification had issues",
            "indexes_rebuilt": {
                "food_index": {
                    "vectors": food_index.ntotal,
                    "bin_file": os.getenv("FAISS_BIN", "faiss_index.bin"),
                    "cache_file": os.getenv("FOOD_ID_CACHE", "food_ids.pkl")
                },
                "nutrient_index": {
                    "bin_file": os.getenv("NUTRIENT_FAISS_BIN", "nutrient_faiss_index.bin"),
                    "cache_file": os.getenv("NUTRIENT_ID_CACHE", "nutrient_ids.pkl")
                }
            },
            "verification": {
                "overall_passed": verification_passed,
                "bagel_test": {
                    "passed": bagel_success,
                    "results_count": len(bagel_results),
                    "top_match": bagel_top_match
                },
                "protein_test": {
                    "passed": protein_success,
                    "results_count": len(protein_results),
                    "top_match": protein_top_match
                }
            }
        }

    except Exception as e:
        print(f"Error rebuilding FAISS indexes: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error rebuilding indexes: {str(e)}")
