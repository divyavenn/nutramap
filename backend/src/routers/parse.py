import os
from openai import OpenAI
from dotenv import load_dotenv
import json
# re is used in parse_new_food function for regex pattern matching
import re


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


def scale_portion_text(portion: str, multiplier: float) -> str:
    """Scale a portion text by a multiplier (e.g., "1/2 cup" * 0.5 = "1/4 cup")"""
    from fractions import Fraction
    import re

    try:
        # Handle simple cases
        if multiplier == 1.0:
            return portion

        # Parse the portion text to find numbers (including fractions)
        # Match patterns like: "1/2", "1", "2.5", etc. followed by a unit
        pattern = r'([\d./]+)\s*(.+)'
        match = re.match(pattern, portion.strip())

        if match:
            amount_str = match.group(1)
            unit = match.group(2)

            # Convert to fraction and multiply
            try:
                # Handle fractions like "1/2" or decimals like "2.5"
                if '/' in amount_str:
                    amount = float(Fraction(amount_str))
                else:
                    amount = float(amount_str)

                scaled_amount = amount * multiplier

                # Convert back to a nice fraction if possible
                fraction = Fraction(scaled_amount).limit_denominator(16)

                # Format nicely
                if fraction.denominator == 1:
                    return f"{fraction.numerator} {unit}"
                else:
                    # If there's a whole part, show it
                    if fraction.numerator > fraction.denominator:
                        whole = fraction.numerator // fraction.denominator
                        remainder = Fraction(fraction.numerator % fraction.denominator, fraction.denominator)
                        return f"{whole} {remainder} {unit}"
                    else:
                        return f"{fraction} {unit}"
            except:
                pass

        # Fallback: just show the weight in grams instead
        return portion

    except Exception as e:
        print(f"Error scaling portion text: {e}")
        return portion

