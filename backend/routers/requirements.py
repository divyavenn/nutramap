from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database
from sqlalchemy.orm import Session
from typing import List
from typing_extensions import Annotated

from ..databases.main_connection import get_user_data, User, Requirement, RequirementCreate, get_session, Food, Nutrient
from .foods import get_nutrient_details
from .auth import get_current_user

__package__ = "nutramap.routers"

router = APIRouter(
    # groups API endpoints together
    prefix='/requirements', 
    tags=['requirement']
)

user_dependency = Annotated[dict, Depends(get_current_user)]
user_db_dependency = Annotated[Database, Depends(get_user_data)]
food_db_dependency = Annotated[Session, Depends(get_session)] 

def get_requirements_for_user(user, user_db):
    query = {"user_id": str(user["_id"])}
    requirements = user_db.requirements.find(query)
    if requirements is None:
        raise HTTPException(status_code = 401, detail = "This user has no requirements.")
                                
    return requirements
        
@router.get("/all")
def requirement_info(user: user_dependency, user_db : user_db_dependency, food_db : food_db_dependency):
    requirements = list(get_requirements_for_user(user, user_db))
    info = {}
    for r in requirements:
        name, units = get_nutrient_details(food_db, r["nutrient_id"])
        info[r["nutrient_id"]] = {"name" : name,
                                 "target" : r["amt"],
                                 "should_exceed": r["should_exceed"],
                                 "units" : units}
    
    return info
    
@router.post("/new", response_model=None)
def add_requirement(user: user_dependency, requirement: RequirementCreate, food_db : food_db_dependency, user_db : user_db_dependency):
    # Validate that the user exists in MongoDB
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate that the nutrient exists in MongoDB
    nutrient = food_db.query(Nutrient).filter(Nutrient.nutrient_id == requirement.nutrient_id).first()
    
    if not nutrient:
        raise HTTPException(status_code=404, detail="Nutrient not found")
    
    # Check for existing entry with the same nutrient_id and user_id
    existing = user_db.requirements.find_one({
        "nutrient_id": requirement.nutrient_id,
        "user_id": user["_id"]
    })
    if existing:
        #update
        user_db.requirements.update_one(
        {"user_id": user["_id"], "nutrient_id": requirement.nutrient_id,},
        {"$set": {"amt" :requirement.amt, "should_exceed" : requirement.should_exceed}})
        
    else: 
        # Insert requirement into MongoDB 
        req_dict = requirement.model_dump()
        req_dict["user_id"] = user["_id"]
        user_db.requirements.insert_one(req_dict)
        

@router.delete("/delete")
def remove_requirement(requirement_id: str, user: user_dependency, user_db : user_db_dependency):
    # Validate that the user exists in MongoDB
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    filters = {"nutrient_id": int(requirement_id), "user_id": user["_id"]}
    requirement = user_db.requirements.find_one(filters)
    
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found.")
    # Perform the update operation
    result = user_db.requirements.delete_one(filters)
  
    # Check if the document was deleted
    if result.deleted_count > 0:
      print("Requirement deleted successfully.")
      return None
    
    else:
      print("No document matched the filter criteria.")
      raise HTTPException(status_code=404, detail="Something went wrong, requirement not deleted.")
    