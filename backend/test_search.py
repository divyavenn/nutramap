"""
Diagnostic + assertion test for find_high_confidence_match.

Each test case is [original_description, ingredient_name, expected_food_name].
The test calls find_high_confidence_match(ingredient, db, user, original_query=description)
and asserts the returned name matches expected_food_name.

Usage (from backend/):
    python test_search.py          # runs all built-in test cases
"""

import asyncio
import sys
import os

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(__file__))

from src.routers.sparse import get_sparse_index
from src.routers.dense import find_dense_matches
from src.routers.match import rrf_fusion
from src.routers.recipes import calculate_name_similarity, find_high_confidence_match
from src.databases.mongo import get_data

# ── parameters that exactly mirror find_high_confidence_match ──────────────
SPARSE_THRESHOLD = 40
SPARSE_LIMIT     = 50
DENSE_THRESHOLD  = 40
DENSE_LIMIT      = 50
RRF_K            = 30
TOP_N            = 10

# [original_description, ingredient_name, expected_food_name]
DEFAULT_QUERIES = [
    ["one apple",                                     "apple",        "Apples, raw, without skin"],
    ["two pears with cheese",                         "pear",         "Pears, raw"],
    ["chicken soup",                                  "chicken",      "Chicken, stewing, light meat, meat only, cooked, stewed"],
    ["1/2 roasted chicken and pasta",                 "chicken",      "Chicken, broiler, rotisserie, BBQ, back meat only"],
    ["one cup milk and cookies",                      "milk",         ["Milk, nonfat, fluid, without added vitamin A and vitamin D (fat free or skim)", "Milk, whole, 3.25% milkfat, with added vitamin D"]],
    ["1 parfait made with greek yogurt raspberries",  "greek yogurt", ["Yogurt, Greek, plain, whole milk", "Yogurt, Greek, plain, lowfat"]],
    ["burrata",                                       "olive oil",    "Oil, olive, salad or cooking"],
    ["grilled cheese sandwich",                       "cheddar cheese", ["Cheese, american cheddar, imitation", "Cheese, cheddar, sharp, sliced"]],
    ["half cup brown rice and dal",                   "brown rice",   ["Rice, brown, medium-grain, cooked", "Rice, brown, long-grain, cooked (Includes foods for USDA's Food Distribution Program)"]],
    ["spinach soup one cup",                          "spinach",      ["Spaghetti, spinach, cooked", "Spinach, cooked, boiled, drained, with salt"]],
    ["10 almonds",                                    "almonds",      "Nuts, almonds"],
]


def get_food_name(food_id, db) -> str:
    try:
        doc = db.foods.find_one({"_id": int(food_id)})
    except (ValueError, TypeError):
        from bson import ObjectId
        doc = db.foods.find_one({"_id": ObjectId(str(food_id))})
    return doc["food_name"] if doc else "???"


def fmt_row(rank: int, food_id, name: str, score: float, sim: float) -> str:
    return f"  {rank:>2}. [{score:>6.2f}]  sim={sim:.2f}  {name}  (id={food_id})"


async def run_test(description: str, ingredient: str, expected: str, db, user: dict) -> bool:
    print(f"\n{'═' * 70}")
    print(f"  DESCRIPTION: '{description}'")
    print(f"  INGREDIENT:  '{ingredient}'")
    print(f"  EXPECTED:    '{expected}'")
    print(f"{'═' * 70}")

    # ── SPARSE ────────────────────────────────────────────────────────────
    sparse = await get_sparse_index(ingredient, db, user, SPARSE_THRESHOLD, SPARSE_LIMIT)
    top_sparse = sorted(sparse.items(), key=lambda x: x[1], reverse=True)[:TOP_N]

    print(f"\n  SPARSE (top {TOP_N})")
    for rank, (fid, score) in enumerate(top_sparse, 1):
        name = get_food_name(fid, db)
        sim  = calculate_name_similarity(ingredient, name)
        print(fmt_row(rank, fid, name, score, sim))

    # ── DENSE ─────────────────────────────────────────────────────────────
    dense = await find_dense_matches(ingredient, db, user, None, DENSE_THRESHOLD, DENSE_LIMIT)
    top_dense = sorted(dense.items(), key=lambda x: x[1], reverse=True)[:TOP_N]

    print(f"\n  DENSE (top {TOP_N})")
    for rank, (fid, score) in enumerate(top_dense, 1):
        name = get_food_name(fid, db)
        sim  = calculate_name_similarity(ingredient, name)
        print(fmt_row(rank, fid, name, score, sim))

    # ── RRF intermediate ──────────────────────────────────────────────────
    rrf_ids = await rrf_fusion(
        get_sparse_index, [ingredient, db, user, SPARSE_THRESHOLD, SPARSE_LIMIT],
        find_dense_matches, [ingredient, db, user, None, DENSE_THRESHOLD, DENSE_LIMIT],
        k=RRF_K,
        n=TOP_N,
    )

    print(f"\n  RRF (top {TOP_N})  →  name similarity scores")
    for rank, fid in enumerate(rrf_ids, 1):
        name = get_food_name(fid, db)
        sim  = calculate_name_similarity(ingredient, name)
        print(fmt_row(rank, fid, name, 0.0, sim))

    # ── PRODUCTION RESULT + ASSERTION ─────────────────────────────────────
    print(f"\n  PRODUCTION RESULT (find_high_confidence_match)")
    result = await find_high_confidence_match(ingredient, db, user, original_query=description)

    if result:
        got = result["name"]
        print(f"  → '{got}'  (id={result['id']}, confidence={result['confidence']:.2f})")
    else:
        got = None
        print("  → None (no match found)")

    accepted = expected if isinstance(expected, list) else [expected]
    passed = got in accepted
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n  {status}")
    if not passed:
        print(f"    expected: {accepted}")
        print(f"    got:      '{got}'")

    return passed, got


async def main():
    db   = get_data()
    user = {"_id": "system"}

    results = []
    for description, ingredient, expected in DEFAULT_QUERIES:
        passed, got = await run_test(description, ingredient, expected, db, user)
        results.append((description, ingredient, expected, got, passed))

    # ── SUMMARY ───────────────────────────────────────────────────────────
    print(f"\n{'═' * 70}")
    print(f"  SUMMARY")
    print(f"{'═' * 70}")
    passed_count = sum(1 for *_, p in results if p)
    for description, ingredient, expected, got, passed in results:
        icon = "✅" if passed else "❌"
        accepted = expected if isinstance(expected, list) else [expected]
        print(f"  {icon}  [{ingredient}] in '{description}'")
        print(f"       expected: {accepted}")
        if not passed:
            print(f"       got:      '{got}'")
    print(f"\n  {passed_count}/{len(results)} passed")
    print(f"{'═' * 70}\n")

    if passed_count < len(results):
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
