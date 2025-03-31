from pymongo import MongoClient, ASCENDING
import os
from dotenv import load_dotenv

__package__ = "nutramap.databases"

# Load environment variables
load_dotenv()

# Get MongoDB connection details from environment variables
MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME")
if not MONGO_URI and not DB_NAME:
    raise ValueError("MongoDB environment variables are not set")

# Connect to the MongoDB server
cluster = MongoClient(MONGO_URI)
# Access the database
db = cluster[DB_NAME]

# Ensure the unique index on email
db.users.create_index([("email", ASCENDING)], unique=True)

db.requirements.create_index(
    [("nutrient_id", ASCENDING), ("user_id", ASCENDING)],
    unique=True,
    name="unique_requirement_ndex"
)

if db.users.count_documents({}) == 0:
    print("empty!")

def get_data():
    return db

# Ensure the client is closed when the application shuts down
def close_mongo_db():
    cluster.close()