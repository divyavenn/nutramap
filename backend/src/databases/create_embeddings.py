import os
import time
import openai
from pymongo import MongoClient
from dotenv import load_dotenv
from tqdm import tqdm

# Load env variables
load_dotenv()
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Connect to the MongoDB server
cluster = MongoClient(os.getenv("MONGO_URI"))
# Access the database
db = cluster[os.getenv("DB_NAME")]

# Embedding model
EMBEDDING_MODEL = "text-embedding-3-large"

def get_embedding(text: str) -> list:
    try:
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"Error embedding '{text}': {e}")
        return None

def embed_all_foods():
    cursor = db["foods"].find(
        {"embedding": {"$exists": False}},  # Only foods without embeddings
        {"_id": 1, "food_name": 1}
    )

    total = db["foods"].count_documents({"embedding": {"$exists": False}})
    print(f"Found {total} foods to embed.")

    for food in tqdm(cursor, total=total):
        food_name = food.get("food_name").strip()
        if not food_name:
            continue

        embedding = get_embedding(food_name)
        if embedding:
            db["foods"].update_one(
                {"_id": food["_id"]},
                {"$set": {"embedding": embedding}}
            )
            time.sleep(0.5)  # optional: stay well within rate limits

if __name__ == "__main__":
    embed_all_foods()