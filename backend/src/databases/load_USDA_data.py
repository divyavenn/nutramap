import csv
from pymongo import MongoClient, UpdateOne
import os
from backend.src.databases.mongo import URL, DB

# Connect to the MongoDB server
cluster = MongoClient(URL)
# Access the database
db = cluster[DB]

# Collections
nutrients_collection = db["nutrients"]
foods_collection = db["foods"]

# Define collection mappings
collections = {
    "Nutrient": nutrients_collection,
    "Food": foods_collection,
}

def get_food_info(csv_row):
    fdc_id, data_type, description, food_category_id, publication_date = csv_row
    return {
        "_id": int(fdc_id),
        "food_name": description,
        "nutrients" : [],
        "source" : "USDA",
    }

def get_nutrient_info(csv_row):
    nutrient_id, name, unit_name, nutrient_nbr, rank = csv_row
    return {
        "_id": int(nutrient_id),
        "nutrient_name": name.strip(),
        "unit": unit_name.strip(),
    }

def get_data_info(csv_row):
    id, fdc_id, nutrient_id, amount, data_points, derivation_id, min_val, max_val, median, footnote, min_year_acquired = csv_row
    return {
        "_id": str(id),
        "food_id": int(fdc_id),
        "nutrient_id": int(nutrient_id),
        "amt": float(amount),
    }

get_info_for_model = {
    "Nutrient": get_nutrient_info,
    "Food": get_food_info,
    "Data": get_data_info,
}


def embed_food_nutrient_data(file_path, collection = db['foods'], titles = True, batch_size=100, overwrite=True):
    """
    Embed food-nutrient data into the 'foods' collection

    Args:
        file_path (str): Path to the CSV file.
        collection_name (str): Name of the MongoDB collection.
        titles (bool): Whether the CSV has a header row.
        batch_size (int): Number of rows to process in each batch.
        overwrite (bool): Whether to drop the existing collection before loading data.
    """
    if overwrite:
        collection.update_many({}, {"$unset": {"nutrients": ""}})
        
    try:
        with open(file_path, mode="r") as file:
            reader = csv.reader(file)
            # Skip header row if specified
            if titles:
                next(reader)

            new_data = {}
            for row in reader:
                nutrient_info = get_data_info(row)

                # Prepare nutrient document to embed
                nutrient = {
                    "nutrient_id": nutrient_info["nutrient_id"],
                    "amt": nutrient_info["amt"]
                }

                # creating an array of nutrient data for each food_id
                if nutrient_info["food_id"] not in new_data:
                    new_data[nutrient_info["food_id"]] = []

                new_data[nutrient_info["food_id"]].append(nutrient)

            # Perform bulk updates to embed nutrients
            batch = []
            for food_id, nutrients in new_data.items():
                batch.append(
                    UpdateOne(
                        {"_id": food_id},
                        {"$push": {"nutrients": {"$each": nutrients}}},
                        upsert=False
                    )
                )

                if len(batch) >= batch_size:  # Commit in batches
                    foods_collection.bulk_write(batch)
                    print(f"Updated {batch_size} foods with embedded nutrients.")
                    batch.clear()

            if batch:  # Commit remaining
                foods_collection.bulk_write(batch)
                print(f"Updated {len(batch)} foods with embedded nutrients.")

        print("Nutrients successfully embedded into foods!")

    except Exception as e:
        print(f"Error while embedding nutrients: {e}")



def load_data(file_path, collection_name, titles=True, batch_size=100, overwrite=True):
    """
    Load data from a CSV file into a MongoDB collection.

    Args:
        file_path (str): Path to the CSV file.
        collection_name (str): Name of the MongoDB collection.
        titles (bool): Whether the CSV has a header row.
        batch_size (int): Number of rows to process in each batch.
        overwrite (bool): Whether to drop the existing collection before loading data.
    """
    collection = collections[collection_name]
    get_info = get_info_for_model[collection_name]

    # Drop and recreate collection if overwrite is enabled
    if overwrite:
        collection.drop()

    try:
        with open(file_path, mode="r") as file:
            reader = csv.reader(file)

            # Skip header row if specified
            if titles:
                next(reader)

            batch = []
            for row in reader:
                try:
                    # Prepare document for MongoDB
                    document = get_info(row)

                    # Add an upsert operation to the batch
                    batch.append(
                        UpdateOne({"_id": document["_id"]}, {"$set": document}, upsert=True)
                    )

                    # Execute batch when the batch size is reached
                    if len(batch) >= batch_size:
                        collection.bulk_write(batch)
                        print(f"Committed {len(batch)} records to {collection_name}.")
                        batch.clear()

                except ValueError as ve:
                    print(f"Skipping invalid row: {row}. Error: {ve}")
                    continue

            # Commit any remaining operations
            if batch:
                collection.bulk_write(batch)
                print(f"Committed {len(batch)} records to {collection_name}.")

        print(f"{collection_name} successfully loaded!")

    except Exception as e:
        print(f"Error while loading {collection_name}: {e}")

# Define file paths
base_dir = os.path.dirname(os.path.abspath(__file__))

# load_data(os.path.join(base_dir, "Archive/nutrient.csv"), "Nutrient", batch_size=500)
# load_data(os.path.join(base_dir, "Archive/food.csv"), "Food", batch_size=500)
embed_food_nutrient_data(os.path.join(base_dir, "Archive/food_nutrient.csv"))