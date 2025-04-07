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

# Initialize OpenAI client
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY environment variable is not set")

client = OpenAI(api_key=api_key)

# Define the structured output response format
response_format = { "type": "json_object" }

async def parse_meal_description(meal_description: str) -> Tuple[List[Dict], Dict[str, datetime]]:
    try:
        current_time = datetime.now()
        
        prompt = f"""You are an expert chef who has spent his life working in kitchens of every cuisine imaginable. 
        
        You are also an expert nutritionist who helps develop recipes for restaurants and big companies. 
        
        You are working for a celebrity whose appearance is vital to their career. 
        
        Your job is to parse  their meal descriptions into the separate foods, quantities, and timestamps **as preciesly as possible**,
        to be used in conjunction with a massive database of foods to estimate their nutrient intake.
        
        
        They reguarly weigh themselves and get blood work to monitor their health and nutrient levels. If the results differ from your estimations, you get 
        fired and lose everything, including the love of the woman you cherish most in the world.
        
      
        The database has cooking ingredients in many versions, for example: boiled, fried, cooked, raw, drained, baked, steamed, low-fat, added Vitamin D, with or without seeds, with or without salt) as well as many common branded foods.
        Be as specific as possible in stating the version of the ingredient and how it would likely be prepared. The database is extensive, so err on the side of specificity.

        - legumes: (yellow lentils cooked) (black beans dried) (chickpeas)
        - grains: brown rice (cooked), steel cut oats (raw), bread (whole grain, fortified with Iron), (Wheat flour, white, all-purpose, enriched, bleached)
        - fats: coconut oil, olive oil, butter
        - dairy: (Greek yogurt made from skim milk) (milk 3.25% with added Vitamin D) (three year aged cheddar cheese)
        - vegetables: (Mountain yam, hawaii, cooked, steamed, with salt) (Potatoes, mashed, home-prepared, whole milk and butter added)
        - meat: (Beef, ground, 70% lean meat / 30% fat, patty cooked, pan-broiled) (Beef, round, top round, separable lean and fat)
        - branded and prepared items: (Candies, MARS SNACKFOOD US, SKITTLES Wild Berry Bite Size Candies) Cheese puffs and twists, corn based, baked, low fat)

        Always break down each meal into all its implied or explicit ingredients. If specific ingredients are listed, include them but assume that other ingredients were probably used.
        If a known dish name is used (e.g., “dal chawal”, “smoothie”, “spaghetti”), infer and list all common and typical ingredients, even if they are not mentioned in the user input. 
        Even you are told what the recipe was made with, assume other ingredients were probably used. You may look up or reason about common recipes to fill in missing components.

        For example, a "strawberry smoothie" generally has milk, strawberries, and sugar, even if the milk and sugar are not listed.
        
        Estimate the weight in grams of each ingredient by reasoning through density and food type. 
        
        If a volumetric measurement is given, use precise conversions based on density and standard conversions, not generic rules.
        
        If no measurement is given, estimate the amount using how much would usually be added in common recipes.
        Refer to USDA or standard kitchen measures where appropriate. Use accurate food-specific conversions instead. 

        For example, seeds and powders are lighter than oils or syrups. Any dry ingredients will be lighter than wet ingredients.

        Respond with a JSON object that uses the key "ingredients" with the a value a JSON array, with one object for each ingredient.
        Use this structure for each ingredient:
        [
          {{
            "food_name": "string",
            "amount_in_grams": float,
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
                "amount_in_grams": float(item.get("amount_in_grams", 0))
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


    
if __name__ == "__main__":
    # Run the async function
    import asyncio
    print(asyncio.run(parse_meal_description("1 tablespoon butter")))