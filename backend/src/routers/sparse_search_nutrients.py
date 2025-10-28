from typing import Dict
import os
from dotenv import load_dotenv
import typesense
import asyncio

# Load environment variables
load_dotenv()




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


async def search_nutrients_by_name(nutrient_name: str, db=None, request=None, threshold: float = 0.1, limit: int = 10) -> Dict[str, float]:
    """
    Hybrid search for nutrients by name using RRF fusion.
    Combines sparse (Typesense) and dense (FAISS) search results.
    """
    if db is None:
        # Fallback to sparse-only search if no db provided
        return await sparse_search_nutrients(nutrient_name, threshold, limit)

    try:
        # Import search functions
        from .dense import find_dense_nutrient_matches
        from .match import rrf_fusion

        # Use RRF fusion with nutrient search functions
        # Returns list of nutrient IDs
        matches = await rrf_fusion(
            sparse_search_nutrients, [nutrient_name, threshold, limit],
            find_dense_nutrient_matches, [nutrient_name, db, request, 70, limit],
            k=30,
            n=limit
        )

        # Convert list of IDs back to dict format for backward compatibility
        # Get scores from sparse results for the matched IDs
        sparse_results = await sparse_search_nutrients(nutrient_name, threshold, limit)
        result_dict = {}
        for nutrient_id in matches:
            # Use sparse score if available, otherwise use a default score
            result_dict[nutrient_id] = sparse_results.get(nutrient_id, 100.0)

        return result_dict

    except Exception as e:
        print(f"Error in hybrid nutrient search: {e}")
        import traceback
        traceback.print_exc()
        # Fallback to sparse-only search
        return await sparse_search_nutrients(nutrient_name, threshold, limit)

if __name__ == "__main__":
    # Test the function
    async def test():
        results = await search_nutrients_by_name("Protein")
        print("Search results for 'Protein':")
        for nutrient_id, score in results.items():
            print(f"  {nutrient_id}: {score}")
    
    asyncio.run(test())