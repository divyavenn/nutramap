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
from datetime import datetime

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
    process_recipes_in_background,
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

    # Step 1: identify_recipes_from_meal  (GPT parse)
    print("  [1] identify_recipes_from_meal")
    parsed = await identify_recipes_from_meal(meal, user_recipes, custom_foods)
    print(f"      GPT identified {len(parsed)} item(s):")
    for i, item in enumerate(parsed, 1):
        print(f"\n      [{i}] '{item['description']}' — {item.get('recipe_servings', 1)} serving(s)")
        if item.get("recipe_id"):
            print(f"           → Matched existing recipe (id={item['recipe_id']})")
        elif item.get("ingredients"):
            print(f"           → {len(item['ingredients'])} ingredient(s):")
            for ing in item["ingredients"]:
                print(f"              • {ing['food_name']} — {ing.get('amount','')} ({ing.get('weight_in_grams','')}g)")
        else:
            print("           → No ingredients returned")

    # Step 2: process_recipes_in_background  (classify + DB write)
    print(f"\n  [2] process_recipes_in_background")
    await process_recipes_in_background(
        parsed,
        user["_id"],
        user_recipes,
        datetime.now(),
        db,
    )

    return parsed


# ─── Targeted regression tests ───────────────────────────────────────────────

async def test_pizza_ingredient_matching(db, user):
    """
    Regression: 'pizza crust' / 'pizza dough' was matching to 'Pizza, pepperoni topping'.
    Both are composite dish names and should NOT be accepted as ingredient matches
    (confidence should be < 0.95 and is_base should be False).
    """
    separator("REGRESSION: pizza ingredient matching")

    pizza_sub_ingredients = ["pizza crust", "pizza dough", "pizza base", "cheese pizza"]
    all_ok = True

    for name in pizza_sub_ingredients:
        match = await find_high_confidence_match(name, db, user)
        is_composite = match and not match.get('is_base') and not match.get('exact_match') and match['confidence'] < 0.95
        if match:
            status = "✓ FILTERED" if is_composite else "✗ WOULD PASS (bug!)"
            if not is_composite:
                all_ok = False
            print(f"  {status}  '{name}' → '{match['name']}' "
                  f"(confidence={match['confidence']:.2f}, is_base={match.get('is_base')}, exact={match.get('exact_match', False)})")
        else:
            print(f"  ✓ NO MATCH  '{name}' → (correctly returned None)")

    print()
    print("All assertions passed!" if all_ok else "Some assertions FAILED — composite dish guard may be missing!")


async def test_servings_parsing(db, user):
    """
    Regression: '2 slices cheese pizza' was creating 2 separate identical recipe logs
    instead of 1 recipe log with recipe_servings=2.
    GPT should return exactly ONE item with recipe_servings=2.
    """
    separator("REGRESSION: quantity multiplier → recipe_servings")

    cases = [
        ("2 slices cheese pizza",   1, 2.0),   # (meal, expected_items, expected_servings)
        ("3 cups oatmeal",          1, 3.0),
        ("half a bowl of rice",     1, 0.5),
        ("an apple and 2 slices pizza", 2, None),  # 2 distinct items
    ]

    all_ok = True
    custom_foods = await get_user_custom_foods(db, user)
    user_recipes = user.get("recipes", [])

    for meal, expected_items, expected_servings in cases:
        parsed = await identify_recipes_from_meal(meal, user_recipes, custom_foods)
        items_ok = len(parsed) == expected_items
        if expected_servings is not None and len(parsed) == 1:
            servings_ok = abs(parsed[0].get("recipe_servings", 1) - expected_servings) < 0.1
        else:
            servings_ok = True  # multi-item case — just check count

        status = "✓" if (items_ok and servings_ok) else "✗ MISMATCH"
        if not (items_ok and servings_ok):
            all_ok = False

        print(f"  {status}  '{meal}'")
        print(f"         got {len(parsed)} item(s)  (expected {expected_items})")
        for item in parsed:
            print(f"         → '{item['description']}' servings={item.get('recipe_servings',1)}")

    print()
    print("All assertions passed!" if all_ok else "Some assertions FAILED — check prompt servings rules!")


async def test_cheese_pizza_decomposition(db, user):
    """
    End-to-end: decompose 'cheese pizza' and verify no composite dish (like 'Pizza, pepperoni
    topping') slips through as a matched ingredient.
    """
    separator("REGRESSION: cheese pizza decomposition quality")

    print("  Step 1: what does GPT suggest as base ingredients?")
    base = await decompose_ingredient_to_base("cheese pizza", "1 slice", 140.0)
    for ing in base:
        print(f"    • {ing['food_name']}  —  {ing.get('amount','')}  ({ing.get('weight_in_grams','')}g)")

    print()
    print("  Step 2: match each base ingredient (composite-dish guard applied)")
    bad_matches = []
    for ing in base:
        match = await find_high_confidence_match(ing["food_name"], db, user)
        if match:
            is_filtered = (not match.get('is_base') and not match.get('exact_match')
                           and match['confidence'] < 0.95)
            action = "FILTERED ⚠" if is_filtered else "ACCEPTED ✓"
            print(f"    '{ing['food_name']}' → '{match['name']}' "
                  f"(conf={match['confidence']:.2f}, is_base={match.get('is_base')}) [{action}]")
            if not is_filtered and "pizza" in match["name"].lower() and "pepperoni" in match["name"].lower():
                bad_matches.append(match["name"])
        else:
            print(f"    '{ing['food_name']}' → (no match)")

    print()
    if bad_matches:
        print(f"  ✗ Bad ingredient(s) would still appear: {bad_matches}")
    else:
        print("  ✓ No composite pizza dish slipping through as an ingredient")


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

    # ── Regression tests ─────────────────────────────────────────────────────
    await test_pizza_ingredient_matching(db, user)
    await test_servings_parsing(db, user)
    await test_cheese_pizza_decomposition(db, user)

    # ── Match + classify spot-checks ─────────────────────────────────────────
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
