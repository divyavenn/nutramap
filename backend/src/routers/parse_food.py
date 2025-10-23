from typing import List, Dict, Optional, Tuple
import os
from dotenv import load_dotenv
from openai import OpenAI
import json
import re
import base64

# Load environment variables
load_dotenv()

# Lazy OpenAI client initialization
_client = None

def _get_client():
    """Get OpenAI client, initializing if needed"""
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        _client = OpenAI(api_key=api_key)
    return _client

async def parse_new_food(food_description: str, image_path: Optional[str] = None) -> Tuple[str, List[Dict]]:
    try:
        # Prepare the system message
        system_message = """You are a nutrition expert assistant. Your task is to analyze the food description 
        and extract the food name and its nutritional information. Focus on common nutrients like calories, 
        protein, carbohydrates, fat, fiber, vitamins, and minerals. Provide the most accurate estimates based 
        on standard nutritional databases. If you cannot find exact nutritional information for an item, estimate it based off a common recipe."""
        
        # Prepare the user message
        user_message = f"Please analyze this food: {food_description}"
        
        # Prepare messages array
        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message}
        ]
        
        # Add image if provided
        if image_path and os.path.exists(image_path):
            # Read the image file and encode as base64
            with open(image_path, "rb") as image_file:
                base64_image = base64.b64encode(image_file.read()).decode('utf-8')
            
            # Add image to messages
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": "Here is an image, either of the food or its nutritional label, that may provide additional context."},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            })
        
        # Add format instructions
        messages.append({
            "role": "user",
            "content": """Please respond in the following JSON format only:
            {
                "food_name": "Name of the food",
                "nutrients": [
                    {"nutrient_name": "Calories", "amount": 100, "unit": "kcal"},
                    {"nutrient_name": "Protein", "amount": 5, "unit": "g"},
                    ...
                ]
            }
            """
        })
        
        # Make the OpenAI API call
        client = _get_client()
        response = client.chat.completions.create(
            model="gpt-4-vision-preview" if image_path else "gpt-4",
            messages=messages,
            temperature=0.3,
            max_tokens=1000
        )
        
        # Parse the response
        response_text = response.choices[0].message.content
        
        # Extract JSON from the response
        json_match = re.search(r'({[\s\S]*})', response_text)
        if json_match:
            json_str = json_match.group(1)
            data = json.loads(json_str)
            
            food_name = data.get("food_name", food_description)
            nutrients_list = data.get("nutrients", [])
            
            # Convert to the format needed by add_food
            formatted_nutrients = []
            for nutrient in nutrients_list:
                formatted_nutrients.append({
                    "nutrient_name": nutrient.get("nutrient_name"),
                    "amount": float(nutrient.get("amount", 0))
                })
            
            return food_name, formatted_nutrients
        else:
            print(f"Failed to extract JSON from OpenAI response: {response_text}")
            return food_description, []
            
    except Exception as e:
        print(f"Error in parse_new_food: {e}")
        return food_description, []

if __name__ == "__main__":
    # Test the function
    import asyncio
    
    async def test():
        food_name, nutrients = await parse_new_food("Homemade chocolate chip cookie with walnuts")
        print(f"Food Name: {food_name}")
        print("Nutrients:")
        for nutrient in nutrients:
            print(f"  {nutrient['nutrient_name']}: {nutrient['amount']}")
    
    asyncio.run(test())