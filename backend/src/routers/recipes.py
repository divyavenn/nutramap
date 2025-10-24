from fastapi import APIRouter, Depends, HTTPException, Form
from pymongo.database import Database
from typing import List, Dict, Optional, Tuple
from typing_extensions import Annotated
from bson import ObjectId
from datetime import datetime
import uuid
import numpy as np
import os
from openai import OpenAI
from dotenv import load_dotenv
import json

from src.databases.mongo import get_data
from src.databases.mongo_models import UserRecipe, RecipeIngredient
from src.routers.auth import get_current_user
from src.routers.parse import estimate_grams
from src.routers.logs import add_log
from src.routers.match import get_matches, rrf_fusion
from src.routers.foods import get_food_name

__package__ = "nutramap.routers"

router = APIRouter(
    prefix='/recipes',
    tags=['recipes']
)

user = Annotated[dict, Depends(get_current_user)]
db = Annotated[Database, Depends(get_data)]

# Load environment variables
load_dotenv()

# Lazy OpenAI client initialization
_client = None

def _get_client():
    """Get OpenAI client, initializing if needed"""
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        _client = OpenAI(api_key=api_key)
    return _client

response_format = {"type": "json_object"}


async def generate_recipe_embedding(description: str) -> List[float]:
    """Generate OpenAI embedding for recipe description"""
    try:
        client = _get_client()
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=description.lower().strip()
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"Error generating embedding: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate embedding: {str(e)}")


def cosine_similarity(embedding1: List[float], embedding2: List[float]) -> float:
    """Calculate cosine similarity between two embeddings"""
    vec1 = np.array(embedding1)
    vec2 = np.array(embedding2)
    return float(np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2)))


async def find_similar_recipes(
    user_id: ObjectId,
    embedding: List[float],
    db: Database,
    threshold: float = 0.85
) -> List[dict]:
    """Find user's recipes with similarity above threshold"""
    user_doc = db.users.find_one({"_id": user_id})
    if not user_doc or "recipes" not in user_doc:
        return []

    matches = []
    for recipe in user_doc.get("recipes", []):
        if "embedding" in recipe:
            similarity = cosine_similarity(embedding, recipe["embedding"])
            if similarity >= threshold:
                matches.append({
                    "recipe_id": recipe["recipe_id"],
                    "description": recipe["description"],
                    "similarity_score": similarity,
                    "ingredients": recipe["ingredients"]
                })

    # Sort by similarity score descending
    matches.sort(key=lambda x: x["similarity_score"], reverse=True)
    return matches


async def match_ingredient_to_food_id(ingredient_name: str, db: Database, user: dict) -> Optional[int]:
    """Match ingredient name to food_id using hybrid vector search (sparse + dense + RRF)"""
    try:
        print(f"Matching ingredient: '{ingredient_name}'")
        # Use the hybrid search from match.py
        sparse_results, dense_results = await get_matches(
            {"food_name": ingredient_name},
            db,
            user,
            request=None,  # No request object in this context
            k=30
        )

        print(f"  Sparse results: {len(sparse_results)} matches")
        print(f"  Dense results: {len(dense_results)} matches")

        # Get the top match using RRF
        matches = await rrf_fusion(sparse_results, dense_results, k=30, n=1)

        if matches and len(matches) > 0:
            matched_food_id = int(matches[0])
            matched_food_name = get_food_name(matched_food_id, db, None)
            print(f"  ✓ Matched to: {matched_food_name} (ID: {matched_food_id})")
            return matched_food_id

        print(f"  ✗ No match found for '{ingredient_name}'")
        return None
    except Exception as e:
        print(f"Error matching ingredient '{ingredient_name}': {e}")
        import traceback
        traceback.print_exc()
        return None


async def parse_recipe_into_ingredients(recipe_description: str) -> List[dict]:
    """Use GPT-4 to break recipe into ingredients with portions"""
    try:
        client = _get_client()

        prompt = f"""Break down this recipe into individual ingredients with portions.

Recipe: {recipe_description}

Guidelines:
- List ALL ingredients typically used in this recipe
- Use natural portions (cups, tablespoons, teaspoons, pinches, pieces, etc.)
- Be specific about ingredient preparation (cooked, raw, drained, chopped, etc.)
- Use realistic portions for a single serving

Respond with ONLY a JSON object in this format:
{{
  "ingredients": [
    {{
      "food_name": "ingredient name with preparation details",
      "amount": "natural portion (e.g., 1 cup, 2 tablespoons)"
    }},
    ...
  ]
}}

Examples:
- "1 cup yellow lentils, cooked"
- "2 tablespoons olive oil"
- "1 teaspoon cumin seeds"
- "1 medium onion, chopped"
"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": recipe_description}
            ],
            response_format=response_format
        )

        result = json.loads(response.choices[0].message.content)
        return result.get("ingredients", [])

    except Exception as e:
        print(f"Error parsing recipe: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse recipe: {str(e)}")


async def identify_recipes_from_meal(meal_description: str, user_recipes: List[dict]) -> List[dict]:
    """Use GPT-4 to identify recipes in meal description and match to existing recipes"""
    try:
        client = _get_client()

        # Prepare context with top 30 user recipes
        recipes_context = ""
        if user_recipes:
            recipes_context = "User's existing recipes:\n"
            for idx, recipe in enumerate(user_recipes[:30], 1):
                recipes_context += f"{idx}. {recipe['description']} (ID: {recipe['recipe_id']})\n"

        prompt = f"""Parse this meal description into separate recipes/dishes.

{recipes_context}

Meal description: {meal_description}

Instructions:
1. Identify distinct recipes/dishes in the meal
2. For each recipe, determine if it matches an existing recipe from the user's list (high similarity)
3. If it matches, use the recipe_id
4. If it's new, set recipe_id to null and estimate ingredients
5. Estimate number of servings consumed

Respond with ONLY a JSON object:
{{
  "recipes": [
    {{
      "recipe_id": "uuid or null for new recipes",
      "description": "recipe name",
      "recipe_servings": number (0.5 for half serving, 1 for full, etc.),
      "ingredients": [
        {{
          "food_name": "ingredient name",
          "amount": "portion size",
          "weight_in_grams": estimated_weight
        }}
      ] (only for new recipes, empty array if matched existing)
    }}
  ]
}}

Examples:
Input: "half a pot of homemade daal, 1 mug hot chocolate with collagen, 2 slices veggie pizza from PiCo"
Output:
{{
  "recipes": [
    {{
      "recipe_id": "123-existing-id",
      "description": "homemade daal",
      "recipe_servings": 0.5,
      "ingredients": []
    }},
    {{
      "recipe_id": null,
      "description": "hot chocolate with collagen peptides",
      "recipe_servings": 1,
      "ingredients": [
        {{"food_name": "Milk, whole, 3.25%", "amount": "1 cup", "weight_in_grams": 244}},
        {{"food_name": "Cocoa powder, unsweetened", "amount": "2 tablespoons", "weight_in_grams": 11}},
        {{"food_name": "Collagen peptides", "amount": "1 scoop", "weight_in_grams": 20}}
      ]
    }},
    {{
      "recipe_id": null,
      "description": "PiCo veggie pizza",
      "recipe_servings": 0.17,
      "ingredients": [
        {{"food_name": "Pizza dough", "amount": "2 slices", "weight_in_grams": 150}},
        {{"food_name": "Mozzarella cheese, shredded", "amount": "1/4 cup", "weight_in_grams": 28}},
        {{"food_name": "Tomato sauce", "amount": "2 tablespoons", "weight_in_grams": 30}},
        {{"food_name": "Bell peppers, chopped", "amount": "1/4 cup", "weight_in_grams": 37}}
      ]
    }}
  ]
}}
"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": meal_description}
            ],
            response_format=response_format
        )

        result = json.loads(response.choices[0].message.content)
        return result.get("recipes", [])

    except Exception as e:
        print(f"Error identifying recipes: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to identify recipes: {str(e)}")


@router.post("/parse-meal")
async def parse_meal(
    user: user,
    db: db,
    meal_description: str = Form(...),
    date: str = Form(None)
):
    """
    Parse a meal description into recipes and their ingredients.
    Creates logs for all ingredients.
    """
    try:
        print(f"=== parse_meal called ===")
        print(f"meal_description: {meal_description}")
        print(f"date: {date}")
        print(f"user: {user['_id']}")

        # Handle ISO format with Z timezone indicator
        if date:
            # Replace 'Z' with '+00:00' for proper ISO format parsing
            date_str = date.replace('Z', '+00:00')
            meal_date = datetime.fromisoformat(date_str)
        else:
            meal_date = datetime.now()

        print(f"meal_date: {meal_date}")

        # Get user's existing recipes
        user_doc = db.users.find_one({"_id": user["_id"]})
        user_recipes = user_doc.get("recipes", []) if user_doc else []

        # Identify recipes in the meal
        identified_recipes = await identify_recipes_from_meal(meal_description, user_recipes)
        print(f"identified_recipes: {identified_recipes}")

        result_recipes = []

        for recipe_data in identified_recipes:
            recipe_id = recipe_data.get("recipe_id")
            description = recipe_data["description"]
            servings = recipe_data.get("recipe_servings", 1.0)

            # Check if this matches an existing recipe
            if recipe_id:
                # Find the existing recipe
                existing_recipe = next(
                    (r for r in user_recipes if r["recipe_id"] == recipe_id),
                    None
                )

                if existing_recipe:
                    # Use existing recipe's ingredients (no need to run RRF again!)
                    ingredients_to_log = existing_recipe["ingredients"]
                    matched_existing = True
                    print(f"✓ Using cached recipe '{description}' with {len(ingredients_to_log)} ingredients")
                else:
                    # Recipe ID not found, treat as new
                    recipe_id = None
                    ingredients_to_log = recipe_data.get("ingredients", [])
                    matched_existing = False
            else:
                # New recipe - generate UUID and create it
                recipe_id = str(uuid.uuid4())
                ingredients_to_log = recipe_data.get("ingredients", [])
                matched_existing = False

                # If no ingredients provided, generate them
                if not ingredients_to_log:
                    print(f"→ New recipe '{description}' - running ingredient matching...")
                    parsed_ingredients = await parse_recipe_into_ingredients(description)
                    ingredients_to_log = []

                    for ing in parsed_ingredients:
                        food_id = await match_ingredient_to_food_id(ing["food_name"], db, user)
                        if food_id:
                            weight = await estimate_grams(ing["food_name"], ing["amount"])
                            # Get the actual food name from the database for the matched food_id
                            matched_food_name = get_food_name(food_id, db, None)
                            ingredients_to_log.append({
                                "food_id": food_id,
                                "food_name": matched_food_name,
                                "amount": ing["amount"],
                                "weight_in_grams": weight
                            })

                # Generate embedding
                embedding = await generate_recipe_embedding(description)

                # Create new recipe in user's recipes
                new_recipe = {
                    "recipe_id": recipe_id,
                    "description": description,
                    "embedding": embedding,
                    "ingredients": ingredients_to_log,
                    "created_at": datetime.now(),
                    "updated_at": datetime.now()
                }

                # Add to user's recipes
                db.users.update_one(
                    {"_id": user["_id"]},
                    {"$push": {"recipes": new_recipe}}
                )

            # Create a single log entry with all ingredients as components
            print(f"Creating log for recipe '{description}' with {len(ingredients_to_log)} ingredients")

            # Prepare components with actual amounts based on servings
            components = []
            for ingredient in ingredients_to_log:
                # Match food_id if not already present
                food_id = ingredient.get("food_id")
                if not food_id and "food_name" in ingredient:
                    food_id = await match_ingredient_to_food_id(ingredient["food_name"], db, user)

                if food_id:
                    # Calculate actual amount based on servings
                    actual_weight = ingredient["weight_in_grams"] * servings
                    components.append({
                        "food_id": food_id,
                        "amount": ingredient["amount"],
                        "weight_in_grams": actual_weight
                    })
                    print(f"  Component: food_id={food_id}, amount={ingredient['amount']}, weight={actual_weight}")
                else:
                    print(f"  Skipping ingredient (no food_id found): {ingredient}")

            # Only create log if we have at least one valid component
            if components:
                log_dict = {
                    "recipe_id": recipe_id if matched_existing else None,
                    "recipe_name": description,
                    "servings": servings,
                    "date": meal_date,
                    "components": components,
                    "user_id": user["_id"],
                    "_id": ObjectId()
                }

                print(f"Creating log: {len(components)} components, {servings} servings")
                await add_log(user, log_dict, db)

            result_recipes.append({
                "recipe_id": recipe_id,
                "description": description,
                "matched_existing": matched_existing,
                "recipe_servings": servings,
                "components": components
            })

        response_data = {
            "status": "success",
            "recipes": result_recipes,
            "created_logs_count": len(result_recipes),  # Now one log per recipe
            "new_recipes_count": sum(1 for r in result_recipes if not r["matched_existing"])
        }
        print(f"=== parse_meal completed successfully ===")
        print(f"Response: {response_data}")
        return response_data

    except Exception as e:
        import traceback
        print(f"Error in parse_meal: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/migrate-food-names")
async def migrate_recipe_food_names(user: user, db: db):
    """
    Migration endpoint to add food_name to existing recipe ingredients
    that only have food_id
    """
    try:
        user_doc = db.users.find_one({"_id": user["_id"]})
        if not user_doc or "recipes" not in user_doc:
            return {"status": "no_recipes", "message": "No recipes found"}

        recipes = user_doc.get("recipes", [])
        updated_count = 0

        for recipe in recipes:
            updated_ingredients = []
            needs_update = False

            for ingredient in recipe.get("ingredients", []):
                # Check if food_name is missing
                if "food_id" in ingredient and "food_name" not in ingredient:
                    needs_update = True
                    food_name = get_food_name(ingredient["food_id"], db, None)
                    updated_ingredients.append({
                        **ingredient,
                        "food_name": food_name
                    })
                else:
                    updated_ingredients.append(ingredient)

            # Update the recipe if needed
            if needs_update:
                db.users.update_one(
                    {"_id": user["_id"], "recipes.recipe_id": recipe["recipe_id"]},
                    {"$set": {"recipes.$.ingredients": updated_ingredients}}
                )
                updated_count += 1

        return {
            "status": "success",
            "updated_recipes": updated_count,
            "total_recipes": len(recipes)
        }

    except Exception as e:
        print(f"Error migrating recipe food names: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
def list_recipes(user: user, db: db):
    """Get all user recipes sorted alphabetically"""
    user_doc = db.users.find_one({"_id": user["_id"]})
    recipes = user_doc.get("recipes", []) if user_doc else []

    # Calculate usage count for each recipe
    for recipe in recipes:
        usage_count = db.logs.count_documents({
            "user_id": user["_id"],
            "recipe_id": recipe["recipe_id"]
        })
        recipe["usage_count"] = usage_count

    # Sort alphabetically by description
    recipes.sort(key=lambda r: r["description"].lower())

    # Remove embeddings from response (too large)
    for recipe in recipes:
        recipe.pop("embedding", None)

    return {"recipes": recipes}


@router.post("/update-ingredients")
async def update_recipe_ingredients(
    user: user,
    db: db,
    recipe_id: str = Form(...),
    ingredients: str = Form(...)  # JSON string
):
    """Update a recipe's ingredients"""
    try:
        ingredients_list = json.loads(ingredients)

        # Update the recipe
        result = db.users.update_one(
            {"_id": user["_id"], "recipes.recipe_id": recipe_id},
            {
                "$set": {
                    "recipes.$.ingredients": ingredients_list,
                    "recipes.$.updated_at": datetime.now()
                }
            }
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Recipe not found")

        return {"status": "success", "recipe_id": recipe_id}

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid ingredients JSON")
    except Exception as e:
        print(f"Error updating recipe: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete")
def delete_recipe(user: user, db: db, recipe_id: str):
    """Delete a recipe and unlink its logs"""
    # Remove recipe from user's recipes
    result = db.users.update_one(
        {"_id": user["_id"]},
        {"$pull": {"recipes": {"recipe_id": recipe_id}}}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")

    # Unlink all logs with this recipe_id
    unlink_result = db.logs.update_many(
        {"user_id": user["_id"], "recipe_id": recipe_id},
        {"$set": {"recipe_id": None, "recipe_servings": None}}
    )

    return {
        "status": "success",
        "unlinked_logs": unlink_result.modified_count
    }


@router.post("/create")
async def create_recipe(
    user: user,
    db: db,
    description: str = Form(...),
    ingredients: str = Form(...)  # JSON string of ingredients
):
    """
    Manually create a new recipe.
    Used in the MyRecipes page when users want to add a recipe manually.
    """
    try:
        ingredients_list = json.loads(ingredients)

        # Validate ingredients structure
        if not isinstance(ingredients_list, list):
            raise HTTPException(status_code=400, detail="Ingredients must be a list")

        # Process ingredients - match food_ids and calculate weights if needed
        processed_ingredients = []
        for ing in ingredients_list:
            food_id = ing.get("food_id")
            amount = ing.get("amount")
            weight_in_grams = ing.get("weight_in_grams")

            # If food_id not provided but food_name is, try to match
            if not food_id and "food_name" in ing:
                food_id = await match_ingredient_to_food_id(ing["food_name"], db, user)
                if not food_id:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Could not find food: {ing['food_name']}"
                    )

            # If weight not provided, estimate from amount
            if not weight_in_grams and amount:
                food = db.foods.find_one({"_id": food_id})
                food_name = food["name"] if food else "unknown"
                weight_in_grams = await estimate_grams(food_name, amount)

            processed_ingredients.append({
                "food_id": food_id,
                "amount": amount,
                "weight_in_grams": float(weight_in_grams)
            })

        # Generate recipe ID and embedding
        recipe_id = str(uuid.uuid4())
        embedding = await generate_recipe_embedding(description)

        # Create recipe document
        new_recipe = {
            "recipe_id": recipe_id,
            "description": description,
            "embedding": embedding,
            "ingredients": processed_ingredients,
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }

        # Add to user's recipes
        result = db.users.update_one(
            {"_id": user["_id"]},
            {"$push": {"recipes": new_recipe}}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")

        # Remove embedding from response (too large)
        response_recipe = {**new_recipe}
        response_recipe.pop("embedding")

        return {
            "status": "success",
            "recipe": response_recipe
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid ingredients JSON")
    except Exception as e:
        print(f"Error creating recipe: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/match")
async def match_recipe(user: user, db: db, recipe_description: str = Form(...)):
    """Find semantically similar recipes in user's recipe list"""
    embedding = await generate_recipe_embedding(recipe_description)
    matches = await find_similar_recipes(user["_id"], embedding, db, threshold=0.85)

    return {"matches": matches}


@router.post("/unlink-log")
def unlink_log_from_recipe(user: user, db: db, log_id: str = Form(...)):
    """Remove recipe_id from a log to make it standalone"""
    result = db.logs.update_one(
        {"_id": ObjectId(log_id), "user_id": user["_id"]},
        {"$set": {"recipe_id": None, "recipe_servings": None}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Log not found")

    return {"status": "success"}
