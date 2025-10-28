#!/usr/bin/env python3
"""
Script to cleanup nutrients database and generate embeddings.

This script:
1. Finds all nutrient_ids that are actually used in the foods collection
2. Removes nutrients that are never referenced by any food
3. Generates embeddings for all remaining nutrients using OpenAI
"""

import asyncio
import sys
import os
from dotenv import load_dotenv
from pymongo import MongoClient

# Add parent directory to path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.routers.dense import embed_query

# Load environment variables
load_dotenv()


async def cleanup_and_embed_nutrients():
    """
    Main function to cleanup nutrients and generate embeddings.
    """
    # Connect to MongoDB
    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("DB_NAME", "nutramapper")

    print(f"Connecting to MongoDB: {db_name}")
    mongo_client = MongoClient(mongo_uri)
    db = mongo_client[db_name]

    print("\n" + "="*80)
    print("STEP 1: Finding nutrients used in foods")
    print("="*80)

    # Get all nutrient_ids that are actually used in foods
    used_nutrient_ids = set()

    # Check foods collection
    print("\nScanning foods collection...")
    foods = db.foods.find({}, {"nutrients": 1})
    food_count = 0

    for food in foods:
        food_count += 1
        if "nutrients" in food and food["nutrients"]:
            for nutrient in food["nutrients"]:
                if "nutrient_id" in nutrient:
                    used_nutrient_ids.add(nutrient["nutrient_id"])

    print(f"✓ Scanned {food_count} foods")
    print(f"✓ Found {len(used_nutrient_ids)} unique nutrients in use")

    # Get all nutrients from database
    print("\n" + "="*80)
    print("STEP 2: Finding unused nutrients")
    print("="*80)

    all_nutrients = list(db.nutrients.find({}, {"_id": 1, "nutrient_name": 1}))
    print(f"\n✓ Total nutrients in database: {len(all_nutrients)}")

    # Find unused nutrients
    unused_nutrients = []
    for nutrient in all_nutrients:
        if nutrient["_id"] not in used_nutrient_ids:
            unused_nutrients.append(nutrient)

    print(f"✓ Unused nutrients found: {len(unused_nutrients)}")

    # Ask for confirmation before deleting
    if unused_nutrients:
        print(f"\n⚠️  About to delete {len(unused_nutrients)} unused nutrients")
        print("First 10 examples:")
        for nutrient in unused_nutrients[:10]:
            print(f"  - {nutrient['nutrient_name']} (ID: {nutrient['_id']})")

        if len(unused_nutrients) > 10:
            print(f"  ... and {len(unused_nutrients) - 10} more")

        response = input("\nProceed with deletion? (yes/no): ").strip().lower()

        if response == "yes":
            # Delete unused nutrients
            unused_ids = [n["_id"] for n in unused_nutrients]
            result = db.nutrients.delete_many({"_id": {"$in": unused_ids}})
            print(f"✓ Deleted {result.deleted_count} unused nutrients")
        else:
            print("✗ Deletion cancelled")
    else:
        print("✓ No unused nutrients to delete")

    # Generate embeddings for remaining nutrients
    print("\n" + "="*80)
    print("STEP 3: Generating embeddings for remaining nutrients")
    print("="*80)

    # Get nutrients that don't have embeddings yet
    remaining_nutrients = list(db.nutrients.find(
        {"embedding": {"$exists": False}},
        {"_id": 1, "nutrient_name": 1}
    ))

    print(f"\n✓ Nutrients without embeddings: {len(remaining_nutrients)}")

    if remaining_nutrients:
        print(f"\n🔄 Generating embeddings for {len(remaining_nutrients)} nutrients...")

        successful = 0
        failed = 0

        for i, nutrient in enumerate(remaining_nutrients, 1):
            try:
                nutrient_name = nutrient["nutrient_name"]

                # Generate embedding using embed_query from dense.py
                embedding_array = await embed_query(nutrient_name)

                # Convert to list for MongoDB storage
                embedding = embedding_array.flatten().tolist()

                # Update nutrient with embedding
                db.nutrients.update_one(
                    {"_id": nutrient["_id"]},
                    {"$set": {"embedding": embedding}}
                )

                successful += 1

                # Progress indicator
                if i % 10 == 0:
                    print(f"  Progress: {i}/{len(remaining_nutrients)} ({(i/len(remaining_nutrients)*100):.1f}%)")

            except Exception as e:
                failed += 1
                print(f"  ✗ Failed to generate embedding for '{nutrient_name}': {e}")

        print(f"\n✓ Successfully generated {successful} embeddings")
        if failed > 0:
            print(f"✗ Failed: {failed}")
    else:
        print("✓ All nutrients already have embeddings")

    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)

    final_count = db.nutrients.count_documents({})
    with_embeddings = db.nutrients.count_documents({"embedding": {"$exists": True}})

    print(f"\n✓ Total nutrients in database: {final_count}")
    print(f"✓ Nutrients with embeddings: {with_embeddings}")
    print(f"✓ Nutrients in use by foods: {len(used_nutrient_ids)}")

    print("\n✅ Cleanup and embedding generation complete!")

    mongo_client.close()


if __name__ == "__main__":
    print("="*80)
    print("NUTRIENT DATABASE CLEANUP AND EMBEDDING GENERATION")
    print("="*80)

    asyncio.run(cleanup_and_embed_nutrients())
