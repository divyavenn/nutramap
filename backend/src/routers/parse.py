import os
from openai import OpenAI
from dotenv import load_dotenv
from typing import List, Dict, Tuple
from datetime import datetime
import json
import asyncio
# re is used in parse_new_food function for regex pattern matching
import re

# When running as a module within the application, use relative imports
try:
    from .parallel import parallel_process

# When running this file directly, use absolute imports
except ImportError:
    import sys
    import os
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    from src.routers.parallel import parallel_process

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

# Define the structured output response format
response_format = { "type": "json_object" }

async def parse_meal_description(meal_description: str) -> Tuple[List[Dict], Dict[str, datetime]]:
    """Parse meal description into ingredients with natural portions (cups, spoons, etc)"""
    try:
        current_time = datetime.now()

        prompt = f"""Your job is to parse meal descriptions into separate foods, natural portion sizes, and timestamps.

        The database has cooking ingredients in many versions, for example: boiled, fried, cooked, raw, drained, baked, steamed, low-fat, added Vitamin D, with or without seeds, with or without salt) as well as many common branded foods.
        Be as specific as possible in stating the version of the ingredient and how it would likely be prepared. The database is extensive, so err on the side of specificity.

        - legumes: (yellow lentils cooked) (black beans dried) (chickpeas)
        - grains: brown rice (cooked), steel cut oats (raw), bread (whole grain, fortified with Iron), (Wheat flour, white, all-purpose, enriched, bleached)
        - fats: coconut oil, olive oil, butter
        - dairy: (Greek yogurt made from skim milk) (milk 3.25% with added Vitamin D) (three year aged cheddar cheese)
        - vegetables: (Mountain yam, hawaii, cooked, steamed, with salt) (Potatoes, mashed, home-prepared, whole milk and butter added)
        - meat: (Beef, ground, 70% lean meat / 30% fat, patty cooked, pan-broiled) (Beef, round, top round, separable lean and fat)
        - branded and prepared items: (Candies, MARS SNACKFOOD US, SKITTLES Wild Berry Bite Size Candies) Cheese puffs and twists, corn based, baked, low fat)

        For portion sizes:
        - If the user provides a WEIGHT (grams, pounds, oz, kg), keep it EXACTLY as provided
        - If the user provides a NATURAL PORTION (cup, tablespoon, teaspoon, pinch, slice, piece, etc), keep it as-is
        - If NO measurement is given, estimate using common natural portions (e.g., "1 cup", "2 tablespoons", "1 medium apple")
        - DO NOT convert to grams - that will be done in a separate step

        Examples:
        - "100g butter" → portion: "100g" (keep weight as-is)
        - "1 tablespoon butter" → portion: "1 tablespoon" (natural portion)
        - "butter" → portion: "1 tablespoon" (estimate natural portion)
        - "2 cups rice" → portion: "2 cups" (natural portion)
        - "1lb chicken" → portion: "1lb" (keep weight as-is)

        Respond with a JSON object that uses the key "ingredients" with the a value a JSON array, with one object for each ingredient.
        Use this structure for each ingredient:
        [
          {{
            "food_name": "string",
            "portion": "string (natural portion or weight as provided/estimated)",
            "timestamp": "YYYY-MM-DDTHH:MM:SS"
          }},
          ...
        ]

        For timestamps:
        - If a specific time is mentioned (e.g., "breakfast at 8am", "yesterday at 2pm"), include it
        - If a relative time is mentioned (e.g., "yesterday", "this morning"), convert it to an absolute timestamp
        - If no time is mentioned for a food, use the current time ({current_time.isoformat()})
        - Use the current time ({current_time.isoformat()}) as reference for relative times
        - Return timestamps in ISO format (YYYY-MM-DDTHH:MM:SS)"""

        # Call OpenAI to parse the meal
        client = _get_client()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{ "role": "system","content": prompt},
                      {"role": "user", "content": meal_description}
                ],
                response_format=response_format
            )

            # Extract the response content
        response_content = response.choices[0].message.content

        try:
            parsed_response = json.loads(response_content)["ingredients"]

            # Process food items in parallel
            async def process_food_item(item):
                food_entry = {
                    "food_name": item.get("food_name", "Unknown food"),
                    "portion": item.get("portion", "1 serving")
                }

                timestamp = item.get("timestamp")
                if timestamp:
                    try:
                        timestamp_dt = datetime.fromisoformat(timestamp)
                    except (ValueError, TypeError) as e:
                        print(f"Error parsing timestamp '{timestamp}': {e}")
                        # Use current time as fallback
                        timestamp_dt = current_time
                else:
                    timestamp_dt = current_time

                return (food_entry, timestamp_dt)

            # Process all food items in parallel
            results = await parallel_process(parsed_response, process_food_item)

            # Separate foods and timestamps
            foods = []
            timestamps = {}

            for food_entry, timestamp_dt in results:
                foods.append(food_entry)
                timestamps[food_entry["food_name"]] = timestamp_dt

            return foods, timestamps

        except json.JSONDecodeError as e:
                print(f"JSON decode error: {e}")
                raise ValueError(f"Failed to parse OpenAI response as JSON: {e}")
        except Exception as e:
            if "insufficient_quota" in str(e):
                raise ValueError("OpenAI API quota exceeded. Please try again later or contact support.")
            elif "invalid_api_key" in str(e):
                raise ValueError("Invalid OpenAI API key. Please check your configuration.")
            else:
                raise ValueError(f"Error parsing meal description: {str(e)}")
    except Exception as e:
        print(f"Error in parse_meal_description: {e}")
        # Return empty results as fallback
        return [], {}


async def estimate_grams(food_name: str, portion: str) -> float:
    """Convert a natural portion (cup, tablespoon, etc) to grams using GPT"""
    try:
        prompt = f"""You are a nutrition expert. Convert the given portion size to grams with high precision.

        Food: {food_name}
        Portion: {portion}

        Guidelines:
        - If the portion is already in grams (e.g., "100g", "50 grams"), return that number
        - If the portion is in other weight units (lb, oz, kg), convert to grams
        - For volumetric measurements (cups, tablespoons, teaspoons), use food-specific density
        - For natural portions (slice, piece, medium apple), estimate based on typical sizes
        - Refer to USDA standard portions when available
        - Be precise: seeds/powders are lighter than oils/syrups, dry ingredients lighter than wet

        Examples:
        - "1 tablespoon butter" → 14.2 grams
        - "1 cup cooked rice" → 195 grams
        - "100g chicken" → 100 grams
        - "1 medium apple" → 182 grams
        - "1 teaspoon salt" → 6 grams
        - "1 cup milk" → 244 grams

        Respond with ONLY a JSON object in this format:
        {{
          "amount_in_grams": <number>
        }}"""

        client = _get_client()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"Convert: {portion} of {food_name}"}
            ],
            response_format=response_format
        )

        response_content = response.choices[0].message.content
        result = json.loads(response_content)
        return float(result.get("amount_in_grams", 0))

    except Exception as e:
        print(f"Error in estimate_grams: {e}")
        # Return a default value as fallback
        return 100.0


if __name__ == "__main__":
    # Run the async function
    import asyncio
    print(asyncio.run(parse_meal_description("1 tablespoon butter")))
