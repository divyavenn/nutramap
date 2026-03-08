#!/usr/bin/env python3
"""
One-off migration: rename canonical kcal nutrient (ID 1008) from "Energy" to "Calories".

This script updates:
1) MongoDB nutrients collection record with _id=1008
2) Local nutrient ID cache pickle (if present) so stale names do not persist locally
"""

from __future__ import annotations

import argparse
import os
import pickle
import sys
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient


TARGET_NUTRIENT_ID = 1008
TARGET_NAME = "Calories"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rename canonical nutrient name to Calories")
    parser.add_argument(
        "--mongo-uri",
        default=os.getenv("MONGO_URI"),
        help="Mongo connection string. Defaults to MONGO_URI env var.",
    )
    parser.add_argument(
        "--db-name",
        default=os.getenv("DB_NAME", "nutramap"),
        help="Mongo database name. Defaults to DB_NAME or 'nutramap'.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change without writing.",
    )
    return parser.parse_args()


def _candidate_cache_paths() -> list[Path]:
    paths: list[Path] = []

    env_path = os.getenv("NUTRIENT_ID_CACHE")
    if env_path:
        paths.append(Path(env_path))

    backend_root = Path(__file__).resolve().parents[2]
    paths.append(backend_root / "nutrient_ids.pkl")
    paths.append(Path.cwd() / "nutrient_ids.pkl")

    deduped: list[Path] = []
    seen = set()
    for path in paths:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        deduped.append(resolved)
    return deduped


def _patch_local_nutrient_cache(dry_run: bool) -> list[dict]:
    updates = []
    for cache_path in _candidate_cache_paths():
        if not cache_path.exists():
            continue

        try:
            with cache_path.open("rb") as f:
                data = pickle.load(f)
        except Exception as exc:
            updates.append(
                {
                    "path": str(cache_path),
                    "status": "error_reading",
                    "error": str(exc),
                }
            )
            continue

        if not isinstance(data, dict):
            updates.append(
                {
                    "path": str(cache_path),
                    "status": "skipped_unexpected_format",
                }
            )
            continue

        nutrient_entry = data.get(str(TARGET_NUTRIENT_ID))
        if not isinstance(nutrient_entry, dict):
            updates.append(
                {
                    "path": str(cache_path),
                    "status": "skipped_missing_id",
                }
            )
            continue

        old_name = nutrient_entry.get("name")
        if old_name == TARGET_NAME:
            updates.append(
                {
                    "path": str(cache_path),
                    "status": "no_change",
                    "old_name": old_name,
                }
            )
            continue

        nutrient_entry["name"] = TARGET_NAME
        data[str(TARGET_NUTRIENT_ID)] = nutrient_entry

        if not dry_run:
            with cache_path.open("wb") as f:
                pickle.dump(data, f)

        updates.append(
            {
                "path": str(cache_path),
                "status": "updated" if not dry_run else "would_update",
                "old_name": old_name,
                "new_name": TARGET_NAME,
            }
        )

    return updates


def main() -> int:
    load_dotenv()
    args = _parse_args()

    if not args.mongo_uri:
        print("Error: --mongo-uri not provided and MONGO_URI env var not set.")
        return 1

    client = MongoClient(args.mongo_uri)
    db = client[args.db_name]

    nutrient = db.nutrients.find_one({"_id": TARGET_NUTRIENT_ID})
    if nutrient is None:
        print(f"Error: nutrient _id={TARGET_NUTRIENT_ID} not found in db '{args.db_name}'.")
        return 1

    old_name = nutrient.get("nutrient_name")
    print(f"Mongo nutrient {TARGET_NUTRIENT_ID}: current name = {old_name!r}")

    if old_name != TARGET_NAME:
        if args.dry_run:
            print(f"Dry run: would update nutrient_name to {TARGET_NAME!r}.")
        else:
            db.nutrients.update_one(
                {"_id": TARGET_NUTRIENT_ID},
                {"$set": {"nutrient_name": TARGET_NAME}},
            )
            print(f"Updated nutrient_name to {TARGET_NAME!r}.")
    else:
        print("No Mongo change needed.")

    cache_updates = _patch_local_nutrient_cache(dry_run=args.dry_run)
    if cache_updates:
        print("Local nutrient cache updates:")
        for update in cache_updates:
            print(f"  - {update}")
    else:
        print("No local nutrient cache files found to patch.")

    print(
        "Note: if nutrient search indexes are already built in production, "
        "rebuild/reindex so search documents reflect the new name."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
