from typing import Optional
from typing_extensions import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pymongo.database import Database
from pymongo import ReturnDocument
from bson import ObjectId
from bson.errors import InvalidId
from decimal import Decimal
import os
import shutil
import uuid
import pickle
import asyncio
import json
import smtplib
from datetime import datetime, timedelta
from email.message import EmailMessage
from openai import OpenAI
import numpy as np
import faiss

# Import database connection
from ..databases.mongo import get_data

# Import authentication
from ..routers.auth import get_current_user

# Import food parsing and nutrient search functions
from ..routers.parse_food import parse_new_food
from ..routers.sparse_search_nutrients import search_nutrients_by_name

# Import parallel processing function
from ..routers.parallel import parallel_process


router = APIRouter(prefix='/food', tags=['food'])

# Directory for storing uploaded images
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# a table of nutrient_id with functional equivalents
# mapped to a list of equivalent nutrient_ids that should be included in their total mapped to conversion factor
convert_map = {1114: [{1110: 0.025}]}

EMBEDDING_RETRY_COLLECTION = "embedding_retry_jobs"
EMBEDDING_FAILURE_LOG_COLLECTION = "embedding_failure_logs"


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


EMBEDDING_RETRY_MAX_ATTEMPTS = _env_int("EMBEDDING_RETRY_MAX_ATTEMPTS", 6)
EMBEDDING_RETRY_BASE_DELAY_SECONDS = _env_int("EMBEDDING_RETRY_BASE_DELAY_SECONDS", 10)
EMBEDDING_RETRY_MAX_DELAY_SECONDS = _env_int("EMBEDDING_RETRY_MAX_DELAY_SECONDS", 900)
TARGET_FOOD_EMBEDDING_DIM = _env_int("TARGET_FOOD_EMBEDDING_DIM", 3072)
EMBEDDING_FAILURE_ALERT_EMAIL = os.getenv("EMBEDDING_FAILURE_ALERT_EMAIL", "venn.divya@gmail.com")


def _normalize_food_id(food_id):
    if isinstance(food_id, (ObjectId, int)):
        return food_id
    if isinstance(food_id, str):
        stripped = food_id.strip()
        if stripped.isdigit():
            return int(stripped)
        if len(stripped) == 24 and ObjectId.is_valid(stripped):
            return ObjectId(stripped)
    return food_id


def _cache_food_key(food_id):
    if isinstance(food_id, int):
        return food_id
    if isinstance(food_id, ObjectId):
        return str(food_id)
    if isinstance(food_id, str):
        stripped = food_id.strip()
        if stripped.isdigit():
            return int(stripped)
        if len(stripped) == 24 and ObjectId.is_valid(stripped):
            return stripped
        return stripped
    return str(food_id)


def _retry_delay_seconds(attempt_number: int) -> int:
    attempt = max(1, int(attempt_number))
    delay = EMBEDDING_RETRY_BASE_DELAY_SECONDS * (2 ** (attempt - 1))
    return min(delay, EMBEDDING_RETRY_MAX_DELAY_SECONDS)


def _send_embedding_failure_email(
    food_id: str,
    food_name: str,
    user_id,
    error_message: str,
    attempt: int,
    source: str,
) -> bool:
    """
    Send an email alert for embedding failures.
    Uses SMTP_* environment variables for transport configuration.
    """
    smtp_host = os.getenv("SMTP_HOST")
    if not smtp_host:
        print("⚠ SMTP_HOST is not configured; cannot send embedding failure email alert")
        return False

    try:
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError:
        smtp_port = 587

    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM_EMAIL") or smtp_user or EMBEDDING_FAILURE_ALERT_EMAIL
    use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")
    use_ssl = os.getenv("SMTP_USE_SSL", "false").lower() in ("1", "true", "yes")

    msg = EmailMessage()
    msg["Subject"] = f"[NutraMap] Embedding failure for food {food_id}"
    msg["From"] = smtp_from
    msg["To"] = EMBEDDING_FAILURE_ALERT_EMAIL
    msg.set_content(
        "\n".join(
            [
                "A food embedding request failed.",
                f"food_id: {food_id}",
                f"food_name: {food_name}",
                f"user_id: {user_id}",
                f"source: {source}",
                f"attempt: {attempt}",
                f"error: {error_message}",
                f"timestamp_utc: {datetime.utcnow().isoformat()}",
            ]
        )
    )

    try:
        if use_ssl:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as server:
                if smtp_user and smtp_password:
                    server.login(smtp_user, smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
                if use_tls:
                    server.starttls()
                if smtp_user and smtp_password:
                    server.login(smtp_user, smtp_password)
                server.send_message(msg)
        return True
    except Exception as email_error:
        print(f"⚠ Failed to send embedding failure email for {food_id}: {email_error}")
        return False


def _generate_food_embedding(food_name: str) -> list:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")

    client = OpenAI(api_key=api_key)
    response = client.embeddings.create(
        model="text-embedding-3-large",
        input=(food_name or "").lower().strip(),
    )
    return response.data[0].embedding


def _sync_food_id_name_cache(app, food_id, food_name: str) -> None:
    food_id_cache_path = os.getenv("FOOD_ID_CACHE")
    cache_key = _cache_food_key(food_id)
    if food_id_cache_path:
        id_name_map = {}
        if os.path.exists(food_id_cache_path) and os.path.getsize(food_id_cache_path) > 0:
            with open(food_id_cache_path, "rb") as f:
                id_name_map = pickle.load(f)
        id_name_map[cache_key] = {"name": food_name}
        with open(food_id_cache_path, "wb") as f:
            pickle.dump(id_name_map, f)

    if app is not None:
        if not hasattr(app.state, "id_name_map") or app.state.id_name_map is None:
            app.state.id_name_map = {}
        app.state.id_name_map[cache_key] = {"name": food_name}


def _add_embedding_to_faiss(app, food_id, food_name: str, embedding: list) -> bool:
    if app is None or not hasattr(app, "state") or app.state.faiss_index is None:
        print("⚠ Warning: FAISS index not available in app state (will be included in next rebuild)")
        return False

    cache_food_id = _cache_food_key(food_id)
    cache_food_id_str = str(cache_food_id)
    faiss_index = app.state.faiss_index
    id_list = app.state.id_list if hasattr(app.state, "id_list") and app.state.id_list else []

    if len(embedding) != faiss_index.d:
        print(
            f"⚠ Warning: Embedding dimension mismatch! Embedding: {len(embedding)} dims, "
            f"FAISS index: {faiss_index.d} dims"
        )
        return False

    embedding_array = np.array([embedding], dtype=np.float32)
    faiss.normalize_L2(embedding_array)

    if not faiss_index.is_trained:
        print("⚠ Warning: FAISS index not trained, skipping add")
        return False

    if isinstance(cache_food_id, int):
        faiss_id = int(cache_food_id)
    else:
        faiss_id = hash(cache_food_id_str) & 0x7FFFFFFFFFFFFFFF
    id_array = np.array([faiss_id], dtype=np.int64)
    faiss_index.add_with_ids(embedding_array, id_array)

    if cache_food_id not in id_list:
        id_list.append(cache_food_id)
        app.state.id_list = id_list

    try:
        faiss_bin_path = os.getenv("FAISS_BIN", "./faiss_index.bin")
        faiss.write_index(faiss_index, faiss_bin_path)
    except Exception as bin_error:
        print(f"⚠ Warning: Could not persist FAISS index: {bin_error}")

    print(f"✓ Added food to FAISS index: {food_name} (index now has {faiss_index.ntotal} vectors)")
    return True


def _log_embedding_failure(
    db: Database,
    food_id: str,
    food_name: str,
    user_id,
    error_message: str,
    attempt: int,
    source: str,
) -> None:
    now = datetime.utcnow()
    try:
        db[EMBEDDING_FAILURE_LOG_COLLECTION].insert_one(
            {
                "food_id": food_id,
                "food_name": food_name,
                "user_id": str(user_id),
                "attempt": attempt,
                "source": source,
                "error": error_message,
                "created_at": now,
            }
        )
    except Exception as log_error:
        print(f"⚠ Warning: Failed to store embedding failure log for {food_id}: {log_error}")

    _send_embedding_failure_email(
        food_id=food_id,
        food_name=food_name,
        user_id=user_id,
        error_message=error_message,
        attempt=attempt,
        source=source,
    )


async def process_pending_embedding_retries(app, db: Database, max_jobs: int = 10) -> dict:
    """
    Retry failed custom-food embedding jobs and persist success/failure state.
    Optional maintenance helper (not run automatically at startup).
    """
    max_jobs = max(1, int(max_jobs))
    processed = 0
    succeeded = 0
    failed = 0

    retry_collection = db[EMBEDDING_RETRY_COLLECTION]

    for _ in range(max_jobs):
        now = datetime.utcnow()
        job = retry_collection.find_one_and_update(
            {"status": "pending", "next_retry_at": {"$lte": now}},
            {"$set": {"status": "processing", "updated_at": now, "processing_started_at": now}},
            sort=[("next_retry_at", 1), ("created_at", 1)],
            return_document=ReturnDocument.AFTER,
        )

        if not job:
            break

        processed += 1
        job_id = job["_id"]
        food_id = str(job.get("food_id", "")).strip()
        food_name = str(job.get("food_name", "")).strip()
        user_id = job.get("user_id")
        attempt = int(job.get("attempt_count", 0)) + 1
        max_attempts = int(job.get("max_attempts", EMBEDDING_RETRY_MAX_ATTEMPTS))
        mongo_food_id = _normalize_food_id(food_id)

        food_doc = db.foods.find_one({"_id": mongo_food_id}, {"_id": 1, "food_name": 1, "embedding": 1})
        if not food_doc:
            retry_collection.update_one(
                {"_id": job_id},
                {
                    "$set": {
                        "status": "failed",
                        "attempt_count": attempt,
                        "last_error": "Food document not found",
                        "last_error_at": now,
                        "updated_at": now,
                    }
                },
            )
            failed += 1
            continue

        if food_doc.get("embedding"):
            retry_collection.update_one(
                {"_id": job_id},
                {
                    "$set": {
                        "status": "completed",
                        "completed_at": now,
                        "updated_at": now,
                    }
                },
            )
            continue

        actual_name = food_doc.get("food_name") or food_name
        try:
            embedding = _generate_food_embedding(actual_name)
            db.foods.update_one(
                {"_id": food_doc["_id"]},
                {
                    "$set": {
                        "embedding": embedding,
                        "embedding_status": "ready",
                        "embedding_last_attempt_at": now,
                        "embedding_updated_at": now,
                    },
                    "$unset": {
                        "embedding_error": "",
                        "embedding_last_error_at": "",
                        "embedding_next_retry_at": "",
                    },
                },
            )

            resolved_food_id = str(food_doc["_id"])
            _add_embedding_to_faiss(app, resolved_food_id, actual_name, embedding)
            _sync_food_id_name_cache(app, resolved_food_id, actual_name)

            retry_collection.update_one(
                {"_id": job_id},
                {
                    "$set": {
                        "status": "completed",
                        "attempt_count": attempt,
                        "completed_at": now,
                        "updated_at": now,
                        "last_error": None,
                    }
                },
            )
            print(f"✓ Embedding retry succeeded for custom food '{actual_name}' ({resolved_food_id})")
            succeeded += 1
        except Exception as embed_error:
            error_message = str(embed_error)
            _log_embedding_failure(
                db=db,
                food_id=food_id,
                food_name=actual_name,
                user_id=user_id,
                error_message=error_message,
                attempt=attempt,
                source="retry_worker",
            )

            if attempt >= max_attempts:
                retry_collection.update_one(
                    {"_id": job_id},
                    {
                        "$set": {
                            "status": "failed",
                            "attempt_count": attempt,
                            "last_error": error_message,
                            "last_error_at": now,
                            "updated_at": now,
                        }
                    },
                )
                db.foods.update_one(
                    {"_id": food_doc["_id"]},
                    {
                        "$set": {
                            "embedding_status": "failed",
                            "embedding_error": error_message,
                            "embedding_last_error_at": now,
                            "embedding_last_attempt_at": now,
                        }
                    },
                )
                print(
                    f"⚠ Embedding retry exhausted for custom food '{actual_name}' "
                    f"({food_id}) after {attempt} attempts: {error_message}"
                )
            else:
                next_retry_at = now + timedelta(seconds=_retry_delay_seconds(attempt + 1))
                retry_collection.update_one(
                    {"_id": job_id},
                    {
                        "$set": {
                            "status": "pending",
                            "attempt_count": attempt,
                            "next_retry_at": next_retry_at,
                            "last_error": error_message,
                            "last_error_at": now,
                            "updated_at": now,
                        }
                    },
                )
                db.foods.update_one(
                    {"_id": food_doc["_id"]},
                    {
                        "$set": {
                            "embedding_status": "pending",
                            "embedding_error": error_message,
                            "embedding_last_error_at": now,
                            "embedding_last_attempt_at": now,
                            "embedding_next_retry_at": next_retry_at,
                        }
                    },
                )
                print(
                    f"⚠ Embedding retry failed for custom food '{actual_name}' ({food_id}) "
                    f"attempt {attempt}/{max_attempts}; next retry at {next_retry_at.isoformat()}: {error_message}"
                )
            failed += 1

    return {"processed": processed, "succeeded": succeeded, "failed": failed}


def _needs_embedding_repair(food_doc: dict, include_wrong_dim: bool = True) -> bool:
    state = _classify_embedding_state(food_doc)
    if state == "empty":
        return True
    if state.startswith("malformed") and (include_wrong_dim or state != "malformed_dim"):
        return True
    return False


def _classify_embedding_state(food_doc: dict) -> str:
    """
    Classify embedding health for one food doc.
    Returns one of: valid | empty | malformed_type | malformed_dim
    """
    if "embedding" not in food_doc:
        return "empty"

    embedding = food_doc.get("embedding")
    if embedding is None:
        return "empty"

    if isinstance(embedding, list):
        if len(embedding) == 0:
            return "empty"
        if len(embedding) != TARGET_FOOD_EMBEDDING_DIM:
            return "malformed_dim"
        return "valid"

    return "malformed_type"


async def repair_custom_food_embeddings(
    app,
    db: Database,
    limit: Optional[int] = None,
    include_wrong_dim: bool = True,
    dry_run: bool = False,
) -> dict:
    """
    Repair foods that are missing embeddings (or have wrong dimensions).
    On transient OpenAI failures, records failure for manual follow-up.
    """
    effective_limit = None if limit is None else max(1, int(limit))
    now = datetime.utcnow()

    cursor = db.foods.find(
        {},
        {"_id": 1, "food_name": 1, "source": 1, "embedding": 1, "created_at": 1},
    )

    scanned = 0
    records_with_empty_embedding = 0
    records_with_malformed_embedding = 0
    malformed_dim_count = 0
    malformed_type_count = 0
    needs_repair = 0
    attempted_repairs = 0
    repaired = 0
    failed = 0
    skipped_valid = 0
    skipped_invalid_name = 0
    skipped_due_to_limit = 0
    repaired_ids = []
    unfixed_records = []

    for doc in cursor:
        scanned += 1

        embedding_state = _classify_embedding_state(doc)

        if embedding_state == "valid":
            skipped_valid += 1
            continue

        food_id = str(doc["_id"])
        food_name = doc.get("food_name")
        if embedding_state == "empty":
            records_with_empty_embedding += 1
        elif embedding_state in ("malformed_dim", "malformed_type"):
            records_with_malformed_embedding += 1
            if embedding_state == "malformed_dim":
                malformed_dim_count += 1
            else:
                malformed_type_count += 1

        is_candidate = (
            embedding_state == "empty"
            or embedding_state == "malformed_type"
            or (embedding_state == "malformed_dim" and include_wrong_dim)
        )

        if not is_candidate:
            unfixed_records.append(
                {
                    "id": food_id,
                    "food_name": food_name,
                    "reason": "wrong_dim_skipped_include_wrong_dim_false",
                    "embedding_state": embedding_state,
                }
            )
            continue

        needs_repair += 1

        if effective_limit is not None and attempted_repairs >= effective_limit:
            skipped_due_to_limit += 1
            unfixed_records.append(
                {
                    "id": food_id,
                    "food_name": food_name,
                    "reason": "limit_reached",
                    "embedding_state": embedding_state,
                }
            )
            continue

        if not isinstance(food_name, str) or not food_name.strip():
            skipped_invalid_name += 1
            unfixed_records.append(
                {
                    "id": food_id,
                    "food_name": food_name,
                    "reason": "invalid_food_name",
                    "embedding_state": embedding_state,
                }
            )
            continue

        attempted_repairs += 1
        food_name = food_name.strip()
        source_user_id = doc.get("source")

        if dry_run:
            unfixed_records.append(
                {
                    "id": food_id,
                    "food_name": food_name,
                    "reason": "dry_run",
                    "embedding_state": embedding_state,
                }
            )
            continue

        try:
            embedding = _generate_food_embedding(food_name)
            repaired_at = datetime.utcnow()
            db.foods.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "embedding": embedding,
                        "embedding_status": "ready",
                        "embedding_last_attempt_at": repaired_at,
                        "embedding_updated_at": repaired_at,
                    },
                    "$unset": {
                        "embedding_error": "",
                        "embedding_last_error_at": "",
                        "embedding_next_retry_at": "",
                    },
                },
            )

            _add_embedding_to_faiss(app, doc["_id"], food_name, embedding)
            _sync_food_id_name_cache(app, doc["_id"], food_name)

            try:
                from .sparse import _get_client as get_typesense_client

                tc = get_typesense_client()
                if tc:
                    tc.collections["foods"].documents.upsert({"id": food_id, "food_name": food_name})
            except Exception as typesense_error:
                print(f"⚠ Warning: Typesense upsert failed while repairing {food_id}: {typesense_error}")

            try:
                if source_user_id is not None:
                    from .match import upsert_custom_food_in_autocomplete_cache

                    upsert_custom_food_in_autocomplete_cache(str(source_user_id), food_id, food_name)
            except Exception as cache_error:
                print(f"⚠ Warning: Could not patch autocomplete cache for repaired food {food_id}: {cache_error}")

            db[EMBEDDING_RETRY_COLLECTION].update_one(
                {"food_id": food_id},
                {
                    "$set": {
                        "status": "completed",
                        "updated_at": repaired_at,
                        "completed_at": repaired_at,
                        "last_error": None,
                    }
                },
                upsert=False,
            )

            repaired += 1
            repaired_ids.append(food_id)
        except Exception as embed_error:
            error_message = str(embed_error)
            _log_embedding_failure(
                db=db,
                food_id=food_id,
                food_name=food_name,
                user_id=source_user_id,
                error_message=error_message,
                attempt=1,
                source="repair_custom_food_embeddings",
            )
            db.foods.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "embedding_status": "failed",
                        "embedding_error": error_message,
                        "embedding_last_error_at": datetime.utcnow(),
                        "embedding_last_attempt_at": datetime.utcnow(),
                    }
                },
            )
            failed += 1
            unfixed_records.append(
                {
                    "id": food_id,
                    "food_name": food_name,
                    "reason": "embedding_generation_failed",
                    "embedding_state": embedding_state,
                    "error": error_message,
                }
            )

    unfixed_ids = [record["id"] for record in unfixed_records]
    records_with_embedding_issues = records_with_empty_embedding + records_with_malformed_embedding

    return {
        "scanned": scanned,
        "records_with_empty_embedding": records_with_empty_embedding,
        "records_with_malformed_embedding": records_with_malformed_embedding,
        "malformed_dim_count": malformed_dim_count,
        "malformed_type_count": malformed_type_count,
        "records_with_embedding_issues": records_with_embedding_issues,
        "needs_repair": needs_repair,
        "attempted_repairs": attempted_repairs,
        "repaired": repaired,
        "failed_now": failed,
        "skipped_valid": skipped_valid,
        "skipped_invalid_name": skipped_invalid_name,
        "skipped_due_to_limit": skipped_due_to_limit,
        "dry_run": dry_run,
        "target_embedding_dim": TARGET_FOOD_EMBEDDING_DIM,
        "effective_limit": effective_limit,
        "repaired_ids": repaired_ids,
        "unfixed_ids": unfixed_ids,
        "unfixed_records": unfixed_records,
        "timestamp": now.isoformat(),
    }

def serialize_bson(value):
    """Recursively convert BSON types (like ObjectId) to JSON-safe values."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {k: serialize_bson(v) for k, v in value.items()}
    if isinstance(value, list):
        return [serialize_bson(v) for v in value]
    return value

def normalize_nutrient_id(value):
    """Convert nutrient IDs to ints when possible, otherwise keep the original value."""
    if isinstance(value, int):
        return value
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return value

def normalize_nutrient_amount(value):
    """Normalize nutrient amounts to numeric values."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        return value
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0

def normalize_nutrients_to_list(nutrients):
    """
    Normalize nutrient payloads to list form:
    [{nutrient_id: int|str, amt: number}, ...]
    """
    if isinstance(nutrients, list):
        normalized = []
        for nutrient in nutrients:
            if not isinstance(nutrient, dict):
                continue
            if "nutrient_id" not in nutrient:
                continue
            nutrient_id = normalize_nutrient_id(nutrient.get("nutrient_id"))
            amount = nutrient.get("amt", nutrient.get("amount", 0))
            normalized.append({
                "nutrient_id": nutrient_id,
                "amt": normalize_nutrient_amount(amount),
            })
        return normalized

    if isinstance(nutrients, dict):
        return [
            {
                "nutrient_id": normalize_nutrient_id(nutrient_id),
                "amt": normalize_nutrient_amount(amount),
            }
            for nutrient_id, amount in nutrients.items()
        ]

    return []

def normalize_nutrients_to_dict(nutrients):
    """Normalize nutrient payloads to dict form: {nutrient_id: amount}."""
    normalized = {}
    for nutrient in normalize_nutrients_to_list(nutrients):
        nutrient_id = nutrient.get("nutrient_id")
        if nutrient_id is None:
            continue
        normalized[str(nutrient_id)] = nutrient.get("amt", 0)
    return normalized

async def process_nutrient_conversion(target_id_pair, convert_map, expanded_nutrient_ids, conversion_sources):
    """Process a single nutrient ID for conversion mapping"""
    target_id = target_id_pair
    if target_id in convert_map:
        # For each target nutrient, add all source nutrients to the expanded list
        for source_dict in convert_map[target_id]:
            for source_id in source_dict:
                if source_id not in expanded_nutrient_ids:
                    expanded_nutrient_ids.append(source_id)
                # Track which sources map to which targets and their conversion factors
                if target_id not in conversion_sources:
                    conversion_sources[target_id] = []
                conversion_sources[target_id].append((source_id, source_dict[source_id]))
    return target_id

async def apply_conversion(conversion_pair, tally):
    """Apply conversion factor to a single source-target pair"""
    target_id, sources = conversion_pair
    for source_id, conversion_factor in sources:
        if source_id in tally:
            # Convert the source amount and add it to the target
            converted_amount = tally[source_id] * conversion_factor
            if target_id in tally:
                tally[target_id] += converted_amount
            else:
                tally[target_id] = converted_amount
    return target_id

def consolidate_amounts(db, user_id, start_date: datetime, end_date: datetime, nutrient_ids: list):
    return asyncio.run(consolidate_amounts_async(db, user_id, start_date, end_date, nutrient_ids))

async def consolidate_amounts_async(db, user_id, start_date: datetime, end_date: datetime, nutrient_ids: list):

    expanded_nutrient_ids = nutrient_ids.copy()
    conversion_sources = {}
    
    # Process nutrient conversions in parallel
    await parallel_process(
        nutrient_ids, 
        process_nutrient_conversion, 
        [convert_map, expanded_nutrient_ids, conversion_sources]
    )
    
    # Step 2: Get the total nutrients for the expanded list
    tally = get_total_nutrients(db, user_id, start_date, end_date, expanded_nutrient_ids)
    
    # Step 3: Apply conversions and consolidate amounts in parallel
    if conversion_sources:
        conversion_items = list(conversion_sources.items())
        await parallel_process(
            conversion_items,
            apply_conversion,
            [tally]
        )
    
    # Step 4: Remove source nutrients that were only used for conversion
    # (only if they weren't in the original nutrient_ids list)
    final_tally = {}
    for nutrient_id in nutrient_ids:
        if nutrient_id in tally:
            final_tally[nutrient_id] = tally[nutrient_id]
        else:
            final_tally[nutrient_id] = 0
            
    return final_tally

def get_total_nutrients(db, user_id: str, start_date: datetime, end_date: datetime, nutrient_ids: list):
    # Updated pipeline to handle new log structure with components array
    pipeline = [
        {
            "$match": {
                "user_id": ObjectId(user_id),
                "date": {
                    "$gte": start_date,
                    "$lte": end_date
                }
            }
        },
        # Unwind the components array to process each food item
        { "$unwind": "$components" },
        # Normalize component food IDs so custom-food ObjectId strings still join.
        {
            "$addFields": {
                "component_food_id_normalized": {
                    "$let": {
                        "vars": {"raw_food_id": "$components.food_id"},
                        "in": {
                            "$switch": {
                                "branches": [
                                    {
                                        "case": {
                                            "$and": [
                                                {"$eq": [{"$type": "$$raw_food_id"}, "string"]},
                                                {"$regexMatch": {"input": "$$raw_food_id", "regex": "^[0-9a-fA-F]{24}$"}}
                                            ]
                                        },
                                        "then": {"$toObjectId": "$$raw_food_id"}
                                    },
                                    {
                                        "case": {
                                            "$and": [
                                                {"$eq": [{"$type": "$$raw_food_id"}, "string"]},
                                                {"$regexMatch": {"input": "$$raw_food_id", "regex": "^[0-9]+$"}}
                                            ]
                                        },
                                        "then": {"$toInt": "$$raw_food_id"}
                                    },
                                ],
                                "default": "$$raw_food_id"
                            }
                        }
                    }
                }
            }
        },
        {
            "$lookup": {
                "from": "foods",
                "localField": "component_food_id_normalized",
                "foreignField": "_id",
                "as": "food"
            }
        },
        { "$unwind": "$food" },
        { "$unwind": "$food.nutrients" },
        {
            "$addFields": {
                "food_nutrient_id_normalized": {
                    "$convert": {
                        "input": "$food.nutrients.nutrient_id",
                        "to": "int",
                        "onError": -1,
                        "onNull": -1
                    }
                },
                "food_nutrient_amt_normalized": {
                    "$convert": {
                        "input": {"$ifNull": ["$food.nutrients.amt", "$food.nutrients.amount"]},
                        "to": "double",
                        "onError": 0,
                        "onNull": 0
                    }
                },
                "component_weight_grams_normalized": {
                    "$convert": {
                        "input": "$components.weight_in_grams",
                        "to": "double",
                        "onError": 0,
                        "onNull": 0
                    }
                }
            }
        },
        {
            "$match": {
                "food_nutrient_id_normalized": { "$in": nutrient_ids }
            }
        },
        {
            "$project": {
                "nutrient_id": "$food_nutrient_id_normalized",
                "scaled_amt": {
                    "$multiply": [
                        "$food_nutrient_amt_normalized",
                        { "$divide": ["$component_weight_grams_normalized", 100] }
                    ]
                }
            }
        },
        {
            "$group": {
                "_id": "$nutrient_id",
                "total": { "$sum": "$scaled_amt" }
            }
        }
    ]

    # Get the aggregation results
    results = list(db.logs.aggregate(pipeline))

    # Convert from list of dictionaries to a single dictionary
    tally = {}
    for result in results:
        tally[result["_id"]] = result["total"]

    # Initialize any missing nutrients to 0
    for nutrient_id in nutrient_ids:
        if nutrient_id not in tally:
            tally[nutrient_id] = 0

    return tally

@router.get("/nutrients", response_model=None)
async def get_food_nutrients(
    food_id: str,
    amount_in_grams: float,
    db: Annotated[Database, Depends(get_data)] = None
):
    """
    Get nutrients for a specific food with a given amount in grams.
    Supports both USDA foods (integer IDs) and custom foods (ObjectId strings).
    """
    try:
        # Convert string ObjectIds to ObjectId for custom foods, keep integers for USDA foods
        if isinstance(food_id, str) and len(food_id) == 24:
            # Custom food with ObjectId
            search_id = ObjectId(food_id)
        else:
            # USDA food with integer ID
            try:
                search_id = int(food_id)
            except ValueError:
                # If it's not a valid int or ObjectId, return empty
                return {}

        # Query the food
        food = db.foods.find_one({"_id": search_id}, {"nutrients": 1, "_id": 0})

        if not food or "nutrients" not in food:
            return {}

        # Calculate prorated amounts (nutrients are per 100g)
        proration_factor = amount_in_grams / 100
        result = {}

        for nutrient in food["nutrients"]:
            nutrient_amt = nutrient.get("amt", nutrient.get("amount", 0))
            prorated_amount = nutrient_amt * proration_factor
            if prorated_amount > 0:
                result[nutrient["nutrient_id"]] = prorated_amount

        return result

    except Exception as e:
        print(f"Error getting food nutrients: {e}")
        import traceback
        traceback.print_exc()
        return {}

@router.get("/panel", response_model=None)
async def get_nutrient_panel(log_id: str, db: Annotated[Database, Depends(get_data)] = None):
    # Check if log_id is actually a component ID (format: "log_id-component_index")
    component_index = None
    actual_log_id = log_id

    if "-" in log_id:
        parts = log_id.split("-")
        # Check if the last part is a digit (component index)
        if len(parts) >= 2 and parts[-1].isdigit():
            component_index = int(parts[-1])
            # Reconstruct the log_id without the component index
            actual_log_id = "-".join(parts[:-1])

    log = db.logs.find_one({"_id": ObjectId(actual_log_id)})
    if not log:
        return {}

    # Handle new log structure with components array
    if "components" in log and isinstance(log["components"], list):
        result = {}

        # If component_index is specified, only show that component's nutrients
        if component_index is not None:
            if component_index < len(log["components"]):
                component = log["components"][component_index]
                food_id = component.get("food_id")
                weight_in_grams = component.get("weight_in_grams", 0)

                if food_id:
                    normalized_food_id = _normalize_food_id(food_id)
                    food = db.foods.find_one({"_id": normalized_food_id}, {"nutrients": 1, "_id": 0})
                    if food and "nutrients" in food:
                        try:
                            proration_factor = float(weight_in_grams) / 100
                        except (TypeError, ValueError):
                            proration_factor = 0

                        for nutrient in food["nutrients"]:
                            nutrient_amt = nutrient.get("amt", nutrient.get("amount", 0))
                            prorated_amount = nutrient_amt * proration_factor
                            if prorated_amount > 0:
                                result[nutrient["nutrient_id"]] = prorated_amount

            return result

        # Otherwise, aggregate nutrients from all components (full recipe)
        for component in log["components"]:
            food_id = component.get("food_id")
            weight_in_grams = component.get("weight_in_grams", 0)

            if not food_id:
                continue

            normalized_food_id = _normalize_food_id(food_id)
            food = db.foods.find_one({"_id": normalized_food_id}, {"nutrients": 1, "_id": 0})
            if not food or "nutrients" not in food:
                continue

            try:
                proration_factor = float(weight_in_grams) / 100  # Assuming nutrients are per 100g
            except (TypeError, ValueError):
                proration_factor = 0

            for nutrient in food["nutrients"]:
                nutrient_amt = nutrient.get("amt", nutrient.get("amount", 0))
                prorated_amount = nutrient_amt * proration_factor
                if prorated_amount > 0:
                    nutrient_id = nutrient["nutrient_id"]
                    result[nutrient_id] = result.get(nutrient_id, 0) + prorated_amount

        return result

    # Fallback for old log structure (backward compatibility)
    elif "food_id" in log:
        normalized_food_id = _normalize_food_id(log["food_id"])
        food = db.foods.find_one({"_id": normalized_food_id}, {"nutrients": 1, "_id": 0})
        if not food or "nutrients" not in food:
            return {}

        try:
            proration_factor = float(log.get("weight_in_grams", 0)) / 100  # Assuming nutrients are per 100g
        except (TypeError, ValueError):
            proration_factor = 0
        result = {}

        for nutrient in food["nutrients"]:
            nutrient_amt = nutrient.get("amt", nutrient.get("amount", 0))
            prorated_amount = nutrient_amt * proration_factor
            if prorated_amount > 0:
                result[nutrient["nutrient_id"]] = prorated_amount

        return result

    return {}

def get_nutrient_details(db, nutrient_id: int):
    """
    Retrieve nutrient details (name and unit) from MongoDB.
    """
    # Query the nutrients collection for the given nutrient ID
    nutrient = db.nutrients.find_one({"_id": nutrient_id}, {"nutrient_name": 1, "unit": 1, "_id": 1})
    
    if not nutrient:
        raise LookupError("no nutrients of that id")
    
    return {
        "name": nutrient["nutrient_name"],
        "unit": nutrient["unit"]
    }

def get_food_name(food_id: int, db: Annotated[Database, Depends(get_data)] = None, request: Request = None):
    # Check app state first
    lookup_id = food_id
    if isinstance(food_id, str):
        stripped = food_id.strip()
        if stripped.isdigit():
            lookup_id = int(stripped)

    if request is not None and hasattr(request.app.state, 'id_name_map') and lookup_id in request.app.state.id_name_map:
        food_data = request.app.state.id_name_map[lookup_id]
        # Handle both dict format {"name": "..."} and string format
        return food_data["name"] if isinstance(food_data, dict) else food_data

    # Then check pickle
    try:
        cache_path = os.getenv("FOOD_ID_CACHE")
        if not cache_path:
            raise FileNotFoundError("FOOD_ID_CACHE is not configured")

        with open(cache_path, 'rb') as f:
            foods = pickle.load(f)
            if lookup_id in foods:
                food_data = foods[lookup_id]
                # Handle both dict format {"name": "..."} and string format
                return food_data["name"] if isinstance(food_data, dict) else food_data
    except (FileNotFoundError, pickle.UnpicklingError, TypeError, OSError) as e:
        print(f"Warning: Failed to load pickle cache: {e}")

    # Finally, default to MongoDB query
    # Convert IDs safely:
    # - numeric strings map to int USDA IDs
    # - 24-char ObjectId strings map to ObjectId
    # - invalid strings return "No data found." instead of throwing InvalidId
    query_id = lookup_id
    if isinstance(lookup_id, str):
        stripped = lookup_id.strip()
        if stripped.isdigit():
            query_id = int(stripped)
        elif len(stripped) == 24 and ObjectId.is_valid(stripped):
            query_id = ObjectId(stripped)
        else:
            print(f"Warning: Invalid food ID format: {food_id}")
            return "No data found."

    food = db.foods.find_one({"_id": query_id}, {"food_name": 1, "_id": 0})

    if not food:
        print(f"Warning: Food ID {food_id} not found in database")
        return "No data found."

    return food["food_name"]

def amount_by_weight(amt: float, grams: float):
  return Decimal(amt) * Decimal(grams/100.0)

async def retrieve_food_list(request: Request, db: Annotated[Database, Depends(get_data)] = None, user: Annotated[dict, Depends(get_current_user)] = None):
    # Check app state first
    if request is not None and hasattr(request.app.state, 'id_name_map'):
        return request.app.state.id_name_map

    # Then check pickle
    try:
        with open(os.getenv("FOOD_ID_CACHE"), 'rb') as f:
            foods = pickle.load(f)
            request.app.state.id_name_map = foods
            return foods
    except (FileNotFoundError, pickle.UnpicklingError):
        pass

    # Finally, default to MongoDB query using the parallel processing function
    id_name_map = await get_foods_list(db, user)
    
    # Store in app state and cache
    if not isinstance(id_name_map, JSONResponse):  # Make sure it's not an error response
        request.app.state.id_name_map = id_name_map
        with open(os.getenv("FOOD_ID_CACHE"), 'wb') as f:
            pickle.dump(id_name_map, f)
    
    return id_name_map



async def get_foods_list(db: Annotated[Database, Depends(get_data)] = None, user: Annotated[dict, Depends(get_current_user)] = None): 
  foods = list(db.foods.find(
        {"$or": [{"source": "USDA"}, {"source": user["_id"]}]},  # Match source "USDA" or user ID
        {"_id": 1, "food_name": 1, "source": 1}  # Retrieve only `_id` and `food_name`
    ).sort("_id", 1))
  if not foods:
      return JSONResponse(content={"message": "No data found."}, status_code=404)

  # Format the result as a dictionary
  return {food["_id"]: {"name": food["food_name"]} for food in foods}

async def food_embedding_map(db: Annotated[Database, Depends(get_data)] = None, user: Annotated[dict, Depends(get_current_user)] = None):
  # Use regular for loop since pymongo cursors are synchronous
  foods = list(db.foods.find(
        {"$or": [{"source": "USDA"}, {"source": user["_id"]}]},  # Match source "USDA" or user ID
        {"_id": 1, "embedding": 1}  # Retrieve only `_id` and `embedding`
    ).sort("_id", 1))

  if not foods:
      return JSONResponse(content={"message": "No data found."}, status_code=404)

  # Format the result as a dictionary
  return {food["_id"]: food["embedding"] for food in foods}

async def food_name_map(request: Request, db: Annotated[Database, Depends(get_data)] = None, user: Annotated[dict, Depends(get_current_user)] = None):
    id_name_map = await retrieve_food_list(request, db, user)
    
    # Swap keys and values: from {id: {name, source}} to {name: {id, source}}
    result = {{food_info['name']: food_id} for food_id, food_info in id_name_map.items()}

    return result

async def get_user_custom_foods(db: Database, user: dict):
    """
    Get user's custom foods with descriptions.
    Returns a list of dictionaries with food_id and food_name.
    Used internally by parse_meal and other functions.
    """
    # Get user's custom food IDs
    user_doc = db.users.find_one({"_id": user["_id"]})
    if not user_doc or "custom_foods" not in user_doc:
        return []

    custom_food_ids = user_doc.get("custom_foods", [])

    if not custom_food_ids:
        return []

    # Convert string IDs to ObjectIds for query
    object_ids = [ObjectId(food_id) for food_id in custom_food_ids]

    # Query foods collection for these IDs
    custom_foods = list(db.foods.find(
        {"_id": {"$in": object_ids}},
        {"_id": 1, "food_name": 1}
    ))

    # Format result
    result = [
        {
            "food_id": str(food["_id"]),
            "food_name": food.get("food_name", "Unknown")
        }
        for food in custom_foods
    ]

    return result

@router.get("/custom-foods")
async def get_custom_foods(
    db: Annotated[Database, Depends(get_data)] = None,
    user: Annotated[dict, Depends(get_current_user)] = None,
    request: Request = None
):
    # Query MongoDB for custom foods
    custom_foods = list(db.foods.find(
        {"source": user["_id"]},
        {"_id": 1, "food_name": 1, "nutrients": 1}
    ))

    # Format the result
    formatted_foods = [
        {
            "_id": str(food["_id"]),
            "name": food.get("food_name", ""),
            "nutrients": normalize_nutrients_to_dict(food.get("nutrients", [])),
        }
        for food in custom_foods
    ]

    return formatted_foods


@router.get("/custom_foods/{food_id}/used-in")
def get_food_usage(
    food_id: str,
    db: Database = Depends(get_data),
    user: dict = Depends(get_current_user),
):
    """Return the names of recipes that contain this custom food as a component."""
    if not ObjectId.is_valid(food_id):
        raise HTTPException(status_code=400, detail="Invalid food ID")

    custom_food_id = ObjectId(food_id)
    food = db.foods.find_one({"_id": custom_food_id, "source": user["_id"]})
    if not food:
        raise HTTPException(status_code=404, detail="Food not found")

    candidate_component_ids = [food_id, custom_food_id]
    recipes = list(db.recipes.find(
        {"user_id": user["_id"], "components.food_id": {"$in": candidate_component_ids}},
        {"description": 1, "_id": 0}
    ))
    recipe_names = [r.get("description", "Unknown recipe") for r in recipes]
    return {"recipe_names": recipe_names}


@router.delete("/custom_foods/{food_id}")
def delete_custom_food(
    food_id: str,
    db: Database = Depends(get_data),
    user: dict = Depends(get_current_user),
    request: Request = None
):
    """
    Delete a custom food and remove from search indexes.

    Args:
        food_id: ID of the food to delete
        db: MongoDB database connection
        user: Current authenticated user
        request: FastAPI request object for accessing app state

    Returns:
        Success message
    """
    try:
        if not ObjectId.is_valid(food_id):
            raise HTTPException(status_code=400, detail="Invalid food ID")
        custom_food_id = ObjectId(food_id)

        # Find the food to delete (custom foods use 'source' field, not 'user_id')
        food = db.foods.find_one({"_id": custom_food_id, "source": user["_id"]})

        if not food:
            raise HTTPException(status_code=404, detail="Food not found")

        # Delete the food from MongoDB
        result = db.foods.delete_one({"_id": custom_food_id, "source": user["_id"]})

        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Food not found")

        # Remove food from any recipe components that reference it
        candidate_component_ids = [food_id, custom_food_id]
        result_recipes = db.recipes.update_many(
            {"user_id": user["_id"], "components.food_id": {"$in": candidate_component_ids}},
            {"$pull": {"components": {"food_id": {"$in": candidate_component_ids}}}}
        )
        if result_recipes.modified_count:
            print(f"✓ Removed food {food_id} from {result_recipes.modified_count} recipe(s)")

        # Remove food_id from user's custom_foods array
        db.users.update_one(
            {"_id": ObjectId(user["_id"])},
            {"$pull": {"custom_foods": food_id}}
        )
        print(f"✓ Removed food_id {food_id} from user's custom_foods list")

        # Delete the image if it exists
        if "image_path" in food and food["image_path"]:
            image_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), food["image_path"])
            if os.path.exists(image_path):
                os.remove(image_path)

        # Remove from Typesense (sparse search) index
        try:
            from .sparse import _get_client as get_typesense_client

            typesense_client = get_typesense_client()
            if typesense_client:
                typesense_client.collections['foods'].documents[food_id].delete()
                print(f"✓ Removed food from Typesense index: {food_id}")
        except Exception as e:
            print(f"⚠ Warning: Could not remove from Typesense: {e}")

        # Remove from FAISS index incrementally using IndexIDMap
        try:
            from ..routers.dense import remove_from_faiss_index
            success = remove_from_faiss_index(food_id, request)
            if success:
                print(f"✓ Removed food from FAISS index: {food_id}")
            else:
                print(f"⚠ Could not remove from FAISS index, may need rebuild")
        except Exception as e:
            print(f"⚠ Warning: Error removing from FAISS index: {e}")
            import traceback
            traceback.print_exc()

        # Remove deleted food from cached autocomplete results immediately.
        try:
            from .match import remove_custom_food_from_autocomplete_cache
            remove_custom_food_from_autocomplete_cache(str(user["_id"]), food_id)
        except Exception as cache_error:
            print(f"⚠ Warning: Could not patch autocomplete cache: {cache_error}")

        print(f"✓ Deleted custom food: {food.get('food_name', food_id)}")
        return {"message": "Food deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting food: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error deleting food: {str(e)}")

@router.put("/custom_foods/{food_id}")
async def update_custom_food(
    food_id: str,
    name: str,
    db: Annotated[Database, Depends(get_data)] = None,
    user: Annotated[dict, Depends(get_current_user)] = None,
    request: Request = None,
):
    """
    Update a custom food's name.

    Args:
        food_id: ID of the food to update
        name: New name for the food
        db: MongoDB database connection
        user: Current authenticated user

    Returns:
        Updated food document
    """
    try:
        # Find the food to update (custom foods are scoped by `source`)
        food = db.foods.find_one({"_id": ObjectId(food_id), "source": user["_id"]})
        if not food:
            raise HTTPException(status_code=404, detail="Food not found")

        result = db.foods.update_one(
            {"_id": ObjectId(food_id), "source": user["_id"]},
            {"$set": {"food_name": name, "updated_at": datetime.utcnow()}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Food not found")

        # Keep sparse index in sync for autocomplete.
        try:
            from .sparse import _get_client as get_typesense_client
            typesense_client = get_typesense_client()
            if typesense_client:
                typesense_client.collections['foods'].documents[food_id].update({"food_name": name})
        except Exception as typesense_error:
            print(f"⚠ Warning: Could not update Typesense document for custom food {food_id}: {typesense_error}")

        # Keep in-memory/disk food-name cache in sync.
        try:
            food_id_cache_path = os.getenv("FOOD_ID_CACHE")
            if food_id_cache_path and os.path.exists(food_id_cache_path):
                with open(food_id_cache_path, "rb") as f:
                    id_name_map = pickle.load(f)
                id_name_map[food_id] = {"name": name}
                with open(food_id_cache_path, "wb") as f:
                    pickle.dump(id_name_map, f)
            if request is not None and hasattr(request.app.state, "id_name_map"):
                request.app.state.id_name_map[food_id] = {"name": name}
        except Exception as cache_error:
            print(f"⚠ Warning: Could not update FOOD_ID_CACHE for custom food {food_id}: {cache_error}")

        # Patch autocomplete cache so renamed food appears immediately.
        try:
            from .match import upsert_custom_food_in_autocomplete_cache
            upsert_custom_food_in_autocomplete_cache(str(user["_id"]), food_id, name)
        except Exception as cache_error:
            print(f"⚠ Warning: Could not patch autocomplete cache: {cache_error}")

        updated_food = db.foods.find_one({"_id": ObjectId(food_id)}, {"_id": 1, "food_name": 1, "nutrients": 1})
        if not updated_food:
            raise HTTPException(status_code=404, detail="Food not found after update")
        return {
            "_id": str(updated_food["_id"]),
            "name": updated_food.get("food_name", ""),
            "nutrients": normalize_nutrients_to_dict(updated_food.get("nutrients", [])),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating food: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating food: {str(e)}")


@router.put("/update-nutrients/{food_id}")
def update_food_nutrients(
    food_id: str,
    nutrients: str = Form(...),
    db: Database = Depends(get_data),
    user: dict = Depends(get_current_user)
):
    """
    Update a custom food's nutrients.

    Args:
        food_id: ID of the food to update
        nutrients: JSON string of nutrient array [{"nutrient_id": int, "amt": float}, ...]
        db: MongoDB database connection
        user: Current authenticated user

    Returns:
        Success message
    """
    try:
        # Parse the nutrients JSON
        nutrients_data = json.loads(nutrients)

        # Keep nutrient storage consistent with foods collection:
        # [{nutrient_id, amt}, ...]
        nutrients_list = normalize_nutrients_to_list(nutrients_data)

        # Update the food
        result = db.foods.update_one(
            {"_id": ObjectId(food_id), "source": user["_id"]},
            {"$set": {"nutrients": nutrients_list}}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Food not found")

        return {"message": "Nutrients updated successfully"}

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for nutrients")
    except Exception as e:
        print(f"Error updating food nutrients: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating nutrients: {str(e)}")

@router.get("/all")
async def get_all_foods(db: Annotated[Database, Depends(get_data)] = None):
    """
    Get all foods as a dictionary mapping food names to food IDs.
    Used by frontend for autocomplete and caching.
    """
    try:
        foods = {}
        cursor = db.foods.find({}, {"_id": 1, "food_name": 1, "name": 1})
        for food in cursor:
            food_name = str(food.get("food_name") or food.get("name") or "").strip()
            if food_name:
                foods[food_name] = food["_id"]
        return foods
    except Exception as e:
        print(f"Error fetching all foods: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/custom_foods/{food_id}")
def get_custom_food(
    food_id: str,
    db: Database = Depends(get_data),
    user: dict = Depends(get_current_user)
):
    """
    Get a specific food by ID.

    Args:
        food_id: ID of the food to get
        db: MongoDB database connection
        user: Current authenticated user

    Returns:
        Food document
    """
    try:
        object_id = ObjectId(food_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid food ID")

    try:
        # Find the food
        food = db.foods.find_one({"_id": object_id, "source": user["_id"]})

        if not food:
            raise HTTPException(status_code=404, detail="Food not found")

        return serialize_bson(food)

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting food: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting food: {str(e)}")

async def _process_and_add_food_bg(
    description: Optional[str],
    image_bytes_list: list,
    user: dict,
    db,
    request=None,
):
    """
    Background task: process food images (or text description) and save to the database.
    Called by /food/process_and_add so the HTTP connection can close immediately.
    """
    try:
        import openai as _openai
        import base64

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("Background food processing error: OPENAI_API_KEY not set")
            return

        client = _openai.OpenAI(api_key=api_key)

        def _clean_json(text: str) -> str:
            text = text.strip()
            if text.startswith("```"):
                nl = text.find("\n")
                if nl != -1:
                    text = text[nl + 1:]
                if text.endswith("```"):
                    text = text[:-3]
            return text.strip()

        result_description = description
        result_nutrients: list = []

        # ── Step 1: classify and analyse images ──────────────────────────────
        if image_bytes_list:
            label_b64s: list = []
            food_b64s: list = []

            for contents in image_bytes_list:
                b64 = base64.b64encode(contents).decode("utf-8")
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": [
                        {"type": "text", "text": "Is this image a nutrition facts label? Answer with only 'yes' or 'no'."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                    ]}],
                    max_tokens=10,
                    temperature=0,
                )
                cls = resp.choices[0].message.content.strip().lower()
                (label_b64s if "yes" in cls else food_b64s).append(b64)

            # Description from images if not supplied
            if not result_description:
                src = food_b64s if food_b64s else label_b64s
                if src:
                    resp = client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{"role": "user", "content": [
                            {"type": "text", "text": "Describe this food item in a concise phrase (e.g. 'Grilled chicken breast'). Return only the food name."},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{src[0]}"}},
                        ]}],
                        max_tokens=50,
                    )
                    result_description = resp.choices[0].message.content.strip()

            # Nutrition from labels
            if label_b64s:
                for b64 in label_b64s:
                    resp = client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{"role": "user", "content": [
                            {"type": "text", "text": (
                                "Extract all nutritional information from this nutrition facts label and convert to per 100g.\n\n"
                                "CRITICAL: (amount / serving_size_grams) * 100 for every nutrient.\n\n"
                                'Return ONLY JSON:\n{"serving_size":"33g","nutrients":[{"name":"Energy","amount":250,"unit":"KCAL"},...]}\n\n'
                                "Use standard USDA names. Energy in KCAL, G/MG/UG for mass. Return ONLY the JSON."
                            )},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                        ]}],
                        max_tokens=1000,
                        temperature=0,
                    )
                    try:
                        data = json.loads(_clean_json(resp.choices[0].message.content))
                        for n in data.get("nutrients", []):
                            existing = next((x for x in result_nutrients if x["name"] == n["name"]), None)
                            if existing:
                                existing["amount"] = (existing["amount"] + n["amount"]) / 2
                            else:
                                result_nutrients.append(n)
                    except json.JSONDecodeError as e:
                        print(f"Background food: failed to parse label JSON: {e}")

            elif food_b64s:
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": [
                        {"type": "text", "text": (
                            "Estimate nutritional content per 100g for this food.\n"
                            'Return ONLY JSON:\n{"nutrients":[{"name":"Energy","amount":250,"unit":"KCAL"},...]}\n'
                            "Use standard USDA names. Return ONLY the JSON."
                        )},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{food_b64s[0]}"}},
                    ]}],
                    max_tokens=1000,
                    temperature=0,
                )
                try:
                    data = json.loads(_clean_json(resp.choices[0].message.content))
                    result_nutrients = data.get("nutrients", [])
                except json.JSONDecodeError as e:
                    print(f"Background food: failed to parse food-image JSON: {e}")

        # ── Step 2: map nutrient names → IDs ─────────────────────────────────
        name_mappings = {
            "total fat": "Total lipid (fat)", "fat": "Total lipid (fat)",
            "total lipid (fat)": "Total lipid (fat)",
            "carbohydrates": "Carbohydrate, by difference",
            "carbohydrate, by difference": "Carbohydrate, by difference",
            "carbs": "Carbohydrate, by difference",
            "fiber": "Fiber, total dietary", "dietary fiber": "Fiber, total dietary",
            "sugars": "Sugars, total including NLEA",
            "protein": "Protein", "sodium": "Sodium, Na",
            "potassium": "Potassium, K", "iron": "Iron, Fe", "energy": "Energy",
        }
        nutrients_to_save: list = []
        for nutrient in result_nutrients:
            nutrient_name = nutrient["name"].lower().strip()
            doc = db.nutrients.find_one({"nutrient_name": {"$regex": f"^{nutrient['name']}$", "$options": "i"}})
            if not doc:
                mapped = name_mappings.get(nutrient_name)
                if mapped:
                    doc = db.nutrients.find_one({"nutrient_name": {"$regex": f"^{mapped}$", "$options": "i"}})
            if not doc:
                try:
                    results = await search_nutrients_by_name(nutrient["name"], db=db, threshold=0.5, limit=1)
                    if results:
                        best_id = max(results, key=results.get)
                        doc = db.nutrients.find_one({"_id": int(best_id)})
                except Exception as e:
                    print(f"Background food: hybrid search failed for '{nutrient['name']}': {e}")
            if doc:
                nutrients_to_save.append({"nutrient_id": doc["_id"], "amt": nutrient["amount"]})

        # ── Step 3: save food ─────────────────────────────────────────────────
        food_name = result_description or "Unknown food"
        embedding = None
        embedding_error_message = None
        try:
            embedding = _generate_food_embedding(food_name)
            print(f"✓ Generated embedding for '{food_name}' ({len(embedding)} dims)")
        except Exception as e:
            embedding_error_message = str(e)
            print(f"Warning: could not generate embedding for '{food_name}': {embedding_error_message}")

        now = datetime.utcnow()
        food_doc = {
            "_id": ObjectId(),
            "food_name": food_name,
            "nutrients": nutrients_to_save,
            "is_custom": True,
            "source": user["_id"],
            "created_at": now,
            "embedding_status": "ready" if embedding else "pending",
            "embedding_last_attempt_at": now,
        }
        if embedding:
            food_doc["embedding"] = embedding
        elif embedding_error_message:
            food_doc["embedding_error"] = embedding_error_message
            food_doc["embedding_last_error_at"] = now

        result = db.foods.insert_one(food_doc)
        food_id = str(result.inserted_id)

        db.users.update_one(
            {"_id": ObjectId(user["_id"])},
            {"$addToSet": {"custom_foods": food_id}},
        )
        print(f"✓ Added food to DB: {food_name} ({food_id})")

        if embedding is None and embedding_error_message:
            _log_embedding_failure(
                db=db,
                food_id=food_id,
                food_name=food_name,
                user_id=user["_id"],
                error_message=embedding_error_message,
                attempt=1,
                source="process_and_add_food_bg",
            )

        # Add to search indexes
        try:
            from .sparse import _get_client as _get_typesense
            tc = _get_typesense()
            if tc:
                tc.collections["foods"].documents.create({"id": food_id, "food_name": food_name})
                print(f"✓ Added to Typesense: {food_name}")
        except Exception as e:
            print(f"Warning: Typesense update failed: {e}")

        if embedding:
            try:
                _add_embedding_to_faiss(request.app if request is not None else None, food_id, food_name, embedding)
            except Exception as faiss_error:
                print(f"Warning: FAISS update failed: {faiss_error}")

        # Keep food name cache in sync and patch autocomplete cache.
        try:
            _sync_food_id_name_cache(request.app if request is not None else None, food_id, food_name)
        except Exception as cache_error:
            print(f"Warning: food cache update failed: {cache_error}")

        try:
            from .match import upsert_custom_food_in_autocomplete_cache
            upsert_custom_food_in_autocomplete_cache(str(user["_id"]), food_id, food_name)
        except Exception as cache_error:
            print(f"Warning: autocomplete cache patch failed: {cache_error}")

        print(f"✓ Background food processing complete: {food_name}")

    except Exception as e:
        print(f"Error in background food processing: {e}")
        import traceback
        traceback.print_exc()


@router.post("/process_and_add")
async def process_and_add_food(
    background_tasks: BackgroundTasks,
    description: Optional[str] = Form(None),
    images: list[UploadFile] = File([]),
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_data),
    request: Request = None,
):
    """
    Submit a food for processing and saving. Returns immediately (HTTP 200).
    Image processing and DB writes happen in a background task so the client
    can navigate away without interrupting the work.
    """
    # Read image bytes while the request is still open — UploadFile streams
    # are closed when the response is sent.
    image_bytes_list = [await img.read() for img in images]

    background_tasks.add_task(
        _process_and_add_food_bg,
        description,
        image_bytes_list,
        user,
        db,
        request,
    )

    return {"status": "processing"}


@router.post("/process_images")
async def process_food_images(
    description: Optional[str] = Form(None),
    images: list[UploadFile] = File([]),
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_data)
):
    """
    Process uploaded images to extract food description and nutrition information.

    - Accepts multiple images via the 'images' parameter
    - If description is provided, use it; otherwise generate from images
    - Detects which images are nutrition labels vs food photos
    - Extracts nutrition from labels, estimates from food photos
    - Returns: {description: str, nutrients: List[{nutrient_id, name, amount, unit}]}
    """
    try:
        import openai
        import base64
        import json

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key not configured")

        client = openai.OpenAI(api_key=api_key)

        result_description = description
        result_nutrients = []

        # If no images provided, return early
        if not images:
            return {
                "description": result_description or "Unknown food",
                "nutrients": []
            }

        # Helper function to encode image
        async def encode_image(upload_file: UploadFile) -> str:
            contents = await upload_file.read()
            return base64.b64encode(contents).decode('utf-8')

        # Helper function to clean JSON response (remove markdown code blocks)
        def clean_json_response(text: str) -> str:
            text = text.strip()
            # Remove markdown code blocks if present
            if text.startswith('```'):
                # Find the first newline after the opening ```
                first_newline = text.find('\n')
                if first_newline != -1:
                    text = text[first_newline + 1:]
                # Remove the closing ```
                if text.endswith('```'):
                    text = text[:-3]
            return text.strip()

        # Classify images as labels or food photos
        label_images = []
        food_images = []

        for img in images:
            base64_img = await encode_image(img)
            await img.seek(0)  # Reset file pointer

            # Ask GPT to classify the image
            classify_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Is this image a nutrition facts label? Answer with only 'yes' or 'no'."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_img}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=10,
                temperature=0
            )

            classification = classify_response.choices[0].message.content.strip().lower()

            if "yes" in classification:
                label_images.append((img, base64_img))
            else:
                food_images.append((img, base64_img))

        # Step 1: Generate description if not provided
        if not result_description:
            # Prefer food images for description, fall back to label images
            images_for_description = food_images if food_images else label_images

            if images_for_description:
                _, base64_image = images_for_description[0]

                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Describe this food item in a concise phrase (e.g., 'Homemade chocolate chip cookie with walnuts', 'Grilled chicken breast', etc.). Just return the food name, nothing else."
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{base64_image}"
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens=50
                )
                result_description = response.choices[0].message.content.strip()

        # Step 2: Extract nutrition from labels
        if label_images:
            for img, base64_label in label_images:
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": """Extract all nutritional information from this nutrition facts label and convert to per 100g.

                                    CRITICAL CONVERSION INSTRUCTIONS:
                                    1. First, identify the serving size on the label (e.g., "33g", "10g", "1 cup (240ml)")
                                    2. Convert ALL nutrient amounts to per 100g by calculating: (amount / serving_size_in_grams) * 100
                                    3. If serving size is in volume (cups, ml), estimate the weight (e.g., 1 cup = ~240g for liquids)

                                    Return ONLY a JSON object with this exact format:
                                    {
                                      "serving_size": "33g",
                                      "nutrients": [
                                        {"name": "Energy", "amount": 250, "unit": "KCAL"},
                                        {"name": "Protein", "amount": 5.2, "unit": "G"},
                                        {"name": "Total lipid (fat)", "amount": 12.0, "unit": "G"},
                                        {"name": "Carbohydrate, by difference", "amount": 30.5, "unit": "G"}
                                      ]
                                    }

                                    Important:
                                    - ALL nutrient values MUST be converted to per 100g
                                    - serving_size field is for reference only, shows the original serving size on the label
                                    - Use standard USDA nutrient names when possible
                                    - Energy should be in KCAL
                                    - Use G for grams, MG for milligrams, UG for micrograms
                                    - Include as many nutrients as visible on the label
                                    - Return ONLY the JSON, no other text

                                    Example: If label shows "Serving size: 33g, Protein: 3g", convert to per 100g: (3/33)*100 = 9.09g"""
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{base64_label}"
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens=1000,
                    temperature=0
                )

                # Parse JSON response
                try:
                    cleaned_response = clean_json_response(response.choices[0].message.content)
                    nutrition_json = json.loads(cleaned_response)
                    extracted_nutrients = nutrition_json.get("nutrients", [])

                    # Merge nutrients (if multiple labels, combine them)
                    for nutrient in extracted_nutrients:
                        existing = next((n for n in result_nutrients if n["name"] == nutrient["name"]), None)
                        if existing:
                            # Average the amounts if duplicate
                            existing["amount"] = (existing["amount"] + nutrient["amount"]) / 2
                        else:
                            result_nutrients.append(nutrient)

                except json.JSONDecodeError as e:
                    print(f"Failed to parse nutrition JSON: {response.choices[0].message.content}")
                    print(f"Error: {e}")

        # Step 3: Estimate nutrition from food images if no labels
        elif food_images:
            # Use the first food image for estimation
            _, base64_food = food_images[0]

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": """Estimate the nutritional content per 100g for this food.
                                Return ONLY a JSON object with this exact format:
                                {
                                  "nutrients": [
                                    {"name": "Energy", "amount": 250, "unit": "KCAL"},
                                    {"name": "Protein", "amount": 5.2, "unit": "G"},
                                    {"name": "Total lipid (fat)", "amount": 12.0, "unit": "G"},
                                    {"name": "Carbohydrate, by difference", "amount": 30.5, "unit": "G"}
                                  ]
                                }

                                Provide reasonable estimates for common nutrients (energy, protein, fat, carbs, fiber, sugar, sodium, etc.).
                                Use standard USDA nutrient names.
                                Return ONLY the JSON, no other text."""
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_food}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=1000,
                temperature=0
            )

            # Parse JSON response
            try:
                cleaned_response = clean_json_response(response.choices[0].message.content)
                nutrition_json = json.loads(cleaned_response)
                result_nutrients = nutrition_json.get("nutrients", [])
            except json.JSONDecodeError as e:
                print(f"Failed to parse nutrition JSON: {response.choices[0].message.content}")
                print(f"Error: {e}")

        # Map nutrient names to IDs with hybrid search
        from ..routers.sparse_search_nutrients import search_nutrients_by_name

        nutrients_with_ids = []
        for nutrient in result_nutrients:
            nutrient_name = nutrient["name"].lower().strip()

            # Step 1: Try exact match first
            nutrient_doc = db.nutrients.find_one({"nutrient_name": {"$regex": f"^{nutrient['name']}$", "$options": "i"}})

            # Step 2: If not found, try common name mappings
            if not nutrient_doc:
                name_mappings = {
                    "total fat": "Total lipid (fat)",
                    "total lipid (fat)": "Total lipid (fat)",
                    "fat": "Total lipid (fat)",
                    "carbohydrates": "Carbohydrate, by difference",
                    "carbohydrate, by difference": "Carbohydrate, by difference",
                    "carbs": "Carbohydrate, by difference",
                    "fiber": "Fiber, total dietary",
                    "dietary fiber": "Fiber, total dietary",
                    "sugars": "Sugars, total including NLEA",
                    "protein": "Protein",
                    "sodium": "Sodium, Na",
                    "potassium": "Potassium, K",
                    "iron": "Iron, Fe",
                    "energy": "Energy"
                }

                mapped_name = name_mappings.get(nutrient_name)
                if mapped_name:
                    nutrient_doc = db.nutrients.find_one({"nutrient_name": {"$regex": f"^{mapped_name}$", "$options": "i"}})

            # Step 3: If still not found, use hybrid vector search
            if not nutrient_doc:
                try:
                    search_results = await search_nutrients_by_name(nutrient["name"], db=db, threshold=0.5, limit=1)
                    if search_results:
                        # Get the top match
                        best_nutrient_id = max(search_results, key=search_results.get)
                        nutrient_doc = db.nutrients.find_one({"_id": int(best_nutrient_id)})
                        if nutrient_doc:
                            print(f"Matched '{nutrient['name']}' to '{nutrient_doc['nutrient_name']}' via hybrid search (score: {search_results[best_nutrient_id]:.2f})")
                except Exception as e:
                    print(f"Error during hybrid search for '{nutrient['name']}': {e}")

            if nutrient_doc:
                nutrients_with_ids.append({
                    "nutrient_id": nutrient_doc["_id"],
                    "name": nutrient_doc["nutrient_name"],  # Use database name
                    "amount": nutrient["amount"],
                    "unit": nutrient["unit"]
                })
            else:
                # If not found after all attempts, still include it
                print(f"Warning: Could not find nutrient '{nutrient['name']}' in database after all matching attempts")
                nutrients_with_ids.append({
                    "nutrient_id": -1,  # Unknown
                    "name": nutrient["name"],
                    "amount": nutrient["amount"],
                    "unit": nutrient["unit"]
                })

        return {
            "description": result_description or "Unknown food",
            "nutrients": nutrients_with_ids
        }

    except Exception as e:
        print(f"Error processing images: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing images: {str(e)}")


@router.post("/add_custom_food")
async def add_custom_food(
    request: Request,
    name: str = Form(...),
    nutrients: str = Form("[]"),
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_data)
):
    """
    Add a custom food with optional nutrition data.

    - name: Food name/description
    - nutrients: JSON string of nutrients array
    """
    try:
        import json

        # Parse nutrients JSON
        try:
            nutrients_list = json.loads(nutrients) if isinstance(nutrients, str) else nutrients
        except json.JSONDecodeError:
            nutrients_list = []

        embedding = None
        embedding_error_message = None
        try:
            embedding = _generate_food_embedding(name)
            print(f"✓ Generated OpenAI embedding for custom food: {name} ({len(embedding)} dims)")
        except Exception as embed_error:
            embedding_error_message = str(embed_error)
            print(f"⚠ Warning: Could not generate embedding for custom food '{name}': {embedding_error_message}")

        # Create custom food document
        now = datetime.utcnow()
        food_doc = {
            "_id": ObjectId(),
            "food_name": name,
            "nutrients": [
                {
                    "nutrient_id": n.get("nutrient_id", -1),
                    "amt": n.get("amount", 0)
                }
                for n in nutrients_list
                if n.get("nutrient_id", -1) != -1  # Only include mapped nutrients
            ],
            "is_custom": True,
            "source": user["_id"],
            "created_at": now,
            "embedding_status": "ready" if embedding else "pending",
            "embedding_last_attempt_at": now,
        }
        if embedding:
            food_doc["embedding"] = embedding
        elif embedding_error_message:
            food_doc["embedding_error"] = embedding_error_message
            food_doc["embedding_last_error_at"] = now

        # Insert into foods collection
        result = db.foods.insert_one(food_doc)
        food_id = str(result.inserted_id)

        # Add food_id to user's custom_foods array
        db.users.update_one(
            {"_id": ObjectId(user["_id"])},
            {"$addToSet": {"custom_foods": food_id}}
        )
        print(f"✓ Added food_id {food_id} to user's custom_foods list")

        # If embedding failed, persist failure details and alert dev by email.
        if embedding is None and embedding_error_message:
            _log_embedding_failure(
                db=db,
                food_id=food_id,
                food_name=name,
                user_id=user["_id"],
                error_message=embedding_error_message,
                attempt=1,
                source="add_custom_food",
            )

        # 1) Always add to Typesense (sparse search), even if embedding fails.
        # This guarantees custom foods are autocomplete-searchable.
        try:
            from .sparse import _get_client as get_typesense_client

            typesense_client = get_typesense_client()
            if typesense_client:
                document = {
                    'id': food_id,
                    'food_name': name
                }
                typesense_client.collections['foods'].documents.create(document)
                print(f"✓ Added custom food to Typesense index: {name}")
        except Exception as e:
            print(f"⚠ Warning: Could not add to Typesense: {e}")

        # 2) Add to FAISS (dense search) only when embedding exists.
        if embedding:
            try:
                _add_embedding_to_faiss(request.app if request is not None else None, food_id, name, embedding)
            except Exception as faiss_error:
                print(f"⚠ Warning: Could not add to FAISS index: {faiss_error}")

        # 3) Always keep id-name caches synced for fast display/lookups.
        try:
            _sync_food_id_name_cache(request.app if request is not None else None, food_id, name)
        except Exception as cache_error:
            print(f"⚠ Warning: Could not update food ID cache: {cache_error}")

        # 4) Patch autocomplete cache so new custom foods appear immediately.
        try:
            from .match import upsert_custom_food_in_autocomplete_cache
            upsert_custom_food_in_autocomplete_cache(str(user["_id"]), food_id, name)
        except Exception as cache_error:
            print(f"⚠ Warning: Could not patch autocomplete cache: {cache_error}")

        return {
            "status": "success",
            "food_id": food_id,
            "message": "Custom food added successfully",
            "embedding_status": "ready" if embedding else "pending",
        }

    except Exception as e:
        print(f"Error adding custom food: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error adding custom food: {str(e)}")


@router.post("/repair-missing-embeddings")
async def repair_missing_embeddings(
    request: Request,
    limit: Optional[int] = None,
    include_wrong_dim: bool = True,
    dry_run: bool = False,
    db: Database = Depends(get_data),
):
    """
    Repair/backfill food embeddings in MongoDB and search caches.

    - Repairs all foods with missing embeddings.
    - Optionally repairs foods whose embedding dimension is not target dim (default 3072).
    - On OpenAI transient failure, logs error for manual repair follow-up.
    - Returns issue counters and unfixed record IDs.
    - Authentication is intentionally not required for this maintenance endpoint.
    """
    try:
        effective_limit = None if limit is None else max(1, min(int(limit), 2000))
        stats = await repair_custom_food_embeddings(
            app=request.app if request is not None else None,
            db=db,
            limit=effective_limit,
            include_wrong_dim=include_wrong_dim,
            dry_run=dry_run,
        )
        return {
            "status": "success",
            "limit": effective_limit,
            **stats,
        }
    except Exception as e:
        print(f"Error repairing custom-food embeddings: {e}")
        raise HTTPException(status_code=500, detail=f"Error repairing embeddings: {str(e)}")


@router.post("/rebuild-index")
async def rebuild_faiss_index(
    request: Request,
    db: Annotated[Database, Depends(get_data)]
):
    """
    Rebuild both food and nutrient FAISS indexes from scratch.
    Updates all bin files and .pkl caches, then verifies with test queries.
    Use this after deleting custom foods or when the index is out of sync.

    No authentication required - this is a system maintenance endpoint.
    """
    try:
        print("\n" + "="*70)
        print("REBUILDING FAISS INDEXES (FOODS + NUTRIENTS)")
        print("="*70)

        # Import the update function and search functions from dense router
        from ..routers.dense import update_faiss_index, find_dense_matches, find_dense_nutrient_matches

        # Rebuild both food and nutrient indexes
        # This function already:
        # - Builds food index and saves to FAISS_BIN
        # - Builds nutrient index and saves to NUTRIENT_FAISS_BIN
        # - Updates food ID cache (FOOD_ID_CACHE .pkl)
        # - Updates nutrient ID cache (NUTRIENT_ID_CACHE .pkl)
        # - Updates app.state for both indexes
        food_index, _ = await update_faiss_index(db=db, user=None, request=request)

        if food_index is None:
            raise Exception("Failed to build FAISS indexes")

        print("\n" + "="*70)
        print("VERIFYING REBUILD WITH TEST QUERIES")
        print("="*70)

        # Test query 1: Search for "bagel" in foods
        print("\n[TEST 1] Searching for 'bagel' in foods...")
        bagel_results = await find_dense_matches(
            text="bagel",
            db=db,
            user=None,
            request=request,
            threshold=40,
            limit=5
        )

        bagel_success = len(bagel_results) > 0
        bagel_top_match = None
        if bagel_success:
            # Get the top match details
            top_id = max(bagel_results, key=bagel_results.get)
            top_score = bagel_results[top_id]
            food_doc = db.foods.find_one({"_id": top_id}, {"food_name": 1})
            bagel_top_match = {
                "id": str(top_id),
                "name": food_doc.get("food_name", "Unknown") if food_doc else "Unknown",
                "score": top_score
            }
            print(f"✓ Found {len(bagel_results)} results. Top match: '{bagel_top_match['name']}' (score: {top_score})")
        else:
            print("✗ No results found for 'bagel'")

        # Test query 2: Search for "protein" in nutrients
        print("\n[TEST 2] Searching for 'protein' in nutrients...")
        protein_results = await find_dense_nutrient_matches(
            text="protein",
            db=db,
            request=request,
            threshold=30,  # Lower threshold for better matches
            limit=5
        )

        protein_success = len(protein_results) > 0
        protein_top_match = None
        if protein_success:
            # Get the top match details
            top_id = max(protein_results, key=protein_results.get)
            top_score = protein_results[top_id]
            nutrient_doc = db.nutrients.find_one({"_id": int(top_id)}, {"nutrient_name": 1})
            protein_top_match = {
                "id": str(top_id),
                "name": nutrient_doc.get("nutrient_name", "Unknown") if nutrient_doc else "Unknown",
                "score": top_score
            }
            print(f"✓ Found {len(protein_results)} results. Top match: '{protein_top_match['name']}' (score: {top_score})")
        else:
            print("✗ No results found for 'protein'")

        # Overall verification status
        verification_passed = bagel_success and protein_success

        print("\n" + "="*70)
        if verification_passed:
            print("✓ ALL TESTS PASSED - INDEXES REBUILT AND VERIFIED SUCCESSFULLY")
        else:
            print("⚠ VERIFICATION INCOMPLETE - Some tests failed")
        print("="*70 + "\n")

        return {
            "status": "success" if verification_passed else "partial_success",
            "message": "FAISS indexes rebuilt successfully" if verification_passed else "Indexes rebuilt but verification had issues",
            "indexes_rebuilt": {
                "food_index": {
                    "vectors": food_index.ntotal,
                    "bin_file": os.getenv("FAISS_BIN", "faiss_index.bin"),
                    "cache_file": os.getenv("FOOD_ID_CACHE", "food_ids.pkl")
                },
                "nutrient_index": {
                    "bin_file": os.getenv("NUTRIENT_FAISS_BIN", "nutrient_faiss_index.bin"),
                    "cache_file": os.getenv("NUTRIENT_ID_CACHE", "nutrient_ids.pkl")
                }
            },
            "verification": {
                "overall_passed": verification_passed,
                "bagel_test": {
                    "passed": bagel_success,
                    "results_count": len(bagel_results),
                    "top_match": bagel_top_match
                },
                "protein_test": {
                    "passed": protein_success,
                    "results_count": len(protein_results),
                    "top_match": protein_top_match
                }
            }
        }

    except Exception as e:
        print(f"Error rebuilding FAISS indexes: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error rebuilding indexes: {str(e)}")
