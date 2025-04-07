from typing import Dict
import os
from dotenv import load_dotenv
import typesense
import asyncio

# Load environment variables
load_dotenv()

# Initialize Typesense client
typesense_api_key = os.getenv("TYPESENSE_API_KEY")
typesense_host = os.getenv("TYPESENSE_HOST", "localhost")
typesense_port = os.getenv("TYPESENSE_PORT", "8108")
typesense_protocol = os.getenv("TYPESENSE_PROTOCOL", "http")

client_config = {
    'api_key': typesense_api_key,
    'nodes': [
        {
            'host': typesense_host,
            'port': typesense_port,
            'protocol': typesense_protocol
        }
    ],
    'connection_timeout_seconds': 10
}

client = typesense.Client(client_config)

async def search_nutrients_by_name(nutrient_name: str, threshold: float = 0.1, limit: int = 10) -> Dict[str, float]:
    """
    Search for nutrients using the sparse index (Typesense)
    Returns a dictionary of nutrient_id -> score
    
    Args:
        nutrient_name: The name of the nutrient to search for
        threshold: Minimum score threshold for matches
        limit: Maximum number of results to return
        
    Returns:
        Dictionary mapping nutrient IDs to match scores
    """
    
    # Search for nutrients
    search_params = {
        'q': nutrient_name,
        'query_by': 'name',
        'sort_by': '_text_match:desc',
        'per_page': limit
    }
    
    try:
        # Use asyncio.to_thread to run the synchronous Typesense client in a separate thread
        search_results = await asyncio.to_thread(
            client.collections['nutrients'].documents.search,
            search_params
        )
        
        # Process results
        matches = {}
        for hit in search_results['hits']:
            nutrient_id = hit['document']['id']
            score = hit['text_match']
            matches[nutrient_id] = score
        
        # Filter results by threshold
        filtered_matches = {nutrient_id: score for nutrient_id, score in matches.items() if score >= threshold}
        
        return filtered_matches
    except Exception as e:
        print(f"Error searching nutrients: {e}")
        return {}

if __name__ == "__main__":
    # Test the function
    async def test():
        results = await search_nutrients_by_name("Protein")
        print("Search results for 'Protein':")
        for nutrient_id, score in results.items():
            print(f"  {nutrient_id}: {score}")
    
    asyncio.run(test())