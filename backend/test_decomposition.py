#!/usr/bin/env python3
"""
Test script for the recipe decomposition pipeline.
Runs outside FastAPI so print statements are fully visible.

Usage:
    cd backend
    python test_decomposition.py
    python test_decomposition.py "one apple" "two slices pizza" "chicken curry with rice"
"""

import asyncio
import sys
import os
import logging

# Only show our own print output — suppress httpx, pymongo, openai debug noise
logging.basicConfig(level=logging.WARNING, stream=sys.stdout)
for noisy in ("httpx", "httpcore", "pymongo", "openai", "urllib3"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

# Make sure we can import from src/
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from src.databases.mongo import get_data
from src.routers.recipes import (
    identify_recipes_from_meal,
    classify_ingredient,
    find_high_confidence_match,
    calculate_name_similarity,
    _is_likely_base_ingredient,
    decompose_ingredient_to_base,
)
from src.routers.foods import get_user_custom_foods


# ─── Default test meals ─────────────────────────────────────────────────────

DEFAULT_MEALS = [
    "one apple",
    "two slices pizza",
    "chicken curry with rice",
    "a bowl of ramen",
    "scrambled eggs and toast",
    "banana smoothie",
]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def separator(label: str = ""):
    width = 70
    if label:
        pad = (width - len(label) - 2) // 2
        print("\n" + "─" * pad + f" {label} " + "─" * pad)
    else:
        print("\n" + "─" * width)


def get_test_user(db):
    """Get a real user from the database, or a minimal stub if none found."""
    user = db.users.find_one({})
    if user:
        print(f"Using user: {user.get('email', user['_id'])}")
        return user
    # Minimal stub — enough for the pipeline to run without crashing
    print("No users found in DB — using empty stub user")
    return {"_id": None, "email": "test@example.com"}


# ─── Individual tests ────────────────────────────────────────────────────────

def test_name_similarity():
    """Unit-test calculate_name_similarity with known tricky cases."""
    separator("calculate_name_similarity")

    cases = [
        # (name1, name2, expected_roughly)
        ("apple", "Apples, raw, with skin",           "high   (≥0.75)"),
        ("apple", "Babyfood, juice, apple",            "low    (≤0.35)"),
        ("pizza", "Pizza, frozen, cheese",             "should NOT be high"),
        ("milk",  "Milk, whole, 3.25% milkfat",        "high   (≥0.75)"),
        ("lentils","Lentils, mature seeds, cooked",    "high   (≥0.75)"),
        ("chicken","Chicken, broilers or fryers, meat","high   (≥0.70)"),
        ("tomato sauce", "Tomatoes, canned, sauce",    "medium (≥0.5)"),
    ]

    for n1, n2, note in cases:
        score = calculate_name_similarity(n1, n2)
        print(f"  '{n1}'  ↔  '{n2}'")
        print(f"    score={score:.3f}  ({note})\n")


def test_is_base_ingredient():
    separator("_is_likely_base_ingredient")

    cases = [
        ("apple", True),
        ("pizza", False),
        ("chicken curry", False),
        ("ramen", False),
        ("scrambled eggs", True),
        ("lentils", True),
        ("tomato paste", True),
        ("biryani", False),
        ("banana", True),
        ("frozen pizza", False),
    ]

    all_ok = True
    for name, expected in cases:
        result = _is_likely_base_ingredient(name)
        status = "✓" if result == expected else "✗ MISMATCH"
        if result != expected:
            all_ok = False
        print(f"  {status}  '{name}': is_base={result}  (expected {expected})")

    print()
    print("All assertions passed!" if all_ok else "Some assertions FAILED!")


async def test_find_match(ingredient: str, db, user):
    separator(f"find_high_confidence_match: '{ingredient}'")
    match = await find_high_confidence_match(ingredient, db, user)
    if match:
        print(f"  Matched: '{match['name']}' (confidence={match['confidence']:.2f}, "
              f"is_base={match.get('is_base')}, exact={match.get('exact_match', False)})")
    else:
        print(f"  No match found for '{ingredient}'")
    return match


async def test_classify(ingredient: str, amount: str, weight: float, db, user):
    separator(f"classify_ingredient: '{ingredient}'")
    result = await classify_ingredient(ingredient, amount, weight, db, user, user_recipes=[])
    print(f"  Type: {result['type']}")
    if result['type'] == 'food':
        d = result['data']
        print(f"  Food: '{d['food_name']}' (id={d['food_id']})")
    elif result['type'] == 'decompose':
        print(f"  Decomposed into {len(result['data'])} ingredients:")
        for ing in result['data']:
            print(f"    • {ing['food_name']} — {ing.get('amount','')} ({ing.get('weight_in_grams','')}g)")
    elif result['type'] == 'none':
        print("  Could not classify or decompose.")
    return result


async def test_full_pipeline(meal: str, db, user):
    separator(f"FULL PIPELINE: '{meal}'")
    custom_foods = await get_user_custom_foods(db, user)
    user_recipes = user.get("recipes", [])

    parsed = await identify_recipes_from_meal(meal, user_recipes, custom_foods)
    print(f"  GPT identified {len(parsed)} item(s):")
    for i, item in enumerate(parsed, 1):
        print(f"\n  [{i}] '{item['description']}' — {item.get('recipe_servings', 1)} serving(s)")
        if item.get("recipe_id"):
            print(f"      → Matched existing recipe (id={item['recipe_id']})")
        elif item.get("ingredients"):
            print(f"      → {len(item['ingredients'])} ingredient(s):")
            for ing in item["ingredients"]:
                print(f"         • {ing['food_name']} — {ing.get('amount','')} ({ing.get('weight_in_grams','')}g)")
        else:
            print("      → No ingredients returned")

    return parsed


# ─── Main ────────────────────────────────────────────────────────────────────

async def main():
    meals = sys.argv[1:] or DEFAULT_MEALS

    print("=" * 70)
    print("  NutraMap Recipe Decomposition Test")
    print("=" * 70)

    # Connect to DB
    db = get_data()
    user = get_test_user(db)

    # ── Unit tests (no network needed) ──────────────────────────────────────
    test_name_similarity()
    test_is_base_ingredient()

    # ── Match + classify spot-checks ────────────────────────────────────────
    spot_checks = [
        ("apple",  "1 apple", 182.0),
        ("pizza",  "2 slices", 280.0),
        ("ramen",  "1 bowl",   400.0),
    ]
    for name, amount, weight in spot_checks:
        await test_find_match(name, db, user)
        await test_classify(name, amount, weight, db, user)

    # ── Full pipeline for each meal ──────────────────────────────────────────
    for meal in meals:
        await test_full_pipeline(meal, db, user)

    separator()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
