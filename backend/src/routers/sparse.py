from typing import Dict, List
from typing_extensions import Annotated
import rapidfuzz
from fastapi import Depends
from pymongo.database import Database
from pymongo import DESCENDING

# When running as a module within the application, use relative imports
try:
    from ..databases.mongo import get_data
    from ..routers.auth import get_current_user
# When running this file directly, use absolute imports
except ImportError:
    import sys
    import os
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    from src.databases.mongo import get_data
    from src.routers.auth import get_current_user

# List of common English prepositions to remove
filler_words = [
    "about", "above", "across", "after", "against", "along", "amid", "among",
    "around", "as", "at", "before", "behind", "below", "beneath", "beside",
    "between", "beyond", "but", "by", "concerning", "considering", "despite",
    "down", "during", "except", "for", "from", "in", "inside", "into", "like",
    "near", "of", "off", "on", "onto", "out", "outside", "over", "past", "per",
    "regarding", "round", "since", "through", "throughout", "to", "toward",
    "towards", "under", "underneath", "until", "unto", "up", "upon", "with",
    "within", "without", "via", "made",
]

def remove_filler_words(text: str) -> str:
    """
    Remove common prepositions from the input text.
    
    Args:
        text: Input text string
        
    Returns:
        Text with prepositions removed
    """
    # Convert to lowercase and split into words
    words = text.lower().split()
    
    # Filter out prepositions
    filtered_words = [word for word in words if word not in filler_words]
    
    # Join the words back together
    return " ".join(filtered_words)

async def rerank_with_rapidfuzz(query: str, foods: List[Dict]) -> List[Dict]:
    # Re-rank results using rapidfuzz
    results = []
    for food in foods:
        # Calculate similarity using token sort ratio for better handling of word order
        similarity = rapidfuzz.fuzz.token_sort_ratio(query.lower(), food["food_name"].lower()) / 100.0
        
        results.append({
            "food_id": str(food["_id"]),
            "food_name": food["food_name"],
            "similarity": similarity
        })
    
    # Sort results by similarity score in descending order
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results 
  
async def sparse_match_foods(
    query: str, 
    db: Annotated[Database, Depends(get_data)],
    user: Dict = Depends(get_current_user),
    limit: int = 50
) -> List[Dict]:

    cleaned_query = remove_filler_words(query)
    
    # If query is empty after removing prepositions, return empty list
    if not cleaned_query:
        return []
    
    # Split the query into words for MongoDB text search
    query_words = cleaned_query.split()
    
    # Create a MongoDB text search query
    # This will match any document that contains any of the words in the query
    search_query = {
        "$text": {"$search": " ".join(query_words)},
        "$or": [{"source": "USDA"}, {"source": user["_id"]}]  # Match USDA or user's foods
    }
    
    # Project only the necessary fields and include the text score
    projection = {
        "_id": 1,
        "food_name": 1,
        "score": {"$meta": "textScore"}
    }
    
    # Find matching foods, sort by text score, and limit to specified number
    cursor = db.foods.find(
        search_query,
        projection
    ).sort([("score", DESCENDING)]).limit(limit)
    
    # Convert cursor to list
    foods = list(cursor)
    
    foods = await rerank_with_rapidfuzz(query, foods)
  
    return foods

async def get_sparse_index(
    query: str,
    db: Annotated[Database, Depends(get_data)],
    user: Dict = Depends(get_current_user),
    threshold: float = 0.3,
    limit: int = 50
) -> List[Dict]:

    matches = await sparse_match_foods(query, db, user)
    
    
     # Filter by threshold and limit
    filtered_matches = [
        match for match in matches 
       if match["similarity"] >= threshold
    ][:limit]
    
    return filtered_matches
  
  
if __name__ == "__main__":
  import os
  import asyncio
  from pymongo import MongoClient
  from dotenv import load_dotenv
      
  # Load environment variables
  load_dotenv()
      
  # Connect to MongoDB
  mongo_uri = os.getenv("MONGO_URI")
  db_name = os.getenv("DB_NAME")
    
  mongo_client = MongoClient(mongo_uri)
  mongo_db = mongo_client[db_name]
      
  # Mock user for testing
  mock_user = {"_id": "test_user_id"}
  
  food = "Greek yogurt made from skim milk"
  
  result = asyncio.run(get_sparse_index(food, mongo_db, mock_user))
  print(result)