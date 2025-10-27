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
            "name": food["food_name"],
            "nutrients": {
                str(nutrient["nutrient_id"]): nutrient["amt"]
                for nutrient in food.get("nutrients", [])
            }
        }
        for food in custom_foods
    ]

    return formatted_foods


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

        # For FAISS: Mark that a rebuild is needed
        # FAISS IndexFlat doesn't support efficient deletion - need to rebuild the entire index
        # Options:
        # 1. Rebuild immediately (expensive for large indexes)
        # 2. Mark as deleted and filter during search (implemented below)
        # 3. Schedule periodic rebuilds

        if request and hasattr(request.app.state, 'id_list'):
            id_list = request.app.state.id_list
            try:
                # Custom foods use ObjectId strings, USDA foods use integers
                # Check if this food_id is in the id_list (could be string or int)
                if food_id in id_list:
                    # We can't remove from FAISS directly, but we can update id_list
                    # The position in FAISS stays, but we mark it as deleted
                    idx = id_list.index(food_id)
                    # Replace with -1 to mark as deleted (filter during search)
                    id_list[idx] = -1
                    request.app.state.id_list = id_list
                    print(f"✓ Marked position {idx} as deleted in FAISS id_list")
                else:
                    print(f"⚠ Food ID {food_id} not found in FAISS id_list")

                # Update pickle cache
                food_id_cache_path = os.getenv("FOOD_ID_CACHE")
                if food_id_cache_path:
                    with open(food_id_cache_path, "rb") as f:
                        id_name_map = pickle.load(f)
                    # Remove using string key (works for both ObjectId strings and integer keys)
                    if food_id in id_name_map:
                        del id_name_map[food_id]
                        print(f"✓ Removed from food ID cache")
                    elif int(food_id) if food_id.isdigit() else None in id_name_map:
                        # Fallback: try as integer if string lookup fails
                        del id_name_map[int(food_id)]
                        print(f"✓ Removed from food ID cache (as integer)")
                    with open(food_id_cache_path, "wb") as f:
                        pickle.dump(id_name_map, f)
            except Exception as e:
                print(f"⚠ Warning: Could not update FAISS mappings: {e}")
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

        # Convert nutrients array to dict format {nutrient_id: amount}
        nutrients_dict = {}
        for n in nutrients_data:
            nutrients_dict[str(n["nutrient_id"])] = n["amt"]

        # Update the food
        result = db.foods.update_one(
            {"_id": ObjectId(food_id), "source": user["_id"]},
            {"$set": {"nutrients": nutrients_dict}}
        )

        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Food not found or no changes made")

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
        # Find the food
        food = db.foods.find_one({"_id": ObjectId(food_id)})

        if not food:
            raise HTTPException(status_code=404, detail="Food not found")

        # Convert ObjectId to string
        food["_id"] = str(food["_id"])

        return food

    except Exception as e:
        print(f"Error getting food: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting food: {str(e)}")

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
    name: str = Form(...),
    nutrients: str = Form("[]"),
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_data),
    request: Request = None
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
        embedding = None
        try:
            client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.embeddings.create(
                model="text-embedding-3-large",  # Must match FAISS index dimension
                input=name.lower().strip()
            )
            embedding = response.data[0].embedding
            print(f"✓ Generated embedding for custom food: {name}")
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

                    # Prepare embedding as numpy array
                    embedding_array = np.array([embedding], dtype=np.float32)
                    faiss.normalize_L2(embedding_array)  # Normalize for cosine similarity

                    # Check if index is trained (should always be true for IndexFlat)
                    if not faiss_index.is_trained:
                        print(f"⚠ Warning: FAISS index not trained, skipping add")
                    else:
                        # Add to FAISS index
                        faiss_index.add(embedding_array)
                        print(f"✓ Added embedding to FAISS index (new total: {faiss_index.ntotal})")

                        # Add food_id to the id_list (this maps FAISS index positions to food IDs)
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
                        except Exception as cache_error:
                            print(f"⚠ Warning: Could not update food ID cache: {cache_error}")

                        # Optionally persist to .bin file (can be done periodically instead)
                        try:
                            faiss_bin_path = os.getenv("FAISS_BIN")
                            if faiss_bin_path:
                                faiss.write_index(faiss_index, faiss_bin_path)
                                print(f"✓ Updated FAISS .bin file")
                        except Exception as bin_error:
                            print(f"⚠ Warning: Could not update FAISS .bin: {bin_error}")

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
