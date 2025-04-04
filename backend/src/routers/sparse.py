from typing import Dict, List
from typing_extensions import Annotated
from fastapi import Depends
from pymongo.database import Database
import typesense
from dotenv import load_dotenv
import os
import json
import asyncio

# When running as a module within the application, use relative imports
try:
    from ..databases.mongo import get_data
    from ..routers.auth import get_current_user
    from ..routers.foods import get_all_foods 
    from ..routers.parallel import parallel_process
# When running this file directly, use absolute imports
except ImportError:
    import sys
    import os
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    from src.databases.mongo import get_data
    from src.routers.auth import get_current_user
    from src.routers.foods import get_all_foods, get_food_name
    from src.routers.parallel import parallel_process
    

# Load environment variables
load_dotenv()

# Initialize Typesense client
client = typesense.Client({
    'api_key': os.getenv('TYPESENSE_API_KEY'),
    'nodes': [{
        'host': os.getenv('TYPESENSE_HOST'),
        'port': int(os.getenv('TYPESENSE_PORT', '443')),
        'protocol': 'https'
    }],
    'connection_timeout_seconds': 5
})


async def update_sparse_index(db = None, user = None):
    if db is None:
        db = Annotated[Database, Depends(get_data)]
    if user is None:
        user = Annotated[dict, Depends(get_current_user)]
    
    foods = await get_all_foods(db, user)
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
        # If foods is a dictionary of food_id -> food_name
        for food_name, food_id in foods.items():
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

async def search_foods(query: str, limit: int = 50) -> Dict:
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
        
        print(f"Searching for: '{q}'")
        results = client.collections['foods'].documents.search(search_parameters)
        hit_count = len(results.get('hits', []))
        print(f"Found {hit_count} results")
        
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
        max_score = max(hit.get('text_match', 0) for hit in hits)
        
        # Return normalized scores (0-100) as a dictionary of food_id to score
        results_dict = {}
        for hit in hits:
            food_id = hit['document'].get('id', '')
            if food_id:  # Only include if we have a valid food_id
                similarity = round((hit.get('text_match', 0) / max_score) * 100) if max_score > 0 else 0
                results_dict[food_id] = similarity
        
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
    """
    Search for foods using the sparse index (Typesense)
    Returns a dictionary of food_id -> score
    """
    print(f"Searching for: '{query}'")
    
    # Search for foods
    search_results = await search_foods(query, limit)
    
    # The search_results is now a dictionary of food_id -> score
    # No need for parallel processing since the results are already in the right format
    
    # Filter results by threshold
    filtered_matches = {food_id: score for food_id, score in search_results.items() if score >= threshold}
    
    print(f"Found {len(filtered_matches)} results")
    return filtered_matches

def pretty_print_matches(matches):
    import os
    from dotenv import load_dotenv
    from pymongo import MongoClient

    load_dotenv()

    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("DB_NAME")
    mongo_client = MongoClient(mongo_uri)
    db = mongo_client[db_name]

    for food_id, score in matches.items():
        food_id_int = int(food_id)
        food_name = get_food_name(food_id_int, db)
        print(f"{food_name} - {score:.4f}")

    mongo_client.close()

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
    
    #asyncio.run(update_sparse_index(mongo_db, mock_user))
    
    food = "butter"
    
    result = asyncio.run(get_sparse_index(food, mongo_db, mock_user))
    print("Here are the filtered matches!")
    pretty_print_matches(result)