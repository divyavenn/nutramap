from typing_extensions import Annotated
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pymongo.database import Database
import time


from src.databases.mongo import get_data
from .sparse_search_nutrients import sparse_search_nutrients, search_nutrients_by_name
from .dense import find_dense_nutrient_matches

__package__ = "nutramap.routers"

db = Annotated[Database, Depends(get_data)]

router = APIRouter(   # groups API endpoints together
    prefix='/nutrients',
    tags=['nutrient'])

@router.get("/all")
async def get_all_nutrients(db: db):
    # Query the nutrients collection
    nutrients = list(db.nutrients.find({}))
    if not nutrients:
        return JSONResponse(content={"message": "No data found."}, status_code=404)

    # Filter out kJ energy (ID: 1062) - we only want kcal energy (ID: 1008)
    # Format the result as a dictionary
    return {
        nutrient["nutrient_name"]: {"id": nutrient["_id"], "unit": nutrient["unit"]}
        for nutrient in nutrients
        if nutrient["_id"] != 1062  # Skip kJ Energy
    }

@router.get("/search/sparse")
async def test_sparse_nutrient_search(
    nutrient_name: str = Query(..., description="Nutrient name to search for"),
    threshold: float = Query(0.1, description="Minimum score threshold (0-100)", ge=0, le=100),
    limit: int = Query(10, description="Maximum number of results", ge=1, le=50),
    db: Database = Depends(get_data)
):
    """
    Test sparse (keyword-based) nutrient search using Typesense.
    Tests ONLY sparse search, does not fall back to dense.

    Example queries:
    - "protein"
    - "vitamin c"
    - "total lipid"
    """
    try:
        # Time the search
        start_time = time.perf_counter()
        results = await sparse_search_nutrients(nutrient_name, threshold, limit)
        end_time = time.perf_counter()
        elapsed_ms = round((end_time - start_time) * 1000, 2)

        if not results:
            return {
                "query": nutrient_name,
                "method": "sparse (Typesense)",
                "elapsed_ms": elapsed_ms,
                "results_count": 0,
                "matches": {},
                "message": "No nutrients found matching the query"
            }

        # Get nutrient names for the matched IDs
        nutrient_details = {}
        for nutrient_id, score in results.items():
            nutrient = db.nutrients.find_one({"_id": int(nutrient_id)})
            if nutrient:
                nutrient_details[nutrient_id] = {
                    "name": nutrient["nutrient_name"],
                    "unit": nutrient.get("unit", ""),
                    "score": score
                }

        return {
            "query": nutrient_name,
            "method": "sparse (Typesense)",
            "elapsed_ms": elapsed_ms,
            "results_count": len(results),
            "matches": nutrient_details
        }
    except Exception as e:
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )

@router.get("/search/dense")
async def test_dense_nutrient_search(
    nutrient_name: str = Query(..., description="Nutrient name to search for"),
    threshold: float = Query(70, description="Minimum similarity threshold (0-100)", ge=0, le=100),
    limit: int = Query(10, description="Maximum number of results", ge=1, le=50),
    db: Database = Depends(get_data),
    request: Request = None
):
    """
    Test dense (semantic/embedding-based) nutrient search using FAISS embeddings.
    Uses cosine similarity to find nutrients with similar meanings.

    Example queries:
    - "fat"
    - "vitamin c"
    - "carbs"
    """
    try:
        # Time the search
        start_time = time.perf_counter()
        results = await find_dense_nutrient_matches(nutrient_name, db, request, threshold, limit)
        end_time = time.perf_counter()
        elapsed_ms = round((end_time - start_time) * 1000, 2)

        if not results:
            return {
                "query": nutrient_name,
                "method": "dense (OpenAI embeddings)",
                "elapsed_ms": elapsed_ms,
                "results_count": 0,
                "matches": {},
                "message": "No nutrients found matching the query"
            }

        # Get nutrient names for the matched IDs
        nutrient_details = {}
        for nutrient_id, score in results.items():
            nutrient = db.nutrients.find_one({"_id": int(nutrient_id)})
            if nutrient:
                nutrient_details[nutrient_id] = {
                    "name": nutrient["nutrient_name"],
                    "unit": nutrient.get("unit", ""),
                    "score": score
                }

        return {
            "query": nutrient_name,
            "method": "dense (OpenAI embeddings)",
            "elapsed_ms": elapsed_ms,
            "results_count": len(results),
            "matches": nutrient_details
        }
    except Exception as e:
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )

@router.get("/search/hybrid")
async def test_hybrid_nutrient_search(
    nutrient_name: str = Query(..., description="Nutrient name to search for"),
    threshold: float = Query(0.1, description="Minimum score threshold for sparse (0-100)", ge=0, le=100),
    limit: int = Query(10, description="Maximum number of results", ge=1, le=50),
    db: Database = Depends(get_data)
):
    """
    Test hybrid nutrient search (sparse first, dense fallback).
    Tries Typesense sparse search first, falls back to OpenAI embeddings if no results.

    Example queries:
    - "protein"
    - "total fat"
    - "vitamin c"
    """
    try:
        # Time the search
        start_time = time.perf_counter()
        results = await search_nutrients_by_name(nutrient_name, db, threshold, limit)
        end_time = time.perf_counter()
        elapsed_ms = round((end_time - start_time) * 1000, 2)

        if not results:
            return {
                "query": nutrient_name,
                "method": "hybrid (sparse → dense fallback)",
                "elapsed_ms": elapsed_ms,
                "results_count": 0,
                "matches": {},
                "message": "No nutrients found matching the query"
            }

        # Get nutrient names for the matched IDs
        nutrient_details = {}
        for nutrient_id, score in results.items():
            nutrient = db.nutrients.find_one({"_id": int(nutrient_id)})
            if nutrient:
                nutrient_details[nutrient_id] = {
                    "name": nutrient["nutrient_name"],
                    "unit": nutrient.get("unit", ""),
                    "score": score
                }

        return {
            "query": nutrient_name,
            "method": "hybrid (sparse → dense fallback)",
            "elapsed_ms": elapsed_ms,
            "results_count": len(results),
            "matches": nutrient_details
        }
    except Exception as e:
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )