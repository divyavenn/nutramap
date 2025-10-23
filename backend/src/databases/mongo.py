from pymongo import MongoClient, ASCENDING
import os
from dotenv import load_dotenv

__package__ = "nutramap.databases"

# Load environment variables from .env file (for local development)
load_dotenv()

# Global variables for lazy connection
_cluster = None
_db = None

def _init_db():
    """Initialize database connection lazily"""
    global _cluster, _db

    if _db is not None:
        return _db

    # Get MongoDB connection details from environment variables
    # Read these at runtime, not import time, so Modal secrets work
    MONGO_URI = os.getenv("MONGO_URI")
    DB_NAME = os.getenv("DB_NAME", "nutramapper")

    if not MONGO_URI:
        raise ValueError("MONGO_URI environment variable is not set")

    # Connect to the MongoDB server
    _cluster = MongoClient(MONGO_URI)
    # Access the database
    _db = _cluster[DB_NAME]

    # Ensure the unique index on email
    _db.users.create_index([("email", ASCENDING)], unique=True)

    _db.requirements.create_index(
        [("nutrient_id", ASCENDING), ("user_id", ASCENDING)],
        unique=True,
        name="unique_requirement_ndex"
    )

    if _db.users.count_documents({}) == 0:
        print("Database is empty!")

    return _db

def get_data():
    """Get database instance, initializing if needed"""
    return _init_db()

# Ensure the client is closed when the application shuts down
def close_mongo_db():
    global _cluster
    if _cluster is not None:
        _cluster.close()