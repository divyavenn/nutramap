import os
import time
import openai
from pymongo import MongoClient
from dotenv import load_dotenv
from tqdm import tqdm

# Load env variables
load_dotenv()

# Connect to the MongoDB server
cluster = MongoClient(os.getenv("MONGO_URI"))
# Access the database
db = cluster[os.getenv("DB_NAME")]

# Embedding model configuration
USE_GPU_EMBEDDINGS = os.getenv("USE_GPU_EMBEDDINGS", "true").lower() == "true"
BATCH_SIZE = int(os.getenv("EMBEDDING_BATCH_SIZE", "256"))

def get_embedding_gpu(texts: list[str]) -> list[list[float]]:
    """Get embeddings using GPU-accelerated local model via sentence-transformers.

    This is 10-100x faster than OpenAI API and has no cost.
    Uses BAAI/bge-large-en-v1.5 model which produces 1024-dim embeddings.
    """
    try:
        from sentence_transformers import SentenceTransformer
        import torch

        # Load model (will be cached after first load)
        model = SentenceTransformer("BAAI/bge-large-en-v1.5")

        # Move to GPU if available
        if torch.cuda.is_available():
            model = model.to('cuda')
            print(f"✓ Using GPU: {torch.cuda.get_device_name(0)}")
        else:
            print("⚠ No GPU available, using CPU")

        # Generate embeddings in batch
        embeddings = model.encode(
            texts,
            batch_size=BATCH_SIZE,
            convert_to_numpy=True,
            show_progress_bar=True,
            normalize_embeddings=True,  # Normalize for cosine similarity
        )

        return embeddings.tolist()

    except Exception as e:
        print(f"Error with GPU embeddings: {e}")
        print("Falling back to OpenAI API...")
        return get_embedding_openai_batch(texts)


def get_embedding_openai(text: str) -> list:
    """Get embedding using OpenAI API (legacy/fallback method)."""
    try:
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.embeddings.create(
            model="text-embedding-3-large",
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"Error embedding '{text}': {e}")
        return None


def get_embedding_openai_batch(texts: list[str]) -> list[list[float]]:
    """Get embeddings for multiple texts using OpenAI API."""
    try:
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.embeddings.create(
            model="text-embedding-3-large",
            input=texts
        )
        return [item.embedding for item in response.data]
    except Exception as e:
        print(f"Error embedding batch: {e}")
        return []


def get_embedding(text: str) -> list:
    """Get embedding for a single text.

    Uses GPU if available, falls back to OpenAI API.
    """
    if USE_GPU_EMBEDDINGS:
        embeddings = get_embedding_gpu([text])
        return embeddings[0] if embeddings else None
    else:
        return get_embedding_openai(text)


def embed_all_foods():
    """Embed all foods in the database that don't have embeddings yet.

    Uses GPU-accelerated batch processing for 10-100x speedup.
    """
    cursor = db["foods"].find(
        {"embedding": {"$exists": False}},  # Only foods without embeddings
        {"_id": 1, "food_name": 1}
    )

    total = db["foods"].count_documents({"embedding": {"$exists": False}})
    print(f"Found {total} foods to embed.")

    if total == 0:
        print("No foods to embed!")
        return

    if USE_GPU_EMBEDDINGS:
        print(f"Using GPU-accelerated embeddings with batch size {BATCH_SIZE}")

        # Collect all foods to embed
        foods_to_embed = []
        for food in cursor:
            food_name = food.get("food_name", "").strip()
            if food_name:
                foods_to_embed.append({
                    "_id": food["_id"],
                    "name": food_name
                })

        if not foods_to_embed:
            print("No valid food names found")
            return

        # Process in batches
        for i in tqdm(range(0, len(foods_to_embed), BATCH_SIZE), desc="Embedding batches"):
            batch = foods_to_embed[i:i + BATCH_SIZE]
            texts = [f["name"] for f in batch]

            # Get embeddings for entire batch at once (GPU accelerated!)
            embeddings = get_embedding_gpu(texts)

            if embeddings and len(embeddings) == len(batch):
                # Update all foods in batch
                for food, embedding in zip(batch, embeddings):
                    db["foods"].update_one(
                        {"_id": food["_id"]},
                        {"$set": {"embedding": embedding}}
                    )
            else:
                print(f"⚠ Batch {i//BATCH_SIZE} failed, skipping...")

    else:
        # Legacy sequential processing with OpenAI API
        print("Using OpenAI API (sequential processing)")
        for food in tqdm(cursor, total=total):
            food_name = food.get("food_name", "").strip()
            if not food_name:
                continue

            embedding = get_embedding_openai(food_name)
            if embedding:
                db["foods"].update_one(
                    {"_id": food["_id"]},
                    {"$set": {"embedding": embedding}}
                )
                time.sleep(0.5)  # Rate limiting

    print(f"✓ Finished embedding {total} foods")


if __name__ == "__main__":
    embed_all_foods()