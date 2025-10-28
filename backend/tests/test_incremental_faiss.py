#!/usr/bin/env python3
"""
Test script for incremental FAISS addition and removal.

This script:
1. Adds a custom food "Trader Joe's roasted red pepper soup"
2. Runs dense search for "Trader Joe's red pepper soup"
3. Verifies it appears in top results
4. Deletes the custom food
5. Runs dense search again to verify it no longer appears
"""

import asyncio
import httpx
import os
import pickle
import base64
import json
from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId

load_dotenv()

TEST_FOOD_NAME = "matcha powder"
SEARCH_QUERY = "matcha powder"



# Configuration
BASE_URL = "http://localhost:8080"
AUTH_TOKEN = os.getenv("TRIAL_USER_TOKEN")
MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME")
FOOD_ID_CACHE = "food_ids.pkl"

# Convert relative paths to absolute
# Since test is in tests/ subdirectory, go up one level to backend/
if not os.path.isabs(FOOD_ID_CACHE):
    FOOD_ID_CACHE = os.path.join(os.path.dirname(os.path.dirname(__file__)), FOOD_ID_CACHE)

# Extract user_id from token
token_payload = json.loads(base64.b64decode(AUTH_TOKEN.split('.')[1] + '=='))
USER_ID = ObjectId(token_payload['_id'])

if not AUTH_TOKEN:
    print("⚠️  Warning: No TEST_AUTH_TOKEN found in environment")
    print("Please set TEST_AUTH_TOKEN in your .env file or export it")
    print("Example: export TEST_AUTH_TOKEN='your_token_here'")
    exit(1)

HEADERS = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json"
}



def check_food_in_mongodb(food_id):
    """Check if food exists in MongoDB foods collection."""
    try:
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]

        food = db.foods.find_one({"_id": ObjectId(food_id)})
        client.close()
        return food is not None
    except Exception as e:
        print(f"  Error checking MongoDB: {e}")
        return None


def check_food_in_user_custom_foods(food_id):
    """Check if food_id is in user's custom_foods array."""
    try:
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]

        user = db.users.find_one({"_id": USER_ID}, {"custom_foods": 1})
        client.close()

        if user and "custom_foods" in user:
            return food_id in user["custom_foods"]
        return False
    except Exception as e:
        print(f"  Error checking user custom_foods: {e}")
        return None


def check_food_in_pickle(food_id):
    """Check if food_id exists in the pickle cache."""
    try:
        if not os.path.exists(FOOD_ID_CACHE):
            print(f"  Pickle file not found: {FOOD_ID_CACHE}")
            return None

        with open(FOOD_ID_CACHE, "rb") as f:
            id_name_map = pickle.load(f)

        return food_id in id_name_map
    except Exception as e:
        print(f"  Error checking pickle cache: {e}")
        return None


async def add_custom_food():
    """Add a custom food using the /food/add_custom_food endpoint."""
    print("\n" + "="*60)
    print("STEP 1: Adding custom food")
    print("="*60)

    # Prepare form data (endpoint expects form data, not JSON)
    form_data = {
        "name": TEST_FOOD_NAME,
        "nutrients": "[]"  # Empty nutrients array as JSON string
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{BASE_URL}/food/add_custom_food",
            data=form_data,  # Use data (form) instead of json
            headers={"Authorization": f"Bearer {AUTH_TOKEN}"}  # Don't set Content-Type - let httpx handle it
        )

        if response.status_code == 200:
            result = response.json()
            food_id = result.get("food_id")
            print(f"✓ Custom food added successfully")
            print(f"  Food ID: {food_id}")
            print(f"  Name: {TEST_FOOD_NAME}")
            return food_id
        else:
            print(f"✗ Failed to add custom food: {response.status_code}")
            print(f"  Response: {response.text}")
            return None


async def search_dense(query):
    """Run dense search and return results."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{BASE_URL}/match/search/dense",
            params={"food_name": query},
            headers=HEADERS
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"✗ Search failed: {response.status_code}")
            print(f"  Response: {response.text}")
            return None


async def delete_custom_food(food_id):
    """Delete a custom food using the /food/custom_foods/{food_id} endpoint."""
    print("\n" + "="*60)
    print("STEP 3: Deleting custom food")
    print("="*60)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.delete(
            f"{BASE_URL}/food/custom_foods/{food_id}",
            headers={"Authorization": f"Bearer {AUTH_TOKEN}"}
        )

        if response.status_code == 200:
            print(f"✓ Custom food deleted successfully")
            print(f"  Food ID: {food_id}")
            return True
        else:
            print(f"✗ Failed to delete custom food: {response.status_code}")
            print(f"  Response: {response.text}")
            return False


def check_food_in_results(results, food_id):
    """Check if a food_id appears in search results."""
    if not results:
        return False, -1

    # Handle different response formats
    matches = results.get("matches", {})

    if not matches:
        return False, -1

    # Check if food_id is in matches (as a key)
    if str(food_id) in matches:
        # Get position by counting keys before this one
        position = list(matches.keys()).index(str(food_id))
        return True, position

    return False, -1


async def main():
    print("\n" + "="*60)
    print("TESTING INCREMENTAL FAISS ADDITION AND REMOVAL")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print(f"Test Food: {TEST_FOOD_NAME}")
    print(f"Search Query: {SEARCH_QUERY}")

    # Step 1: Add custom food
    food_id = await add_custom_food()
    if not food_id:
        print("\n✗ Test failed: Could not add custom food")
        return

    # Wait a moment for indexing
    print("\nWaiting 2 seconds for FAISS index update...")
    await asyncio.sleep(2)

    # Verify the food was added to all data stores
    print("\n" + "="*60)
    print("STEP 1.5: Verifying data persistence")
    print("="*60)

    in_mongodb = check_food_in_mongodb(food_id)
    in_user_custom = check_food_in_user_custom_foods(food_id)
    in_pickle = check_food_in_pickle(food_id)

    print(f"{'✓' if in_mongodb else '✗'} MongoDB foods collection: {'Present' if in_mongodb else 'Missing'}")
    print(f"{'✓' if in_user_custom else '✗'} User custom_foods array: {'Present' if in_user_custom else 'Missing'}")
    print(f"{'✓' if in_pickle else '✗'} Pickle cache (food_ids.pkl): {'Present' if in_pickle else 'Missing'}")

    if not (in_mongodb and in_user_custom and in_pickle):
        print("\n⚠️  Warning: Food not properly persisted to all data stores")

    # Step 2: Search and verify it appears
    print("\n" + "="*60)
    print("STEP 2: Searching for the custom food")
    print("="*60)
    print(f"Query: '{SEARCH_QUERY}'")

    results_before = await search_dense(SEARCH_QUERY)
    if not results_before:
        print("\n✗ Test failed: Search returned no results")
        # Clean up
        await delete_custom_food(food_id)
        return

    found_before, position_before = check_food_in_results(results_before, food_id)

    if found_before:
        print(f"✓ Custom food found in search results at position {position_before + 1}")
        # Show the matched result
        matches = results_before.get("matches", {})
        matched_result = matches.get(str(food_id))
        if matched_result:
            print(f"  Food ID: {food_id}")
            print(f"  Name: {matched_result.get('name')}")
            print(f"  Score: {matched_result.get('score')}")
    else:
        print("✗ Custom food NOT found in search results")
        print("Top 5 results:")
        matches = results_before.get("matches", {})
        for idx, (match_id, match_data) in enumerate(list(matches.items())[:5]):
            print(f"  {idx + 1}. {match_data.get('name')} (ID: {match_id}, Score: {match_data.get('score')})")
        print("\n⚠️  Warning: Food not found, but continuing with deletion test...")

    # Step 3: Delete the custom food
    deleted = await delete_custom_food(food_id)
    if not deleted:
        print("\n✗ Test failed: Could not delete custom food")
        return

    # Wait a moment for index update
    print("\nWaiting 1 second for FAISS index update...")
    await asyncio.sleep(1)

    # Verify the food was removed from all data stores
    print("\n" + "="*60)
    print("STEP 3.5: Verifying data removal")
    print("="*60)

    in_mongodb_after = check_food_in_mongodb(food_id)
    in_user_custom_after = check_food_in_user_custom_foods(food_id)
    in_pickle_after = check_food_in_pickle(food_id)

    print(f"{'✗' if in_mongodb_after else '✓'} MongoDB foods collection: {'STILL PRESENT' if in_mongodb_after else 'Removed'}")
    print(f"{'✗' if in_user_custom_after else '✓'} User custom_foods array: {'STILL PRESENT' if in_user_custom_after else 'Removed'}")
    print(f"{'✗' if in_pickle_after else '✓'} Pickle cache (food_ids.pkl): {'STILL PRESENT' if in_pickle_after else 'Removed'}")

    if in_mongodb_after or in_user_custom_after or in_pickle_after:
        print("\n⚠️  Warning: Food not properly removed from all data stores")

    # Step 4: Search again and verify it's gone
    print("\n" + "="*60)
    print("STEP 4: Verifying removal from search results")
    print("="*60)
    print(f"Query: '{SEARCH_QUERY}'")

    results_after = await search_dense(SEARCH_QUERY)
    if not results_after:
        print("✓ Search returned no results (food successfully removed)")
    else:
        found_after, position_after = check_food_in_results(results_after, food_id)

        if found_after:
            print(f"✗ FAILED: Custom food still appears in results at position {position_after + 1}")
            print("This indicates the incremental removal did not work!")
        else:
            print("✓ Custom food no longer appears in search results")
            print("Incremental removal working correctly!")

        print("\nTop 5 results after deletion:")
        matches = results_after.get("matches", {})
        for idx, (match_id, match_data) in enumerate(list(matches.items())[:5]):
            print(f"  {idx + 1}. {match_data.get('name')} (ID: {match_id}, Score: {match_data.get('score')})")

    # Final summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"✓ Step 1: Custom food added (ID: {food_id})")
    print(f"  {'✓' if in_mongodb else '✗'} Added to MongoDB")
    print(f"  {'✓' if in_user_custom else '✗'} Added to user custom_foods")
    print(f"  {'✓' if in_pickle else '✗'} Added to pickle cache")
    print(f"{'✓' if found_before else '✗'} Step 2: Food found in search results")
    print(f"✓ Step 3: Custom food deleted")
    print(f"  {'✓' if not in_mongodb_after else '✗'} Removed from MongoDB")
    print(f"  {'✓' if not in_user_custom_after else '✗'} Removed from user custom_foods")
    print(f"  {'✓' if not in_pickle_after else '✗'} Removed from pickle cache")
    print(f"{'✓' if not found_after else '✗'} Step 4: Food removed from search results")

    # Check all conditions for full success
    all_added = in_mongodb and in_user_custom and in_pickle
    all_removed = not in_mongodb_after and not in_user_custom_after and not in_pickle_after
    search_works = found_before and not found_after

    if all_added and all_removed and search_works:
        print("\n🎉 TEST PASSED: Incremental FAISS addition and removal working!")
        print("   ✓ Data properly persisted to all stores")
        print("   ✓ Data properly removed from all stores")
        print("   ✓ Search results correctly updated")
    elif not all_added:
        print("\n⚠️  TEST PARTIAL FAIL: Food not properly added to all data stores")
    elif not all_removed:
        print("\n⚠️  TEST PARTIAL FAIL: Food not properly removed from all data stores")
    elif not found_before:
        print("\n⚠️  TEST INCONCLUSIVE: Food was not found in search before deletion")
        print("This may indicate the FAISS index needs to be rebuilt with IndexIDMap")
    else:
        print("\n❌ TEST FAILED: Food still appears in search after deletion")
        print("The FAISS index may need to be rebuilt with IndexIDMap support")
        print("Run: python rebuild_faiss_with_idmap.py")


if __name__ == "__main__":
    asyncio.run(main())
