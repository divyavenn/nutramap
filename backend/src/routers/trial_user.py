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

def create_trial_user(db: Database) -> dict:
    """Create a temporary trial user"""
    trial_id = str(uuid.uuid4())
    trial_email = f"trial_{trial_id}@nutramap.trial"

    trial_user = {
        "_id": ObjectId(),
        "email": trial_email,
        "first_name": "Trial",
        "last_name": "User",
        "role": "trial",
        "password_hash": "",  # No password for trial users
        "created_at": datetime.now(timezone.utc),
        "is_trial": True,
        "trial_id": trial_id
    }

    # Insert trial user into database
    db.users.insert_one(trial_user)

    return trial_user

def create_trial_token(user_id: str, email: str, name: str, trial_id: str) -> str:
    """Create a JWT token for trial user - same structure as regular user"""
    SECRET_KEY, ALGORITHM = _get_jwt_config()

    encode = {
        'email': email,
        '_id': str(user_id),
        'role': 'user',  # Same role as regular users
        'name': name,
        'trial': True,  # Trial flag
        'trial_id': trial_id,
        'exp': datetime.now(timezone.utc) + timedelta(hours=24)  # Trial expires in 24 hours
    }

    return jwt.encode(encode, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/create")
async def create_trial_session(user_db: db):
    """Create a new trial user session"""
    try:
        print("=== Starting trial user creation ===")

        # Create trial user
        print("Creating trial user in database...")
        trial_user = create_trial_user(user_db)
        user_id = trial_user["_id"]
        print(f"Trial user created with ID: {user_id}")

        # Create default requirements for trial user
        # First, get the nutrient IDs from the nutrients collection
        nutrients_collection = user_db.nutrients
        print(f"Looking up nutrients for {len(DEFAULT_REQUIREMENTS)} requirements...")

        requirements_created = 0
        for nutrient_name, target_value in DEFAULT_REQUIREMENTS.items():
            print(f"  Looking for nutrient: '{nutrient_name}'")
            nutrient = nutrients_collection.find_one({"nutrient_name": nutrient_name})
            if nutrient:
                # Create requirement document (using same field names as regular requirements)
                requirement = {
                    "user_id": user_id,
                    "nutrient_id": nutrient["_id"],
                    "amt": target_value,  # Use "amt" not "target" to match regular requirements
                    "should_exceed": True,  # Use "should_exceed" not "shouldExceed" to match regular requirements
                    "created_at": datetime.now(timezone.utc)
                }
                user_db.requirements.insert_one(requirement)
                requirements_created += 1
                print(f"  ✓ Created requirement for {nutrient_name} (ID: {nutrient['_id']})")
            else:
                print(f"  ✗ WARNING: Nutrient '{nutrient_name}' not found in database!")

        print(f"=== Trial user created with {requirements_created}/{len(DEFAULT_REQUIREMENTS)} requirements ===")

        # Create token - same format as regular login
        # Use empty string for name so dashboard shows "Hello, you!" instead of "Hello, Trial"
        token = create_trial_token(
            str(user_id),
            trial_user["email"],
            "",  # Empty name for trial users
            trial_user["trial_id"]
        )

        # Return same format as regular login
        return JSONResponse(content={
            "access_token": token,
            "token_type": "bearer"
        }, status_code=200)

    except Exception as e:
        print(f"!!! ERROR creating trial user: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create trial session: {str(e)}")

def _cleanup_trial_user_data(trial_id: str, user_db: Database):
    """Internal function to cleanup trial user data"""
    # Find the trial user
    trial_user = user_db.users.find_one({"trial_id": trial_id, "is_trial": True})

    if not trial_user:
        raise HTTPException(status_code=404, detail="Trial user not found")

    user_id = trial_user["_id"]

    # Delete all logs for this trial user
    deleted_logs = user_db.logs.delete_many({"user_id": user_id})

    # Delete all requirements for this trial user
    deleted_reqs = user_db.requirements.delete_many({"user_id": user_id})

    # Delete the trial user
    user_db.users.delete_one({"_id": user_id})

    print(f"Cleaned up trial user {trial_id}: {deleted_logs.deleted_count} logs, {deleted_reqs.deleted_count} requirements")

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
