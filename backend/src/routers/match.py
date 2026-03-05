# use openAI to parse user inputted food descripiont
# make sure all the ingredients are processed in batches/parallel if possible 
# sparse index already stored in Typesense CLoud, store FAISS index in RAM
# use sparse index + dense index + Reciprocal Rank Fusion (RRF) to find matches
# add to log
# accuracy is good so no need for cross-recoder ranking using BERT model
# implement optimized product quantization with rotation matrix 
# cache queries
# For twitter trawl: 
# Add GPU acceleration with FAISS-GPU
#	Experiment with distilled vector models for compactness
#Try compressed sparse vector fusion

from fastapi import APIRouter, Depends, Request, Query
from fastapi.responses import JSONResponse
from typing import Dict
import time
from datetime import datetime, timedelta
from collections import OrderedDict
import re

# When running as a module within the application, use relative imports
try:
    from .sparse import get_sparse_index
    from .dense import find_dense_matches
    from .auth import get_current_user
    from src.databases.mongo import get_data
    from .foods import get_food_name
    from .parallel import parallel_process

# When running this file directly, use absolute imports
except ImportError:
    import sys
    import os
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    from src.routers.sparse import get_sparse_index
    from src.routers.dense import find_dense_matches
    from src.routers.auth import get_current_user
    from src.databases.mongo import get_data
    from src.routers.foods import get_food_name
    from src.routers.parallel import parallel_process

from pymongo.database import Database
from typing_extensions import Annotated

# ============================================================================
# Autocomplete Cache Configuration
# ============================================================================
# In-memory LRU cache for autocomplete results
# This reduces latency from 650-1400ms to <50ms for cached queries
autocomplete_cache = OrderedDict()  # {cache_key: {results, timestamp}}
CACHE_TTL = 3600  # Cache entries expire after 1 hour
CACHE_MAX_SIZE = 10000  # Maximum number of cached queries (LRU eviction)
cache_stats = {"hits": 0, "misses": 0}  # For monitoring cache performance

router = APIRouter(
      # groups API endpoints together
    prefix='/match',
    tags=['match']
)

user = Annotated[dict, Depends(get_current_user)]
db = Annotated[Database, Depends(get_data)]


def _dedupe_autocomplete_results(results: list, max_items: int = 10) -> list:
    deduped = []
    seen_ids = set()
    for item in results:
        food_id = str(item.get("food_id", "")).strip()
        food_name = str(item.get("food_name", "")).strip()
        if not food_id or not food_name:
            continue
        if food_id in seen_ids:
            continue
        deduped.append({"food_id": food_id, "food_name": food_name})
        seen_ids.add(food_id)
        if len(deduped) >= max_items:
            break
    return deduped


def _prompt_matches_food_name(prompt: str, food_name: str) -> bool:
    normalized_prompt = (prompt or "").strip().lower()
    normalized_name = (food_name or "").strip().lower()
    if not normalized_prompt or not normalized_name:
        return False
    return normalized_prompt in normalized_name


def upsert_custom_food_in_autocomplete_cache(user_id: str, food_id: str, food_name: str) -> int:
    """
    Add/update a custom-food suggestion in-place for this user's cached prompts.
    This avoids full cache invalidation and makes new names show immediately.
    """
    prefix = f"{str(user_id)}:"
    updated_entries = 0
    normalized_id = str(food_id)
    normalized_name = str(food_name).strip()

    if not normalized_id or not normalized_name:
        return 0

    for key, entry in autocomplete_cache.items():
        if not key.startswith(prefix):
            continue

        prompt = key[len(prefix):]
        existing_results = list(entry.get("results", []))
        without_food = [item for item in existing_results if str(item.get("food_id", "")) != normalized_id]

        if _prompt_matches_food_name(prompt, normalized_name):
            candidate_results = [{"food_id": normalized_id, "food_name": normalized_name}] + without_food
        else:
            # Keep the food in cache only when this prompt still matches its name.
            candidate_results = without_food

        deduped = _dedupe_autocomplete_results(candidate_results, max_items=10)
        if deduped != existing_results:
            entry["results"] = deduped
            updated_entries += 1

    if updated_entries:
        print(f"Patched {updated_entries} autocomplete cache entries for user {user_id}")
    return updated_entries


def remove_custom_food_from_autocomplete_cache(user_id: str, food_id: str) -> int:
    """Remove a deleted custom-food ID from this user's cached autocomplete results."""
    prefix = f"{str(user_id)}:"
    normalized_id = str(food_id)
    updated_entries = 0

    for key, entry in autocomplete_cache.items():
        if not key.startswith(prefix):
            continue
        existing_results = list(entry.get("results", []))
        filtered = [item for item in existing_results if str(item.get("food_id", "")) != normalized_id]
        if filtered != existing_results:
            entry["results"] = filtered
            updated_entries += 1

    if updated_entries:
        print(f"Removed deleted food from {updated_entries} autocomplete cache entries for user {user_id}")
    return updated_entries


def _search_user_custom_foods(prompt: str, user: dict, db: Database, limit: int = 10) -> list[dict]:
    """
    Safety-net search for current user's custom foods directly in MongoDB.
    Ensures autocomplete still returns custom foods if Typesense/FAISS is stale.
    """
    query = (prompt or "").strip()
    if not query:
        return []

    escaped_query = re.escape(query)
    regex_filter = {"$regex": escaped_query, "$options": "i"}

    docs = list(
        db.foods.find(
            {
                "source": user["_id"],
                "$or": [{"food_name": regex_filter}, {"name": regex_filter}],
            },
            {"_id": 1, "food_name": 1, "name": 1},
        ).limit(max(limit * 3, limit))
    )

    prompt_lower = query.lower()
    ranked = []
    for doc in docs:
        food_name = str(doc.get("food_name") or doc.get("name") or "").strip()
        if not food_name:
            continue
        name_lower = food_name.lower()
        exact = int(name_lower == prompt_lower)
        prefix = int(name_lower.startswith(prompt_lower))
        contains_index = name_lower.find(prompt_lower)
        if contains_index < 0:
            contains_index = 10_000
        ranked.append(((-exact, -prefix, contains_index, len(food_name)), str(doc["_id"]), food_name))

    ranked.sort(key=lambda item: item[0])
    output = []
    for _, food_id, food_name in ranked[:limit]:
        output.append({"food_id": food_id, "food_name": food_name})
    return output


async def rrf_fusion(
    get_sparse_results,
    sparse_args: list,
    get_dense_results,
    dense_args: list,
    k: int = 30,
    n: int = 1
) -> list:
    """
    Perform RRF (Reciprocal Rank Fusion) on sparse and dense search results.

    This is a generic function that can work with any type of entity (foods, nutrients, etc.)
    by accepting custom search functions and their arguments.

    Args:
        get_sparse_results: Async function to get sparse search results
        sparse_args: List of arguments to pass to get_sparse_results
        get_dense_results: Async function to get dense search results
        dense_args: List of arguments to pass to get_dense_results
        k: RRF parameter for ranking (default: 30)
        n: Number of top results to return (default: 1)

    Returns:
        List of top n item IDs

    Example:
        # For foods:
        matches = await rrf_fusion(
            get_sparse_index, ["butter", db, user, 60, 50],
            find_dense_matches, ["butter", db, user, request, 40, 50],
            k=30,
            n=1
        )

        # For nutrients:
        matches = await rrf_fusion(
            sparse_search_nutrients, ["protein", 0.1, 10],
            find_dense_nutrient_matches, ["protein", db, request, 70, 10],
            k=30,
            n=1
        )
    """
    combined_scores = {}

    # Weight factors - give more importance to dense search for semantic matching
    sparse_weight = 0.2
    dense_weight = 0.8

    # Get sparse results by calling the provided function with its arguments
    sparse_results = await get_sparse_results(*sparse_args)

    # Process sparse results with proper tie handling
    # Group items by score to handle ties
    sparse_score_groups = {}
    for item_id, score in sparse_results.items():
        if score not in sparse_score_groups:
            sparse_score_groups[score] = []
        sparse_score_groups[score].append(item_id)
  
    # Sort scores in descending order
    sorted_sparse_scores = sorted(sparse_score_groups.keys(), reverse=True)
    
    # Define the process function for sparse scores
    async def process_sparse_score(score):
        nonlocal current_rank
        item_ids = sparse_score_groups[score]
        # All items with the same score get the same rank
        norm_score = score / 100.0 if score > 0 else 0
        rank_score = 1 / (k + current_rank + 1)
        score_results = {
            item_id: sparse_weight * (0.7 * rank_score + 0.3 * norm_score)
            for item_id in item_ids
        }
        current_rank += len(item_ids)
        return score_results

    # Initialize current_rank for sparse processing
    current_rank = 0

    # Process sparse scores in parallel
    sparse_results_list = await parallel_process(sorted_sparse_scores, process_sparse_score)

    # Combine sparse results
    for result in sparse_results_list:
        combined_scores.update(result)

    # Get dense results by calling the provided function with its arguments
    dense_results = await get_dense_results(*dense_args)

    # Process dense results with proper tie handling
    # Group items by score to handle ties
    dense_score_groups = {}
    for item_id, score in dense_results.items():
        if score not in dense_score_groups:
            dense_score_groups[score] = []
        dense_score_groups[score].append(item_id)
    
    # Sort scores in descending order
    sorted_dense_scores = sorted(dense_score_groups.keys(), reverse=True)
    
    # Define the process function for dense scores
    async def process_dense_score(score):
        nonlocal current_rank
        item_ids = dense_score_groups[score]
        norm_score = score / 100.0 if score > 0 else 0
        rank_score = 1 / (k + current_rank + 1)
        score_results = {
            item_id: dense_weight * (0.5 * rank_score + 0.5 * norm_score)
            for item_id in item_ids
        }
        current_rank += len(item_ids)
        return score_results

    # Reset current_rank for dense processing
    current_rank = 0

    # Process dense scores in parallel
    dense_results_list = await parallel_process(sorted_dense_scores, process_dense_score)

    async def combine_results(result):
        for item_id, score in result.items():
            combined_scores[item_id] = combined_scores.get(item_id, 0) + score

    await parallel_process(dense_results_list, combine_results)

    # Return the top n item IDs with the highest combined scores
    if not combined_scores:
        return []
    sorted_scores = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)
    return [item_id for item_id, _ in sorted_scores[:n]]

@router.post("/autocomplete")
async def autocomplete(user : user, db : db, request : Request, prompt: str):
    try:
        normalized_prompt = prompt.lower().strip()
        if not normalized_prompt:
            return []

        # Create cache key from user_id and normalized prompt
        cache_key = f"{user['_id']}:{normalized_prompt}"

        # FAST PATH: Check cache first
        if cache_key in autocomplete_cache:
            cached_entry = autocomplete_cache[cache_key]
            age = (datetime.now() - cached_entry['timestamp']).total_seconds()

            if age < CACHE_TTL:
                # Cache hit - move to end for LRU
                autocomplete_cache.move_to_end(cache_key)
                cache_stats["hits"] += 1
                print(f"✓ Cache HIT for '{prompt}' (age: {age:.1f}s, hit rate: {cache_stats['hits']}/{cache_stats['hits'] + cache_stats['misses']})")
                return cached_entry['results']
            else:
                # Expired - remove it
                del autocomplete_cache[cache_key]

        # SLOW PATH: Cache miss - perform RRF fusion
        cache_stats["misses"] += 1
        print(f"✗ Cache MISS for '{prompt}' (hit rate: {cache_stats['hits']}/{cache_stats['hits'] + cache_stats['misses']})")

        # Find matches using RRF fusion
        matches = await rrf_fusion(
            get_sparse_index, [prompt, db, user, 60, 50],
            find_dense_matches, [prompt, db, user, request, 40, 50],
            k=30,
            n=10
        )
        print(f"Autocomplete for '{prompt}': found {len(matches)} matches")
        print(f"Match IDs: {matches[:5]}")  # Print first 5 IDs

        output = []
        async def add_food_data(match_id, output, db, request):
            food_name = get_food_name(match_id, db, request)
            output.append({
                "food_id": str(match_id),  # Convert to string for consistency
                "food_name": food_name
            })

        await parallel_process(matches, add_food_data, [output, db, request])

        # Guarantee custom foods appear even when external indexes are stale.
        custom_matches = _search_user_custom_foods(prompt, user, db, limit=10)
        existing_ids = set()
        merged_output = []

        for item in custom_matches:
            item_id = str(item.get("food_id", ""))
            if item_id and item_id not in existing_ids:
                merged_output.append(item)
                existing_ids.add(item_id)

        for item in output:
            item_id = str(item.get("food_id", ""))
            if item_id and item_id not in existing_ids:
                merged_output.append(item)
                existing_ids.add(item_id)
            elif not item_id:
                merged_output.append(item)

        output = merged_output[:10]

        print(f"Autocomplete results: {[item['food_name'] for item in output[:3]]}")  # Print first 3 results

        # Store results in cache
        autocomplete_cache[cache_key] = {
            'results': output,
            'timestamp': datetime.now()
        }

        # LRU eviction if cache is too large
        if len(autocomplete_cache) > CACHE_MAX_SIZE:
            # Remove oldest entry (first item in OrderedDict)
            oldest_key = next(iter(autocomplete_cache))
            del autocomplete_cache[oldest_key]
            print(f"⚠ Cache evicted oldest entry (size: {len(autocomplete_cache)})")

        return output

    except Exception as e:
        print(f"Error in autocomplete: {e}")
        import traceback
        traceback.print_exc()
        return []


@router.get("/autocomplete/stats")
async def autocomplete_stats():
    """Get autocomplete cache statistics for monitoring and optimization.

    Returns cache size, hit rate, and performance metrics.
    Use this endpoint to verify cache is warming up and hitting >80% hit rate.
    """
    total_requests = cache_stats["hits"] + cache_stats["misses"]
    hit_rate = (cache_stats["hits"] / total_requests * 100) if total_requests > 0 else 0

    return {
        "cache_size": len(autocomplete_cache),
        "cache_max_size": CACHE_MAX_SIZE,
        "cache_ttl_seconds": CACHE_TTL,
        "hits": cache_stats["hits"],
        "misses": cache_stats["misses"],
        "total_requests": total_requests,
        "hit_rate_percent": round(hit_rate, 2),
        "status": "optimal" if hit_rate >= 80 else "warming_up" if total_requests < 100 else "needs_investigation"
    }


@router.get("/search/sparse")
async def test_sparse_food_search(
    food_name: str = Query(..., description="Food name to search for"),
    threshold: float = Query(40, description="Minimum score threshold (0-100)", ge=0, le=100),
    limit: int = Query(50, description="Maximum number of results", ge=1, le=100),
    user: user = None,
    db: db = None
):
        # Time ONLY the search, not the name lookup
        start_time = time.perf_counter()
        results = await get_sparse_index(food_name, db, user, threshold, limit)
        end_time = time.perf_counter()
        elapsed_ms = round((end_time - start_time) * 1000, 2)

        if not results:
            return {
                "query": food_name,
                "method": "sparse (Typesense)",
                "elapsed_ms": elapsed_ms,
                "results_count": 0,
                "matches": {},
                "message": "No foods found matching the query"
            }

        # AFTER timing, get food names for the matched IDs
        food_details = {}
        for food_id, score in results.items():
            # Query the database directly to get the food name
            try:
                # Handle both ObjectId (custom foods) and integer (USDA foods)
                try:
                    # Try as integer first (USDA foods)
                    food_doc = db.foods.find_one({"_id": int(food_id)})
                except (ValueError, TypeError):
                    # If that fails, try as ObjectId (custom foods)
                    from bson import ObjectId
                    food_doc = db.foods.find_one({"_id": ObjectId(food_id)})

                if food_doc and "food_name" in food_doc:
                    food_details[str(food_id)] = {
                        "name": food_doc["food_name"],
                        "score": score
                    }
                else:
                    food_details[str(food_id)] = {
                        "name": "Unknown food",
                        "score": score
                    }
            except Exception as e:
                print(f"Error looking up food {food_id}: {e}")
                food_details[str(food_id)] = {
                    "name": "Error retrieving name",
                    "score": score
                }

        return {
            "query": food_name,
            "method": "sparse (Typesense)",
            "elapsed_ms": elapsed_ms,
            "results_count": len(results),
            "matches": food_details
        }


@router.get("/search/dense")
async def test_dense_food_search(
    food_name: str = Query(..., description="Food name to search for"),
    threshold: float = Query(40, description="Minimum similarity threshold (0-100)", ge=0, le=100),
    limit: int = Query(50, description="Maximum number of results", ge=1, le=100),
    user: user = None,
    db: db = None,
    request: Request = None
):
    """
    Test dense (semantic/embedding-based) food search using FAISS.
    Uses cosine similarity with OpenAI embeddings.

    Example queries:
    - "butter"
    - "poultry"
    - "fruit"
    """
    try:
        # Time ONLY the search, not the name lookup
        start_time = time.perf_counter()
        results = await find_dense_matches(food_name, db, user, request, threshold, limit)
        end_time = time.perf_counter()
        elapsed_ms = round((end_time - start_time) * 1000, 2)

        if not results:
            return {
                "query": food_name,
                "method": "dense (FAISS embeddings)",
                "elapsed_ms": elapsed_ms,
                "results_count": 0,
                "matches": {},
                "message": "No foods found matching the query"
            }

        # AFTER timing, get food names for the matched IDs
        food_details = {}
        for food_id, score in results.items():
            # Query the database directly to get the food name
            try:
                # Handle both ObjectId (custom foods) and integer (USDA foods)
                try:
                    # Try as integer first (USDA foods)
                    food_doc = db.foods.find_one({"_id": int(food_id)})
                except (ValueError, TypeError):
                    # If that fails, try as ObjectId (custom foods)
                    from bson import ObjectId
                    food_doc = db.foods.find_one({"_id": ObjectId(food_id)})

                if food_doc and "food_name" in food_doc:
                    food_details[str(food_id)] = {
                        "name": food_doc["food_name"],
                        "score": score
                    }
                else:
                    food_details[str(food_id)] = {
                        "name": "Unknown food",
                        "score": score
                    }
            except Exception as e:
                print(f"Error looking up food {food_id}: {e}")
                food_details[str(food_id)] = {
                    "name": "Error retrieving name",
                    "score": score
                }

        return {
            "query": food_name,
            "method": "dense (FAISS embeddings)",
            "elapsed_ms": elapsed_ms,
            "results_count": len(results),
            "matches": food_details
        }
    except Exception as e:
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )


@router.get("/search/rrf")
async def test_rrf_food_search(
    food_name: str = Query(..., description="Food name to search for"),
    sparse_threshold: float = Query(60, description="Minimum sparse score threshold (0-100)", ge=0, le=100),
    dense_threshold: float = Query(40, description="Minimum dense score threshold (0-100)", ge=0, le=100),
    limit: int = Query(30, description="Maximum number of results per method", ge=1, le=100),
    top_n: int = Query(10, description="Number of top results to return after fusion", ge=1, le=50),
    user: user = None,
    db: db = None,
    request: Request = None
):
    """
    Test RRF (Reciprocal Rank Fusion) hybrid food search.
    Combines sparse (Typesense) and dense (FAISS) search with weighted fusion.

    Example queries:
    - "butter"
    - "chicken"
    - "apple juice"
    """
    try:
        # Time the entire search process
        start_time = time.perf_counter()

        # Get sparse and dense results separately for timing and counting
        sparse_start = time.perf_counter()
        sparse_results = await get_sparse_index(food_name, db, user, sparse_threshold, limit)
        dense_results = await find_dense_matches(food_name, db, user, request, dense_threshold, limit)
        search_time = time.perf_counter() - sparse_start

        # Perform RRF fusion
        fusion_start = time.perf_counter()
        top_food_ids = await rrf_fusion(
            get_sparse_index, [food_name, db, user, sparse_threshold, limit],
            find_dense_matches, [food_name, db, user, request, dense_threshold, limit],
            k=30,
            n=top_n
        )
        fusion_time = time.perf_counter() - fusion_start

        end_time = time.perf_counter()
        elapsed_ms = round((end_time - start_time) * 1000, 2)
        search_ms = round(search_time * 1000, 2)
        fusion_ms = round(fusion_time * 1000, 2)

        if not top_food_ids:
            return {
                "query": food_name,
                "method": "RRF (sparse + dense fusion)",
                "elapsed_ms": elapsed_ms,
                "search_ms": search_ms,
                "fusion_ms": fusion_ms,
                "sparse_count": len(sparse_results),
                "dense_count": len(dense_results),
                "results_count": 0,
                "matches": [],
                "message": "No foods found matching the query"
            }

        # AFTER all timing, get food names and scores for the top results
        food_details = []
        for rank, food_id in enumerate(top_food_ids, 1):
            # Query the database directly to get the food name
            try:
                # Handle both ObjectId (custom foods) and integer (USDA foods)
                try:
                    # Try as integer first (USDA foods)
                    food_doc = db.foods.find_one({"_id": int(food_id)})
                except (ValueError, TypeError):
                    # If that fails, try as ObjectId (custom foods)
                    from bson import ObjectId
                    food_doc = db.foods.find_one({"_id": ObjectId(food_id)})

                if food_doc and "food_name" in food_doc:
                    food_details.append({
                        "rank": rank,
                        "food_id": str(food_id),
                        "name": food_doc["food_name"],
                        "sparse_score": sparse_results.get(food_id),
                        "dense_score": dense_results.get(food_id)
                    })
                else:
                    food_details.append({
                        "rank": rank,
                        "food_id": str(food_id),
                        "name": "Unknown food",
                        "sparse_score": sparse_results.get(food_id),
                        "dense_score": dense_results.get(food_id)
                    })
            except Exception as e:
                print(f"Error looking up food {food_id}: {e}")
                food_details.append({
                    "rank": rank,
                    "food_id": str(food_id),
                    "name": "Error retrieving name",
                    "sparse_score": sparse_results.get(food_id),
                    "dense_score": dense_results.get(food_id)
                })

        return {
            "query": food_name,
            "method": "RRF (sparse + dense fusion)",
            "elapsed_ms": elapsed_ms,
            "search_ms": search_ms,
            "fusion_ms": fusion_ms,
            "sparse_count": len(sparse_results),
            "dense_count": len(dense_results),
            "results_count": len(food_details),
            "matches": food_details
        }
    except Exception as e:
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )


if __name__ == "__main__":
    # Import needed modules for standalone testing
    import os
    from dotenv import load_dotenv
    from pymongo import MongoClient

    # Load environment variables
    load_dotenv()

    async def main():
        print("Testing RRF fusion algorithm...")

        # Create mock user for testing
        mock_user = {"_id": "system"}

        # Sample prompt for testing
        sample_prompt = "butter"

        # Connect to MongoDB
        mongo_uri = os.getenv("MONGO_URI")
        db_name = os.getenv("DB_NAME", "nutramapper")
        mongo_client = MongoClient(mongo_uri)
        mongo_db = mongo_client[db_name]

        print(f"Connected to MongoDB, testing with real data for '{sample_prompt}'...")
        print(await autocomplete(mock_user, mongo_db, None, sample_prompt))

    # Run the async main function
    asyncio.run(main())
