import os
from openai import OpenAI
from dotenv import load_dotenv
from typing import List, Dict
from typing_extensions import Annotated
from scipy.spatial.distance import cosine
from fastapi import Depends
from pymongo.database import Database
import asyncio

# When running as a module within the application, use relative imports
try:
    from ..databases.mongo import get_data
    from ..routers.foods import get_all_foods
    from ..routers.auth import get_current_user
# When running this file directly, use absolute imports
except ImportError:
    import sys
    import os
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    from src.databases.mongo import get_data
    from src.routers.foods import get_all_foods
    from src.routers.auth import get_current_user


db = Annotated[Database, Depends(get_data)]
user = Annotated[dict, Depends(get_current_user)]

# Load environment variables
load_dotenv()

# Initialize OpenAI client
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY environment variable is not set")

client = OpenAI(api_key=api_key)

# Define the structured output response format
response_format = { "type": "json_object" }


async def match_foods_to_database(parsed_foods: List[Dict], db, user):
    """
    Match free-text food names to database entries using semantic similarity via embeddings.
    
    Args:
        parsed_foods: List of dictionaries with food_name and amount_in_grams
        db: Database connection
        user: User dictionary
    
    Returns:
        List of dictionaries with food_id and amount_in_grams
    """
    # Get all foods from the database
    foods = await get_all_foods(db, user)
    
    # Create a list of food names from the database
    names = list(foods.keys())
    
    # Generate embeddings for all database food names
    db_embeddings = {}
    for i in range(0, len(names), 20):  # Process in batches of 20
        batch = names[i:i+20]
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=batch
        )
        for j, food_name in enumerate(batch):
            db_embeddings[food_name] = response.data[j].embedding
    
    # Match each parsed food to a database food
    matched_foods = []
    
    for food in parsed_foods:
        food_name = food["food_name"]
        
        # Generate embedding for the parsed food name
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=[food_name]
        )
        food_embedding = response.data[0].embedding
        
        # Find the most similar food in the database
        best_match = None
        best_similarity = 0
        
        for db_food_name, embedding in db_embeddings.items():
            # Calculate cosine similarity (1 - cosine distance)
            similarity = 1 - cosine(food_embedding, embedding)
            
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = db_food_name
        
        # If similarity is high enough, consider it a match
        if best_similarity >= 0.85 and best_match:
            matched_foods.append({
                "food_id": str(foods[best_match]),
                "amount_in_grams": food["amount_in_grams"]
            })
        else:
            print(f"No match found for {food_name}. Best match was {best_match} with similarity {best_similarity}")
    
    return matched_foods
  
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
  # Test data
  foods = [
    {
      "food_name": "Greek yogurt made from skim milk",
      "amount_in_grams": 120,
      "timestamp": "2025-03-31T06:38:43"
    },
    {
      "food_name": "mango, fresh, peeled and chopped",
      "amount_in_grams": 150,
      "timestamp": "2025-03-31T06:38:43"
    },
    {
      "food_name": "milk 3.25% with added Vitamin D",
      "amount_in_grams": 100,
      "timestamp": "2025-03-31T06:38:43"
    },
    {
      "food_name": "sugar, granulated",
      "amount_in_grams": 20,
      "timestamp": "2025-03-31T06:38:43"
    },
    {
      "food_name": "cardamom, ground",
      "amount_in_grams": 2,
      "timestamp": "2025-03-31T06:38:43"
    },
    {
      "food_name": "ice cubes",
      "amount_in_grams": 30,
      "timestamp": "2025-03-31T06:38:43"
    }
  ]
    
  result = asyncio.run(match_foods_to_database(foods, mongo_db, mock_user))
  print(result)
    