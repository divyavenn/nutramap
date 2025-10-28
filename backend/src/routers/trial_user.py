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
