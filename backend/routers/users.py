from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError
from sqlalchemy.orm import Session
from typing import List
from typing_extensions import Annotated
from bson import ObjectId

from ..databases.main_connection import get_user_data, User, UserCreate, get_session
from .auth import hash_password, get_current_user
from fastapi.responses import JSONResponse

__package__ = "nutramap.routers"

router = APIRouter(
    # groups API endpoints together
    prefix='/user', 
    tags=['user']
)

user_dependency = Annotated[dict, Depends(get_current_user)]
user_db_dependency = Annotated[Database, Depends(get_user_data)]
food_db_dependency = Annotated[Session, Depends(get_session)] 

#--------------------------------------end points------------------------------------------------------# 

# A protected route that requires a valid token
@router.get("/info")
def protected_route(user: dict = Depends(get_current_user)):
    if user:
      print(user)
      return user
    else:
      return JSONResponse(content={"message": "You are not authenticated"}, status_code=401)

@router.post("/new", response_model=User)
def create_user(user: UserCreate, user_db : user_db_dependency):
    # converts to dictionary
    user_dict = user.model_dump()
    # this removes the password field and assigns the value to the password_hash field, allowing hashing for security purposes
    user_dict["password_hash"] = hash_password(user_dict.pop("password"))
    user_dict["_id"] = str(ObjectId())
    user_dict["role"] = "user"
    
    try:
        # Insert the new user, relying on the unique index to enforce uniqueness
        user_db.users.insert_one(user_dict)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    
    return User(**user_dict)

@router.get("/all", response_model=List[User])
def get_user(user_db : user_db_dependency):
    users = list(user_db.users.find({}))
    #for user in users:
    #   user["user_id"] = str(user.pop("_id"))  # Convert ObjectId to string
    return [User(**user) for user in users]

@router.post("/update-password", response_model = User)
def update_password(new_password: str, user: user_dependency, user_db : user_db_dependency):
    query = {"_id": user["_id"]}
    
    user_to_update = user_db.users.find_one(query)
    if user_to_update is None:
        raise HTTPException(status_code = 401, detail = "This user does not exist")
    
    update = {"$set": {"password_hash": hash_password(new_password)}}
    user_db.users.update_one(query, update)
    
    return f"Password for {user_to_update['email']} updated!"

@router.post("/update-email", response_model = None)
def update_email(new_email: str, user: user_dependency, user_db : user_db_dependency):
    query_id = {"_id": user["_id"]}
    

    user_to_update = user_db.users.find_one(query_id)
    if user_to_update is None:
        raise HTTPException(status_code = 401, detail = "This user does not exist")
    
    query_email = {"email" : new_email}
    user_with_email = user_db.users.find_one(query_email)
    
    if user_with_email is not None:
        raise HTTPException(status_code = 401, detail = "Another user already has this email")
    
    # Update the user's role to admin
    old_email = user_to_update["email"]
    if old_email == new_email:
        return "This is already your current email."
    
    update = {"$set": {"email": new_email}}
    user_db.users.update_one(query_id, update)
    
    return f"Email changed from {old_email} to {new_email}"

@router.post("/make_admin", response_model = User)
def make_admin(email: str, user : user_dependency, user_db : user_db_dependency):
    if user is None or user['role'] != 'admin':
        raise HTTPException(status_code = 401, detail = "Invalid credentials; must be administrator")
    query = {"email": email}
    user_to_update = user_db.users.find_one(query)
    if user_to_update is None:
        raise HTTPException(status_code = 401, detail = "No user with this email exists.")
    
    
    # Update the user's role to admin
    update = {"$set": {"role": "admin"}}
    user_db.users.update_one(query, update)
    
    # Optionally, retrieve the updated user document
    updated_user = user_db.users.find_one(query)
    
    return User(**updated_user)

@router.post("/remove_admin", response_model = User)
def remove_admin(email: str, user : user_dependency, user_db : user_db_dependency):
    if user is None or user['role'] != 'admin':
        raise HTTPException(status_code = 401, detail = "Invalid credentials; must be administrator")
    query = {"email": email}
    user_to_update = user_db.users.find(query)
    if user_to_update is None:
        raise HTTPException(status_code = 401, detail = "No user with this email exists.")
    
    
    # Update the user's role to user
    update = {"$set": {"role": "user"}}
    user_db.users.update_one(query, update)
    
    # Optionally, retrieve the updated user document
    updated_user = user_db.users.find_one(query)
    
    return User(**updated_user)
