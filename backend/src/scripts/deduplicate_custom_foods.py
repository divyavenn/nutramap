"""
Script to find and remove duplicate custom foods for a user.
Keeps the most recently created entry for each duplicate name.
"""

from pymongo import MongoClient
from bson import ObjectId
import os
from dotenv import load_dotenv
from collections import defaultdict

load_dotenv()

def deduplicate_custom_foods(user_id: str = None):
    """Remove duplicate custom foods, keeping the most recent one."""

    client = MongoClient(os.getenv('MONGO_URI'))
    db = client['nutramap']

    # Build query
    query = {}
    if user_id:
        query['user_id'] = ObjectId(user_id)

    # Get all custom foods
    all_foods = list(db.custom_foods.find(query))
    print(f"Found {len(all_foods)} custom foods")

    # Group by (user_id, name)
    grouped = defaultdict(list)
    for food in all_foods:
        key = (str(food['user_id']), food['name'].strip().lower())
        grouped[key].append(food)

    # Find and remove duplicates
    total_removed = 0
    for (user_id, name), foods in grouped.items():
        if len(foods) > 1:
            # Sort by created_at (most recent first)
            foods_sorted = sorted(foods, key=lambda x: x.get('created_at', x['_id'].generation_time), reverse=True)

            # Keep the first (most recent), delete the rest
            to_keep = foods_sorted[0]
            to_delete = foods_sorted[1:]

            print(f"\nDuplicate found: '{foods_sorted[0]['name']}'")
            print(f"  Keeping: {to_keep['_id']} (created: {to_keep.get('created_at', 'unknown')})")

            for food in to_delete:
                print(f"  Deleting: {food['_id']} (created: {food.get('created_at', 'unknown')})")
                db.custom_foods.delete_one({'_id': food['_id']})
                total_removed += 1

    print(f"\n✓ Removed {total_removed} duplicate custom foods")
    client.close()

if __name__ == "__main__":
    import sys

    user_id = sys.argv[1] if len(sys.argv) > 1 else None

    if user_id:
        print(f"Deduplicating custom foods for user: {user_id}")
    else:
        print("Deduplicating custom foods for ALL users")
        response = input("Are you sure? (yes/no): ")
        if response.lower() != 'yes':
            print("Cancelled")
            sys.exit(0)

    deduplicate_custom_foods(user_id)
