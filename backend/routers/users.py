from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError
from typing import List
from typing_extensions import Annotated

from ..databases.main_connection import get_data, User, UserCreate, get_session
from .auth import hash_password, get_current_user, authenticate_user, create_access_token
from fastapi.responses import JSONResponse

__package__ = "nutramap.routers"

router = APIRouter(
    # groups API endpoints together
    prefix='/user', 
    tags=['user']
)

user_dependency = Annotated[dict, Depends(get_current_user)]
user_db_dependency = Annotated[Database, Depends(get_data)]

#--------------------------------------end points------------------------------------------------------# 

# A protected route that requires a valid token
@router.get("/info")
def protected_route(user: dict = Depends(get_current_user)):
    if user:
      return {"name" : user["name"], 'email' : user["email"], "role" : user["role"]}
    else:
      return JSONResponse(content={"message": "You are not authenticated"}, status_code=401)

@router.post("/new", response_model=User)
def create_user(user: UserCreate, user_db : user_db_dependency):
    # converts to dictionary
    user_dict = user.model_dump()
    # this removes the password field and assigns the value to the password_hash field, allowing hashing for security purposes
    user_dict["password_hash"] = hash_password(user_dict.pop("password"))
    user_dict["role"] = "user"
    
    try:
        # Insert the new user, relying on the unique index to enforce uniqueness
        user_db.users.insert_one(user_dict)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    
    return user_dict


@router.post("/check-password")
def check_password(user : user_dependency, password: str):
  try:
    user = authenticate_user(user["email"], password, get_data())
    return JSONResponse(content="authenticated!", status_code=200)
    
  except HTTPException as e:
    # Handle invalid credentials or user not found
    return JSONResponse(content={"error": str(e.detail)}, status_code=400)


@router.get("/all", response_model=List[User])
def get_user(user_db : user_db_dependency):
    
    users = list(user_db.users.find({}))
    return [User(**user) for user in users]
    

@router.post("/update-password", response_model = None)
def update_password(new_password: str, user: user_dependency, user_db : user_db_dependency):
    query = {"_id": user["_id"]}
    
    user_to_update = user_db.users.find_one(query)
    if user_to_update is None:
        raise HTTPException(status_code = 401, detail = "This user does not exist")
    
    update = {"$set": {"password_hash": hash_password(new_password)}}
    user_db.users.update_one(query, update)
    
    return create_access_token(user["email"], user["_id"], user["role"], user["name"], timedelta(minutes=60))


@router.post("/update-name", response_model = None)
def update_name(new_name: str, user: user_dependency, user_db : user_db_dependency):
    query_id = {"_id": user["_id"]}
    
    user_to_update = user_db.users.find_one(query_id)
    if user_to_update is None:
        raise HTTPException(status_code = 401, detail = "This user does not exist")
    
    # Update the user's role to admin
    old_name = user_to_update["name"]
    if old_name == new_name:
        raise HTTPException(status_code = 304, detail = "No change")
    
    update = {"$set": {"name": new_name}}
    user_db.users.update_one(query_id, update)
    
    return create_access_token(user["email"], user["_id"], user["role"], new_name, timedelta(minutes=60))


@router.post("/delete")
def delete(user: user_dependency, user_db : user_db_dependency):
    query = {"_id": user["_id"]}
    itemQuery = {"user_id": user["_id"]}
    user_to_delete = user_db.users.find_one(query)
    
    if user_to_delete is None:
        raise HTTPException(status_code = 401, detail = "This user does not exist")
    
    user_db.users.delete_one(query)
    user_db.logs.delete_many(itemQuery)
    user_db.requirements.delete_many(itemQuery)
    

@router.post("/update-email")
def update_email(new_email: str, user: user_dependency, user_db : user_db_dependency):
    query_id = {"_id": user["_id"]}
    
    user_to_update = user_db.users.find_one(query_id)
    if user_to_update is None:
        raise HTTPException(status_code = 401, detail = "This user does not exist")
    
    # Update the user's role to admin
    old_email = user_to_update["email"]
    if old_email == new_email:
        raise HTTPException(status_code = 304, detail = "No change")
    
    update = {"$set": {"email": new_email}}
    user_db.users.update_one(query_id, update)
    
    return create_access_token(new_email, user["_id"], user["role"], user["name"], timedelta(minutes=60))

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
