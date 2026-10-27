import os
from openai import AsyncOpenAI
from fastapi import HTTPException
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
        # Async client: the sync one blocks the event loop (and every other request) per call
        _client = AsyncOpenAI(api_key=api_key)
    return _client

# Fast, cheap model for narrow judgment calls (gram estimates, picking one of N matches)
FAST_LLM_MODEL = os.getenv("FAST_LLM_MODEL", "gpt-4.1-nano")

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
        response = await client.chat.completions.create(
            model=FAST_LLM_MODEL,
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
        # Don't silently store a made-up 100g weight
        raise HTTPException(status_code=502, detail=f"Could not estimate grams for '{portion} {food_name}'")


_UNICODE_FRACTIONS = {
    "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4",
    "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
}

# A single quantity: mixed number ("1 1/2"), fraction ("1/2"), or decimal ("2", "2.5", ".5")
_QTY = r"(?:\d+\s+\d+/\d+|\d+/\d+|\d*\.\d+|\d+)"
_QTY_RE = re.compile(rf"^\s*({_QTY})(?:\s*(?:-|–|to)\s*({_QTY}))?(\s*)(.*)$", re.IGNORECASE)
_WORD_QTY_RE = re.compile(r"^\s*(half(?:\s+an?)?|an?|one)\s+(.*)$", re.IGNORECASE)


def _parse_quantity(text: str) -> float:
    from fractions import Fraction
    parts = text.split()
    return float(sum(Fraction(part) for part in parts))


def _format_quantity(value: float) -> str:
    """Format a quantity using cooking-friendly fractions when they're close, else decimals."""
    from fractions import Fraction

    if value <= 0:
        return "0"
    whole = int(value)
    remainder = value - whole
    for denominator in (2, 3, 4, 8):
        numerator = round(remainder * denominator)
        if abs(remainder - numerator / denominator) <= min(0.02 * max(value, 0.05), 0.04):
            frac = Fraction(numerator, denominator)
            if frac == 1:
                return str(whole + 1)
            if frac == 0:
                if whole == 0:
                    break  # too small to show as a fraction
                return str(whole)
            return f"{whole} {frac}" if whole else str(frac)
    if value >= 10:
        return str(round(value))
    return f"{value:.2g}" if value < 1 else f"{value:.2f}".rstrip("0").rstrip(".")


def scale_portion_text(portion: str, multiplier: float) -> str:
    """Scale a portion text by a multiplier (e.g., "1/2 cup" * 0.5 = "1/4 cup", "1 1/2 cups" * 2 = "3 cups")"""
    try:
        if not portion or multiplier == 1.0:
            return portion

        text = portion.strip()
        for symbol, replacement in _UNICODE_FRACTIONS.items():
            # "1½" -> "1 1/2", "½" -> "1/2"
            text = re.sub(rf"(\d){symbol}", rf"\1 {replacement}", text)
            text = text.replace(symbol, replacement)

        match = _QTY_RE.match(text)
        if match:
            low = _parse_quantity(match.group(1)) * multiplier
            separator, unit = match.group(3), match.group(4)
            quantity = _format_quantity(low)
            if match.group(2):
                quantity += f"-{_format_quantity(_parse_quantity(match.group(2)) * multiplier)}"
            return f"{quantity}{separator}{unit}".strip()

        word_match = _WORD_QTY_RE.match(text)
        if word_match:
            base = 0.5 if word_match.group(1).lower().startswith("half") else 1.0
            return f"{_format_quantity(base * multiplier)} {word_match.group(2)}".strip()

        # No leading quantity (e.g. "pinch of salt"): make the multiplier explicit
        return f"{_format_quantity(multiplier)} × {text}"

    except Exception as e:
        print(f"Error scaling portion text: {e}")
        return portion
