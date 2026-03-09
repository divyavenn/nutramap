from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pymongo.database import Database
from typing_extensions import Annotated
from fastapi import Depends
from bson import ObjectId
from datetime import datetime, timedelta, timezone
import uuid
import os
from jose import jwt

# When running as a module within the application, use relative imports
try:
    from ..databases.mongo import get_data
    from .auth import _get_jwt_config
except ImportError:
    import sys
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    from src.databases.mongo import get_data
    from src.routers.auth import _get_jwt_config

router = APIRouter(
    prefix='/trial',
    tags=['trial']
)

db = Annotated[Database, Depends(get_data)]

# Default requirements for trial users (US RDA for average adult)
DEFAULT_REQUIREMENTS = {
    "Protein": 50,
    "Carbohydrate": 300,
    "Fat, total": 70,
    "Fiber, total dietary": 25,
    "Iron, Fe": 18,
    "Vitamin D (D2 + D3)": 20,
    "Vitamin K (phylloquinone)": 120,
}

# DEPRECATED: Old trial user creation functions
# These are kept for reference but are no longer used
# The system now uses a single permanent trial user

# def create_trial_user(db: Database) -> dict:
#     """DEPRECATED: Create a temporary trial user"""
#     ...

# def create_trial_token(user_id: str, email: str, name: str, trial_id: str) -> str:
#     """DEPRECATED: Create a JWT token for trial user"""
#     ...

@router.post("/create")
async def create_trial_session(user_db: db):
    """
    Return the permanent trial user token.
    This logs the user into a single shared trial account.
    """
    try:
        print("=== Trial login requested ===")

        # Get the permanent trial token from environment
        trial_token = os.getenv("TRIAL_USER_TOKEN")

        if not trial_token:
            print("!!! ERROR: TRIAL_USER_TOKEN not found in environment")
            print("Please run: python src/scripts/setup_trial_user.py")
            raise HTTPException(
                status_code=500,
                detail="Trial user not configured. Please contact administrator."
            )

        # Verify the trial user exists in database
        trial_user = user_db.users.find_one({
            "email": "trial@nutramap.app",
            "is_permanent_trial": True
        })

        if not trial_user:
            print("!!! ERROR: Trial user not found in database")
            print("Please run: python src/scripts/setup_trial_user.py")
            raise HTTPException(
                status_code=500,
                detail="Trial user not found. Please contact administrator."
            )

        print(f"✓ Logging into trial account: {trial_user['email']}")

        # Return the permanent token (same format as regular login)
        return JSONResponse(content={
            "access_token": trial_token,
            "token_type": "bearer"
        }, status_code=200)

    except HTTPException:
        raise
    except Exception as e:
        print(f"!!! ERROR in trial login: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create trial session: {str(e)}")

@router.post("/reset")
async def reset_trial_data(user_db: db):
    """
    Reset trial user data (delete all logs and custom foods).
    This is for the permanent trial user - it clears their data but keeps the account.
    """
    try:
        # Find the permanent trial user
        trial_user = user_db.users.find_one({
            "email": "trial@nutramap.app",
            "is_permanent_trial": True
        })

        if not trial_user:
            raise HTTPException(status_code=404, detail="Trial user not found")

        user_id = trial_user["_id"]

        # Delete all logs for trial user
        deleted_logs = user_db.logs.delete_many({"user_id": user_id})

        # Delete all custom foods for trial user
        deleted_foods = user_db.custom_foods.delete_many({"user_id": user_id})

        # Delete all custom recipes for trial user
        deleted_recipes = user_db.recipes.delete_many({"user_id": user_id})

        print(f"Reset trial user data: {deleted_logs.deleted_count} logs, {deleted_foods.deleted_count} custom foods, {deleted_recipes.deleted_count} recipes")

        return {
            "status": "success",
            "deleted_logs": deleted_logs.deleted_count,
            "deleted_custom_foods": deleted_foods.deleted_count,
            "deleted_recipes": deleted_recipes.deleted_count,
            "message": "Trial user data reset successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error resetting trial user data: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to reset trial user data")

def _cleanup_trial_user_data(trial_id: str, user_db: Database):
    """
    DEPRECATED: Internal function to cleanup old trial user data.
    This is kept for backward compatibility with old trial users.
    The permanent trial user should NOT be cleaned up.
    """
    # Find the trial user (old-style trial users only)
    trial_user = user_db.users.find_one({
        "trial_id": trial_id,
        "is_trial": True,
        "is_permanent_trial": {"$ne": True}  # Don't cleanup permanent trial user!
    })

    if not trial_user:
        # Silently ignore - might be permanent trial user or already cleaned up
        return {"message": "No cleanup needed"}

    user_id = trial_user["_id"]

    # Delete all logs for this trial user
    deleted_logs = user_db.logs.delete_many({"user_id": user_id})

    # Delete all requirements for this trial user
    deleted_reqs = user_db.requirements.delete_many({"user_id": user_id})

    # Delete the trial user
    user_db.users.delete_one({"_id": user_id})

    print(f"Cleaned up old trial user {trial_id}: {deleted_logs.deleted_count} logs, {deleted_reqs.deleted_count} requirements")

    return {"message": "Trial user data cleaned up successfully"}

@router.delete("/cleanup/{trial_id}")
async def cleanup_trial_user_delete(trial_id: str, user_db: db):
    """Clean up trial user data (DELETE method)"""
    try:
        result = _cleanup_trial_user_data(trial_id, user_db)
        return JSONResponse(content=result, status_code=200)
    except Exception as e:
        print(f"Error cleaning up trial user: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to cleanup trial user")

@router.post("/cleanup/{trial_id}")
async def cleanup_trial_user_post(trial_id: str, user_db: db):
    """Clean up trial user data (POST method for sendBeacon)"""
    try:
        result = _cleanup_trial_user_data(trial_id, user_db)
        return JSONResponse(content=result, status_code=200)
    except Exception as e:
        print(f"Error cleaning up trial user: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to cleanup trial user")

@router.get("/requirements")
async def get_trial_requirements():
    """Get default requirements for trial users"""
    return JSONResponse(content=DEFAULT_REQUIREMENTS, status_code=200)

@router.post("/seed")
async def seed_trial_data(user_db: db):
    """
    Seed trial user with 6 demo recipes and daily logs for Jan 1 – Mar 8 2026.
    Deletes all existing logs and recipes; preserves custom foods.
    """
    try:
        from .recipes import generate_recipe_embedding

        trial_user = user_db.users.find_one({
            "email": "trial@nutramap.app",
            "is_permanent_trial": True
        })
        if not trial_user:
            raise HTTPException(status_code=404, detail="Trial user not found")

        user_id = trial_user["_id"]

        # Delete all logs; preserve custom foods
        deleted_logs = user_db.logs.delete_many({"user_id": user_id})
        user_db.recipes.delete_many({"user_id": user_id})  # separate collection if any

        # Define seed recipes (food_ids confirmed from prior creation)
        SEED_RECIPES = [
            {
                "description": "matcha latte",
                "serving_size_label": "1 mug",
                "ingredients": [
                    {"food_id": 171917, "food_name": "Tea, green", "amount": "1 tsp", "weight_in_grams": 2.0},
                    {"food_id": 171265, "food_name": "Milk, whole", "amount": "1 cup", "weight_in_grams": 240.0},
                    {"food_id": 169640, "food_name": "Honey", "amount": "1 tbsp", "weight_in_grams": 21.0},
                ],
            },
            {
                "description": "overnight oats",
                "serving_size_label": "1 bowl",
                "ingredients": [
                    {"food_id": 169705, "food_name": "Oats", "amount": "1/2 cup", "weight_in_grams": 40.0},
                    {"food_id": 171265, "food_name": "Milk, whole", "amount": "1 cup", "weight_in_grams": 240.0},
                    {"food_id": 171711, "food_name": "Blueberries", "amount": "1/2 cup", "weight_in_grams": 74.0},
                    {"food_id": 170554, "food_name": "Chia seeds", "amount": "1 tbsp", "weight_in_grams": 12.0},
                ],
            },
            {
                "description": "lentil soup",
                "serving_size_label": "1 bowl",
                "ingredients": [
                    {"food_id": 172421, "food_name": "Lentils", "amount": "1/2 cup", "weight_in_grams": 96.0},
                    {"food_id": 170051, "food_name": "Tomatoes", "amount": "1 cup", "weight_in_grams": 149.0},
                    {"food_id": 170393, "food_name": "Carrots", "amount": "1 medium", "weight_in_grams": 61.0},
                    {"food_id": 169988, "food_name": "Celery", "amount": "1 stalk", "weight_in_grams": 40.0},
                    {"food_id": 171413, "food_name": "Olive oil", "amount": "1 tbsp", "weight_in_grams": 14.0},
                    {"food_id": 170923, "food_name": "Cumin", "amount": "1 tsp", "weight_in_grams": 2.0},
                ],
            },
            {
                "description": "avocado toast",
                "serving_size_label": "1 plate",
                "ingredients": [
                    {"food_id": 174925, "food_name": "Bread, whole wheat", "amount": "2 slices", "weight_in_grams": 66.0},
                    {"food_id": 171705, "food_name": "Avocado", "amount": "1/2 avocado", "weight_in_grams": 75.0},
                    {"food_id": 172186, "food_name": "Egg, poached", "amount": "1 large", "weight_in_grams": 50.0},
                    {"food_id": 167747, "food_name": "Lemon juice", "amount": "1 tsp", "weight_in_grams": 5.0},
                ],
            },
            {
                "description": "buddha bowl",
                "serving_size_label": "1 bowl",
                "ingredients": [
                    {"food_id": 168917, "food_name": "Quinoa", "amount": "1/2 cup", "weight_in_grams": 85.0},
                    {"food_id": 173757, "food_name": "Chickpeas", "amount": "1/2 cup", "weight_in_grams": 82.0},
                    {"food_id": 168462, "food_name": "Spinach", "amount": "2 cups", "weight_in_grams": 60.0},
                    {"food_id": 168483, "food_name": "Sweet potato", "amount": "1 medium", "weight_in_grams": 130.0},
                    {"food_id": 170189, "food_name": "Tahini", "amount": "2 tbsp", "weight_in_grams": 30.0},
                ],
            },
            {
                "description": "pasta primavera",
                "serving_size_label": "1 bowl",
                "ingredients": [
                    {"food_id": 168927, "food_name": "Pasta", "amount": "2 oz", "weight_in_grams": 56.0},
                    {"food_id": 168565, "food_name": "Zucchini", "amount": "1 medium", "weight_in_grams": 196.0},
                    {"food_id": 170457, "food_name": "Tomatoes", "amount": "1 cup", "weight_in_grams": 149.0},
                    {"food_id": 171413, "food_name": "Olive oil", "amount": "1 tbsp", "weight_in_grams": 14.0},
                    {"food_id": 169230, "food_name": "Garlic", "amount": "2 cloves", "weight_in_grams": 6.0},
                    {"food_id": 173431, "food_name": "Parmesan cheese", "amount": "2 tbsp", "weight_in_grams": 10.0},
                ],
            },
        ]

        # Clear user's embedded recipes array and regenerate
        user_db.users.update_one({"_id": user_id}, {"$set": {"recipes": []}})

        now = datetime.now(timezone.utc)
        created_recipes = []
        for recipe_data in SEED_RECIPES:
            recipe_id = str(uuid.uuid4())
            embedding = await generate_recipe_embedding(recipe_data["description"])
            total_weight = sum(ing["weight_in_grams"] for ing in recipe_data["ingredients"])
            serving_label = recipe_data.get("serving_size_label", "1 serving")
            recipe_doc = {
                "recipe_id": recipe_id,
                "description": recipe_data["description"],
                "embedding": embedding,
                "ingredients": recipe_data["ingredients"],
                "serving_size_label": serving_label,
                "serving_size_grams": total_weight,
                "created_at": now,
                "updated_at": now,
            }
            user_db.users.update_one({"_id": user_id}, {"$push": {"recipes": recipe_doc}})
            created_recipes.append({
                "description": recipe_data["description"],
                "recipe_id": recipe_id,
                "serving_size_label": serving_label,
                "serving_size_grams": total_weight,
                "ingredients": recipe_data["ingredients"],
            })

        print(f"Created {len(created_recipes)} seed recipes for trial user")

        # Build log entries Jan 1 – Mar 8 2026
        recipe_map = {r["description"]: r for r in created_recipes}
        breakfasts = ["matcha latte", "overnight oats"]
        lunches    = ["avocado toast", "lentil soup"]
        dinners    = ["buddha bowl", "pasta primavera", "lentil soup"]
        # Snacks cycle: blueberries / apple / almonds / none
        snacks = [
            {"food_id": 171711, "food_name": "Blueberries", "amount": "1/2 cup", "weight_in_grams": 74.0},
            {"food_id": 171688, "food_name": "Apple, raw",  "amount": "1 medium",  "weight_in_grams": 182.0},
            {"food_id": 170567, "food_name": "Almonds",     "amount": "1 oz",      "weight_in_grams": 28.0},
            None,
        ]

        from datetime import date as date_type
        start = date_type(2026, 1, 1)
        end   = date_type(2026, 3, 8)

        log_docs = []
        day_index = 0
        current = start
        while current <= end:
            dt = datetime(current.year, current.month, current.day, tzinfo=timezone.utc)
            for meal_name in [breakfasts[day_index % 2], lunches[day_index % 2], dinners[day_index % 3]]:
                recipe = recipe_map[meal_name]
                log_docs.append({
                    "_id": ObjectId(),
                    "user_id": user_id,
                    "recipe_id": recipe["recipe_id"],
                    "meal_name": meal_name,
                    "servings": 1.0,
                    "serving_unit": None,
                    "serving_size_label": recipe["serving_size_label"],
                    "logged_weight_grams": recipe["serving_size_grams"],
                    "date": dt,
                    "components": recipe["ingredients"],
                })
            snack = snacks[day_index % 4]
            if snack:
                log_docs.append({
                    "_id": ObjectId(),
                    "user_id": user_id,
                    "recipe_id": None,
                    "meal_name": snack["food_name"],
                    "servings": 1.0,
                    "serving_unit": None,
                    "serving_size_label": snack["amount"],
                    "logged_weight_grams": snack["weight_in_grams"],
                    "date": dt,
                    "components": [{"food_id": snack["food_id"], "amount": snack["amount"], "weight_in_grams": snack["weight_in_grams"]}],
                })
            current += timedelta(days=1)
            day_index += 1

        if log_docs:
            user_db.logs.insert_many(log_docs)

        print(f"Created {len(log_docs)} log entries for trial user")

        return {
            "status": "success",
            "deleted_logs": deleted_logs.deleted_count,
            "created_recipes": len(created_recipes),
            "created_logs": len(log_docs),
            "message": "Trial user data seeded successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error seeding trial user data: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to seed trial user data: {str(e)}")


def is_trial_user(user: dict) -> bool:
    """Check if user is a trial user"""
    # Check for trial flag in user dict (from JWT token)
    # Also check email as fallback for database queries
    return user.get("trial", False) or user.get("email", "").endswith("@nutramap.trial")

def get_trial_log_count(db: Database, user_id: ObjectId) -> int:
    """Get the number of logs for a trial user"""
    return db.logs.count_documents({"user_id": user_id})

def can_create_log(db: Database, user: dict) -> bool:
    """Check if trial user can create more logs (max 10)"""
    if not is_trial_user(user):
        return True  # Regular users have no limit

    log_count = get_trial_log_count(db, user["_id"])
    return log_count < 10

@router.post("/cleanup-old-trials")
async def cleanup_old_trial_users(user_db: db):
    """
    Admin endpoint to cleanup trial users older than 24 hours
    This can be called periodically by a cron job or manually
    """
    try:
        # Find trial users created more than 24 hours ago
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)

        # Find all old trial users
        old_trial_users = user_db.users.find({
            "is_trial": True,
            "created_at": {"$lt": cutoff_time}
        })

        cleanup_count = 0
        for trial_user in old_trial_users:
            try:
                user_id = trial_user["_id"]

                # Delete all logs for this trial user
                user_db.logs.delete_many({"user_id": user_id})

                # Delete all requirements for this trial user
                user_db.requirements.delete_many({"user_id": user_id})

                # Delete the trial user
                user_db.users.delete_one({"_id": user_id})

                cleanup_count += 1
                print(f"Cleaned up old trial user: {trial_user.get('trial_id', 'unknown')}")

            except Exception as e:
                print(f"Error cleaning up trial user {trial_user.get('trial_id', 'unknown')}: {e}")
                continue

        return {
            "status": "success",
            "cleaned_up_count": cleanup_count,
            "message": f"Cleaned up {cleanup_count} old trial users"
        }

    except Exception as e:
        print(f"Error in cleanup_old_trial_users: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to cleanup old trial users")
