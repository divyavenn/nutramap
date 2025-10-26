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
                                    "text": """Extract all nutritional information from this nutrition facts label.
                                    Return ONLY a JSON object with this exact format:
                                    {
                                      "nutrients": [
                                        {"name": "Energy", "amount": 250, "unit": "KCAL"},
                                        {"name": "Protein", "amount": 5.2, "unit": "G"},
                                        {"name": "Total lipid (fat)", "amount": 12.0, "unit": "G"},
                                        {"name": "Carbohydrate, by difference", "amount": 30.5, "unit": "G"}
                                      ]
                                    }

                                    Important:
                                    - All values should be per 100g
                                    - Use standard USDA nutrient names
                                    - Energy should be in KCAL
                                    - Use G for grams, MG for milligrams, UG for micrograms
                                    - Include as many nutrients as visible on the label
                                    - Return ONLY the JSON, no other text"""
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

        # Map nutrient names to IDs
        nutrients_with_ids = []
        for nutrient in result_nutrients:
            # Try to find matching nutrient in database
            nutrient_doc = db.nutrients.find_one({"nutrient_name": nutrient["name"]})
            if nutrient_doc:
                nutrients_with_ids.append({
                    "nutrient_id": nutrient_doc["_id"],
                    "name": nutrient["name"],
                    "amount": nutrient["amount"],
                    "unit": nutrient["unit"]
                })
            else:
                # If not found, still include it (frontend can handle)
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
        
        # Insert into foods collection
        result = db.foods.insert_one(food_doc)

        return {
            "status": "success",
            "food_id": str(result.inserted_id),
            "message": "Custom food added successfully"
        }
    
    except Exception as e:
        print(f"Error adding custom food: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error adding custom food: {str(e)}")
