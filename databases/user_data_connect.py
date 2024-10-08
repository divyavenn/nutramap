from pymongo import MongoClient, ASCENDING

__package__ = "nutramap.databases"
URL = "mongodb+srv://venndivya:qZ6BE54Q5DDVGW4H@users.akqcvfu.mongodb.net/"
DB = "nutramapper"

# Connect to the MongoDB server
cluster = MongoClient(URL)
# Access the database
db = cluster[DB]

# Ensure the unique index on email
db.users.create_index([("email", ASCENDING)], unique=True)

if db.users.count_documents({}) == 0:
    print("empty!")

def get_user_data():
    return db

# Ensure the client is closed when the application shuts down
def close_mongo_db():
    cluster.close()