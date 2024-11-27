from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database
from typing_extensions import Annotated

from src.databases.main_connection import get_data, RequirementCreate
from src.routers.auth import get_current_user

__package__ = "nutramap.routers"

router = APIRouter(
    # groups API endpoints together
    prefix='/requirements', 
    tags=['requirement']
)

user = Annotated[dict, Depends(get_current_user)]
db = Annotated[Database, Depends(get_data)]

def get_requirements_for_user(user, user_db):
    query = {"user_id": user["_id"]}
    requirements = user_db.requirements.find(query)
    if requirements is None:
        raise HTTPException(status_code = 401, detail = "This user has no requirements.")
                                
    return requirements
        
@router.get("/all")
def requirement_info(user: user, db: db):
    # Retrieve all requirements for the user
    requirements = list(get_requirements_for_user(user, db))

    if not requirements:
        return {}

    # Extract all nutrient IDs from the user's requirements
    nutrient_ids = [r["nutrient_id"] for r in requirements]

    # # Batch query the nutrients collection for all required nutrient details
    # nutrient_details = db.nutrients.find(
    #     {"_id": {"$in": nutrient_ids}}, 
    #     {"_id": 1, "nutrient_name": 1, "unit": 1}
    # )

    # # Create a mapping of nutrient_id to nutrient details for fast lookup
    # nutrient_details_map = {
    #     nutrient["_id"]: {
    #         "name": nutrient["nutrient_name"],
    #         "unit": nutrient["unit"]
    #     }
    #     for nutrient in nutrient_details
    # }

    # Build the response object by enriching requirements with nutrient details
    info = {}
    for r in requirements:
        info[r["nutrient_id"]] = {
            "target": r["amt"],
            "should_exceed": r["should_exceed"],
        }

    return info
    
@router.post("/new", response_model=None)
def add_requirement(user: user, db : db, requirement: RequirementCreate):
    # Validate that the user exists in MongoDB
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate that the nutrient exists in MongoDB
    nutrient = db.nutrients.find_one({"_id" : requirement.nutrient_id})
    
    if not nutrient:
        raise HTTPException(status_code=404, detail="Nutrient not found")
    
    # Check for existing entry with the same nutrient_id and user_id
    existing = db.requirements.find_one({
        "nutrient_id": requirement.nutrient_id,
        "user_id": user["_id"]
    })
    if existing:
        #update
        db.requirements.update_one(
        {"user_id": user["_id"], "nutrient_id": requirement.nutrient_id,},
        {"$set": {"amt" :requirement.amt, "should_exceed" : requirement.should_exceed}})
        
    else: 
        # Insert requirement into MongoDB 
        req_dict = requirement.model_dump()
        req_dict["user_id"] = user["_id"]
        db.requirements.insert_one(req_dict)
        

@router.delete("/delete")
def remove_requirement(requirement_id: str, user: user, db : db):
    # Validate that the user exists in MongoDB
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    filters = {"nutrient_id": int(requirement_id), "user_id": user["_id"]}
    requirement = db.requirements.find_one(filters)
    
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found.")
    # Perform the update operation
    result = db.requirements.delete_one(filters)
  
    # Check if the document was deleted
    if result.deleted_count > 0:
      print("Requirement deleted successfully.")
      return None
    
    else:
      print("No document matched the filter criteria.")
      raise HTTPException(status_code=404, detail="Something went wrong, requirement not deleted.")
    