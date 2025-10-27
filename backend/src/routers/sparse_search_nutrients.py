from typing import Dict
import os
from dotenv import load_dotenv
import typesense
import asyncio
from openai import OpenAI
import numpy as np

# Load environment variables
load_dotenv()

# Lazy Typesense client initialization
_client = None
_openai_client = None

def _get_openai_client():
    """Get OpenAI client, initializing if needed"""
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


async def dense_search_nutrients(nutrient_name: str, db, threshold: float = 0.7, limit: int = 10) -> Dict[str, float]:
    """
    Search for nutrients using semantic (dense) search with embeddings.
    Used as fallback when sparse search fails.
    """
    try:
        openai_client = _get_openai_client()
        if openai_client is None:
            return {}

        # Generate embedding for the query
        response = openai_client.embeddings.create(
            model="text-embedding-3-large",  # Must match what's in database
            input=nutrient_name.lower().strip()
        )
        query_embedding = response.data[0].embedding
        query_array = np.array([query_embedding], dtype=np.float32)

        # Get all nutrients from database that have embeddings
        nutrients = list(db.nutrients.find({"embedding": {"$exists": True}}))

        if not nutrients:
            print("No nutrients with embeddings found in database")
            return {}

        # Calculate cosine similarity with all nutrient embeddings
        matches = {}
        for nutrient in nutrients:
            nutrient_embedding = np.array([nutrient["embedding"]], dtype=np.float32)

            # Normalize vectors
            query_norm = query_array / np.linalg.norm(query_array)
            nutrient_norm = nutrient_embedding / np.linalg.norm(nutrient_embedding)

            # Cosine similarity
            similarity = float(np.dot(query_norm, nutrient_norm.T)[0][0])

            # Convert to 0-100 scale and filter by threshold
            score = similarity * 100
            if score >= threshold * 100:
                matches[str(nutrient["_id"])] = score

        # Sort by score and return top results
        sorted_matches = dict(sorted(matches.items(), key=lambda x: x[1], reverse=True)[:limit])

        if sorted_matches:
            print(f"✓ Dense search found {len(sorted_matches)} matches for '{nutrient_name}'")

        return sorted_matches

    except Exception as e:
        print(f"Error in dense nutrient search: {e}")
        import traceback
        traceback.print_exc()
        return {}


async def sparse_search_nutrients(nutrient_name: str, threshold: float = 0.1, limit: int = 10) -> Dict[str, float]:
    """
    Search for nutrients using sparse (keyword-based) search with Typesense.
    Returns nutrient_id -> score dictionary.
    """
    from .sparse import _get_client

    search_params = {
        'q': nutrient_name,
        'query_by': 'name',
        'sort_by': '_text_match:desc',
        'per_page': limit
    }

    try:
        # Get client
        client = _get_client()
        if client is None:
            print("⚠ Typesense not configured for sparse nutrient search")
            return {}

        # Use run_in_executor to run the synchronous Typesense client in a separate thread
        loop = asyncio.get_event_loop()
        search_results = await loop.run_in_executor(
            None,
            lambda: client.collections['nutrients'].documents.search(search_params)
        )

        # Process results
        matches = {}
        for hit in search_results['hits']:
            nutrient_id = hit['document']['id']
            score = hit['text_match']
            matches[nutrient_id] = score

        # Filter results by threshold
        filtered_matches = {nutrient_id: score for nutrient_id, score in matches.items() if score >= threshold}

        if filtered_matches:
            print(f"✓ Sparse search found {len(filtered_matches)} matches for '{nutrient_name}'")

        return filtered_matches

    except Exception as e:
        print(f"Error in sparse nutrient search: {e}")
        import traceback
        traceback.print_exc()
        return {}


async def search_nutrients_by_name(nutrient_name: str, db=None, threshold: float = 0.1, limit: int = 10) -> Dict[str, float]:
    """
    Hybrid search for nutrients by name.
    Tries sparse search first, falls back to dense search if no results found.
    """
    # Try sparse search first
    sparse_results = await sparse_search_nutrients(nutrient_name, threshold, limit)

    if sparse_results:
        return sparse_results

    # If sparse search found no results, try dense search as fallback
    if db is not None:
        print(f"⚠ Sparse search found no matches for '{nutrient_name}', trying dense search...")
        dense_matches = await dense_search_nutrients(nutrient_name, db, threshold=0.7, limit=limit)
        if dense_matches:
            return dense_matches

    return {}

if __name__ == "__main__":
    # Test the function
    async def test():
        results = await search_nutrients_by_name("Protein")
        print("Search results for 'Protein':")
        for nutrient_id, score in results.items():
            print(f"  {nutrient_id}: {score}")
    
    asyncio.run(test())