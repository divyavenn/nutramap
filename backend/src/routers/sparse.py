from typing import Dict
from typing_extensions import Annotated
from fastapi import Depends
from pymongo.database import Database
import typesense
from dotenv import load_dotenv
import os
import asyncio

# When running as a module within the application, use relative imports
try:
    from ..databases.mongo import get_data
    from ..routers.auth import get_current_user
    from ..routers.foods import get_foods_list
# When running this file directly, use absolute imports
except ImportError:
    import sys
    import os
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    from src.databases.mongo import get_data
    from src.routers.auth import get_current_user
    from src.routers.foods import get_foods_list
    

# Load environment variables
load_dotenv()

# Lazy Typesense client initialization
_client = None

def _get_client():
    """Get Typesense client, initializing if needed"""
    global _client
    if _client is None:
        api_key = os.getenv('TYPESENSE_API_KEY')
        if not api_key:
            print("⚠ Typesense not configured. Set TYPESENSE_API_KEY in .env")
            print("  Falling back to dense (embedding-based) search only.")
            return None  # Typesense not configured

        _client = typesense.Client({
            'api_key': api_key,
            'nodes': [{
                'host': os.getenv('TYPESENSE_HOST'),
                'port': int(os.getenv('TYPESENSE_PORT', '443')),
                'protocol': 'https'
            }],
            'connection_timeout_seconds': 5
        })
        print(f"✓ Typesense client initialized: {os.getenv('TYPESENSE_HOST')}")
    return _client


async def update_sparse_index(db = None, user = None):
    client = _get_client()
    if client is None:
        return {"status": "Typesense not configured"}

    if db is None:
        db = Annotated[Database, Depends(get_data)]
    if user is None:
        user = Annotated[dict, Depends(get_current_user)]

    foods = await get_foods_list(db, user)
    schema = {
        'name': 'foods',
        'fields': [
            {'name': 'food_name', 'type': 'string', 'optional': False, 'facet': False}
        ]
    }
    
    # Force delete and recreate the collection
    try:
        try:
            # Try to delete the collection if it exists
            client.collections['foods'].delete()
            print("Deleted existing 'foods' collection")
        except typesense.exceptions.ObjectNotFound:
            print("Collection 'foods' does not exist yet")
        
        # Create a new collection
        client.collections.create(schema)
        print("Created 'foods' collection with schema:", schema)
    except Exception as e:
        print(f"Error creating collection: {e}")
        return
    
    # Convert foods to a list if it's a dictionary
    food_list = []
    if isinstance(foods, dict):
        # If foods is a dictionary of food_id -> {"name": food_name}
        for food_id, food_data in foods.items():
            # Handle both {food_id: {"name": food_name}} and {food_id: food_name} formats
            if isinstance(food_data, dict):
                food_name = food_data.get('name', '')
            else:
                food_name = food_data

            food_list.append({
                '_id': food_id,
                'food_name': food_name
            })
    else:
        # If foods is already a list
        food_list = foods
    
    
    # Add documents in batches
    batch_size = 100
    total_foods = len(food_list)
    print(f"Preparing to index {total_foods} foods")
    
    # Process all documents in batches
    for i in range(0, total_foods, batch_size):
        batch = food_list[i:i+batch_size]
        documents = []
        for food in batch:
            doc = {
                'id': str(food['_id']),
                'food_name': food['food_name']
            }
            documents.append(doc)
        
        try:
            import_response = client.collections['foods'].documents.import_(
                documents,
                {'action': 'create'}
            )
            
            # Check for errors in the import response
            if isinstance(import_response, list):
                error_count = 0
                for idx, item in enumerate(import_response):
                    if item.get('success') is False:
                        error_count += 1
                        if error_count <= 3:  # Only print first few errors
                            print(f"Import error for document {idx} in batch {i//batch_size + 1}: {item}")
                
                if error_count > 0:
                    print(f"Warning: {error_count} documents failed to import in batch {i//batch_size + 1}")
                
            print(f"Indexed {len(documents)} foods (batch {i//batch_size + 1}/{(total_foods+batch_size-1)//batch_size})")
        except Exception as e:
            print(f"Error indexing batch: {e}")
    
    print(f"Finished indexing {total_foods} foods")

    # Verify document count after indexing
    try:
        # Wait a moment for indexing to complete
        import time
        time.sleep(1)

        stats = client.collections['foods'].retrieve()
        print(f"Collection now has {stats.get('num_documents', 0)} documents")

        # Try to get a sample document to verify
        search_result = client.collections['foods'].documents.search({
            'q': '*',
            'query_by': 'food_name',
            'limit': 1
        })
        if search_result.get('hits'):
            print(f"Successfully verified document retrieval: {search_result['hits'][0]['document']['food_name']}")
        else:
            print("Warning: Could not retrieve any documents with wildcard search")
    except Exception as e:
        print(f"Error verifying document count: {e}")

    # ========================================
    # INDEX NUTRIENTS
    # ========================================
    print("\n" + "="*50)
    print("Indexing nutrients...")
    print("="*50)

    # Get all nutrients from MongoDB, excluding kJ Energy (ID: 1062)
    # We only want kcal Energy (ID: 1008)
    nutrients = list(db.nutrients.find(
        {"_id": {"$ne": 1062}},  # Exclude kJ Energy
        {"_id": 1, "nutrient_name": 1}
    ).sort("_id", 1))

    if not nutrients:
        print("No nutrients found in database")
        return {"status": "error", "message": "No nutrients found"}

    nutrients_schema = {
        'name': 'nutrients',
        'fields': [
            {'name': 'name', 'type': 'string', 'optional': False, 'facet': False}
        ]
    }

    # Force delete and recreate the nutrients collection
    try:
        try:
            client.collections['nutrients'].delete()
            print("Deleted existing 'nutrients' collection")
        except typesense.exceptions.ObjectNotFound:
            print("Collection 'nutrients' does not exist yet")

        client.collections.create(nutrients_schema)
        print("Created 'nutrients' collection with schema:", nutrients_schema)
    except Exception as e:
        print(f"Error creating nutrients collection: {e}")
        return {"status": "error", "message": str(e)}

    # Add nutrient documents in batches
    total_nutrients = len(nutrients)
    print(f"Preparing to index {total_nutrients} nutrients")

    for i in range(0, total_nutrients, batch_size):
        batch = nutrients[i:i+batch_size]
        documents = []
        for nutrient in batch:
            doc = {
                'id': str(nutrient['_id']),
                'name': nutrient['nutrient_name']
            }
            documents.append(doc)

        try:
            import_response = client.collections['nutrients'].documents.import_(
                documents,
                {'action': 'create'}
            )

            # Check for errors
            if isinstance(import_response, list):
                error_count = 0
                for idx, item in enumerate(import_response):
                    if item.get('success') is False:
                        error_count += 1
                        if error_count <= 3:
                            print(f"Import error for nutrient {idx} in batch {i//batch_size + 1}: {item}")

                if error_count > 0:
                    print(f"Warning: {error_count} nutrients failed to import in batch {i//batch_size + 1}")

            print(f"Indexed {len(documents)} nutrients (batch {i//batch_size + 1}/{(total_nutrients+batch_size-1)//batch_size})")
        except Exception as e:
            print(f"Error indexing nutrient batch: {e}")

    print(f"Finished indexing {total_nutrients} nutrients")

async def search_foods(query: str, limit: int = 50) -> Dict:
    client = _get_client()
    if client is None:
        return {}

    try:
        # Use a wildcard search if query is empty
        if not query or query.strip() == "":
            q = '*'
        else:
            q = query
            
        search_parameters = {
            'q': q,
            'query_by': 'food_name',
            'limit': limit
        }
        
        # print(f"Searching for: '{q}'")
        results = client.collections['foods'].documents.search(search_parameters)
        hit_count = len(results.get('hits', []))
        # print(f"Found {hit_count} results")
        
        if hit_count == 0 and q != '*':
            # Try a wildcard search to see if any documents exist
            wildcard_results = client.collections['foods'].documents.search({
                'q': '*',
                'query_by': 'food_name',
                'limit': 1
            })
            if wildcard_results.get('hits'):
                print(f"Found documents with wildcard search: {len(wildcard_results['hits'])}")
                # Print a sample document to verify structure
                print(f"Sample document: {wildcard_results['hits'][0]['document']}")
            else:
                print("No documents found with wildcard search either")
        
        hits = results.get('hits', [])

        # Return empty dict if no hits
        if not hits:
            return {}

        max_score = max(hit.get('text_match', 0) for hit in hits)

        # Return normalized scores (0-100) as a dictionary of food_id to score
        results_dict = {}
        for hit in hits:
            food_id = hit['document'].get('id', '')
            if food_id:  # Only include if we have a valid food_id
                similarity = round((hit.get('text_match', 0) / max_score) * 100) if max_score > 0 else 0
                # Try to convert food_id from string to int for USDA foods
                # Custom foods will remain as ObjectId strings
                try:
                    food_id_converted = int(food_id)
                except ValueError:
                    # Keep as string for custom foods (ObjectId)
                    food_id_converted = food_id
                results_dict[food_id_converted] = similarity

        return results_dict
        
    except Exception as e:
        print(f"Error during search: {e}")
        return {}

async def get_sparse_index(
    query: str,
    db=None,
    user=None,
    threshold: float = 40,
    limit: int = 50
):
    
    # Search for foods
    search_results = await search_foods(query, limit)
    
    # The search_results is now a dictionary of food_id -> score
    # No need for parallel processing since the results are already in the right format
    
    # Filter results by threshold
    filtered_matches = {food_id: score for food_id, score in search_results.items() if score >= threshold}
    
    return filtered_matches

def pretty_print_matches(matches):
    for food_id, score in matches.items():
        print(f"{food_id}: {score}")



if __name__ == "__main__":
    import asyncio
    from pymongo import MongoClient
    
    
    # Connect to MongoDB
    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("DB_NAME")
    
    mongo_client = MongoClient(mongo_uri)
    mongo_db = mongo_client[db_name]
    
    # Mock user for testing
    mock_user = {"_id": "test_user_id"}
    food = "butter"
    
    result = asyncio.run(get_sparse_index(food, mongo_db, mock_user))
    print("Here are the filtered matches!")
    pretty_print_matches(result)