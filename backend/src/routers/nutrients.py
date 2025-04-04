from typing_extensions import Annotated
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pymongo.database import Database


from src.databases.mongo import get_data

__package__ = "nutramap.routers"

db = Annotated[Database, Depends(get_data)]

router = APIRouter(   # groups API endpoints together
    prefix='/nutrients', 
    tags=['nutrient'])

@router.get("/all")
async def get_all_nutrients(db: db):
    # Query the nutrients collection and exclude specified IDs
    excluded_ids = [1062, 2047, 2048, 1141, 1142, 1238, 1240]
    nutrients = list(db.nutrients.find(
    {"_id": {"$nin": excluded_ids}},  # Filter to exclude nutrient IDs
    ))
    if not nutrients:
        return JSONResponse(content={"message": "No data found."}, status_code=404)

    # Format the result as a dictionary
    return {
        nutrient["nutrient_name"]: {"id": nutrient["_id"], "unit": nutrient["unit"]}
        for nutrient in nutrients
    }