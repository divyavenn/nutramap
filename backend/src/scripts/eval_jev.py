"""
Evaluate Jev on the two judgment calls it makes during ingredient matching, using the
exact questions the app sends (recipes._jev_match_questions):

1. Tie-break: which of several equally-named database foods the user actually ate.
2. Base vs dish: is an ingredient a single food, or a dish to decompose?

Compares against the code-only baselines (first candidate, processing-word prefilter,
keyword heuristic), and reports latency and token usage.

Usage (from backend/):  python src/scripts/eval_jev.py [--out results.json]
Reads JEV_KEY from backend/.env.local or backend/.env.
"""
import argparse
import asyncio
import json
import statistics
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))
load_dotenv(BACKEND_ROOT / ".env.local")
load_dotenv(BACKEND_ROOT / ".env")

from src.routers import jev  # noqa: E402
from src.routers.recipes import (  # noqa: E402
    _is_likely_base_ingredient,
    _jev_match_questions,
    _jev_match_state,
    _prefilter_tied_candidates,
)

# (ingredient, meal description, candidate names, index of the correct candidate)
TIE_CASES = [
    ("carrot", "carrot ginger soup", ["Carrots, raw", "Carrots, cooked, boiled, drained", "Carrot juice, canned"], 1),
    ("carrots", "carrots and ranch dip", ["Carrots, raw", "Carrots, cooked, boiled, drained", "Carrot juice, canned"], 0),
    ("orange", "an orange after lunch", ["Orange juice, raw", "Oranges, raw, all commercial varieties", "Orange peel, raw"], 1),
    ("milk", "chai latte", ["Milk, whole, 3.25% milkfat", "Milk, dry, nonfat, regular", "Milk, human, mature, fluid"], 0),
    ("rice", "chicken curry with rice", ["Rice, white, long-grain, regular, enriched, cooked", "Rice, white, long-grain, regular, raw", "Rice flour, white"], 0),
    ("chicken breast", "grilled chicken salad", ["Chicken, broilers or fryers, breast, meat only, cooked, roasted", "Chicken, broilers or fryers, breast, meat only, raw", "Chicken, broilers or fryers, breast, meat and skin, cooked, fried, batter"], 0),
    ("egg", "two fried eggs", ["Egg, whole, raw, fresh", "Egg, whole, cooked, fried", "Egg, yolk, raw, fresh"], 1),
    ("egg", "hard boiled egg as a snack", ["Egg, whole, raw, fresh", "Egg, whole, cooked, hard-boiled", "Egg, whole, cooked, fried"], 1),
    ("potatoes", "mashed potatoes", ["Potatoes, flesh and skin, raw", "Potatoes, mashed, home-prepared, whole milk added", "Snacks, potato chips, plain, salted"], 1),
    ("potato", "baked potato with butter", ["Potatoes, baked, flesh and skin, without salt", "Potatoes, boiled, cooked in skin, flesh, without salt", "Potatoes, french fried, frozen, oven-heated"], 0),
    ("apple", "apple slices", ["Apples, raw, with skin", "Applesauce, canned, unsweetened", "Apple juice, canned or bottled, unsweetened"], 0),
    ("spinach", "sauteed spinach with garlic", ["Spinach, raw", "Spinach, cooked, boiled, drained, without salt", "Spinach, canned, regular pack, drained solids"], 1),
    ("tomato", "fresh caprese salad", ["Tomatoes, red, ripe, raw, year round average", "Tomatoes, red, ripe, canned, packed in tomato juice", "Tomato products, canned, sauce"], 0),
    ("tomato sauce", "spaghetti with tomato sauce", ["Tomatoes, red, ripe, raw, year round average", "Tomato products, canned, sauce", "Tomato juice, canned, with salt added"], 1),
    ("banana", "banana smoothie", ["Bananas, raw", "Bananas, dehydrated, or banana powder", "Banana chips"], 0),
    ("salmon", "baked salmon with lemon", ["Fish, salmon, Atlantic, farmed, cooked, dry heat", "Fish, salmon, Atlantic, farmed, raw", "Fish, salmon, chinook, smoked"], 0),
    ("coffee", "black coffee", ["Beverages, coffee, brewed from grounds, prepared with tap water", "Beverages, coffee, instant, regular, powder", "Alcoholic beverage, liqueur, coffee, 53 proof"], 0),
    ("peas", "frozen peas heated in the microwave", ["Peas, green, raw", "Peas, green, frozen, cooked, boiled, drained", "Peas, green, canned, regular pack, drained solids"], 1),
    ("corn", "corn on the cob at a bbq", ["Corn, sweet, yellow, cooked, boiled, drained", "Corn, sweet, yellow, canned, whole kernel, drained solids", "Cornmeal, whole-grain, yellow"], 0),
    ("beans", "black bean tacos", ["Beans, black, mature seeds, cooked, boiled, without salt", "Beans, black, mature seeds, raw", "Beans, snap, green, raw"], 0),
]

# (ingredient name, is a single base food?)
BASE_CASES = [
    ("milk", True), ("banana", True), ("cooked white rice", True), ("bagel", True),
    ("olive oil", True), ("boiled carrots", True), ("cheddar cheese", True), ("almonds", True),
    ("honey", True), ("black coffee", True), ("rolled oats", True), ("peanut butter", True),
    ("tofu", True), ("ground cumin", True), ("brandy", True), ("whole wheat bread", True),
    ("greek yogurt", True), ("avocado", True), ("salmon fillet", True), ("maple syrup", True),
    ("pizza", False), ("chicken curry", False), ("sandwich", False), ("sambar", False),
    ("lasagna", False), ("smoothie", False), ("pad thai", False), ("burrito", False),
    ("caesar salad", False), ("mac and cheese", False), ("chicken noodle soup", False),
    ("boiled chicken curry", False), ("fried rice", False), ("beef stew", False),
]


async def _query(client, state, questions):
    start = time.perf_counter()
    response = await client.post(
        jev.JEV_API_URL,
        headers={"Authorization": f"Bearer {jev._api_key()}"},
        json={"model": jev.JEV_MODEL, "state": state, "questions": questions},
    )
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.raise_for_status()
    return response.json(), elapsed_ms


async def main(out_path: str):
    if not jev._api_key():
        sys.exit("No JEV_KEY found in backend/.env.local or backend/.env")

    records = []
    async with httpx.AsyncClient(timeout=30) as client:
        # Sequential, so latencies reflect one request at a time like a single user
        for ingredient, meal, names, expected in TIE_CASES:
            candidates = [{"food_id": i, "food_name": n} for i, n in enumerate(names)]
            questions, labels = _jev_match_questions(ingredient, candidates)
            body, ms = await _query(client, _jev_match_state(ingredient, meal), questions)
            answer = body["answers"]["best_match"]
            picked = labels[answer["choice"]]["food_id"]
            prefiltered = _prefilter_tied_candidates(ingredient, candidates, meal)
            records.append({
                "kind": "tie", "ingredient": ingredient, "meal": meal, "expected": expected,
                "jev_pick": picked, "confidence": answer.get("confidence"),
                "probabilities": answer.get("probabilities"),
                "used_by_app": float(answer.get("confidence") or 0) >= jev.JEV_MIN_CONFIDENCE,
                "first_candidate_pick": 0,
                "prefilter_unique_pick": prefiltered[0]["food_id"] if len(prefiltered) == 1 else None,
                "latency_ms": ms, "usage": body.get("usage"), "model": body.get("model"),
            })

        for name, expected in BASE_CASES:
            questions, _ = _jev_match_questions(name, [{"food_id": 0, "food_name": name}])
            body, ms = await _query(client, _jev_match_state(name, ""), questions)
            noul = body["answers"]["is_base"]["noul"]
            records.append({
                "kind": "base", "ingredient": name, "expected": expected, "noul": noul,
                "keyword_pick": _is_likely_base_ingredient(name),
                "latency_ms": ms, "usage": body.get("usage"), "model": body.get("model"),
            })

    Path(out_path).write_text(json.dumps(records, indent=1))
    _report(records)
    print(f"\nRaw results written to {out_path}")


def _report(records):
    ties = [r for r in records if r["kind"] == "tie"]
    bases = [r for r in records if r["kind"] == "base"]

    print(f"Model: {records[0]['model']}\n")
    print("TIE-BREAK (which database food did the user eat?)")
    for r in ties:
        mark = "✓" if r["jev_pick"] == r["expected"] else "✗"
        print(f"  {mark} {r['ingredient']!r:18} in {r['meal']!r:40} conf={r['confidence']:.2f}")
    jev_correct = sum(r["jev_pick"] == r["expected"] for r in ties)
    used = [r for r in ties if r["used_by_app"]]
    used_correct = sum(r["jev_pick"] == r["expected"] for r in used)
    prefilter_decided = [r for r in ties if r["prefilter_unique_pick"] is not None]
    print(f"  Jev accuracy:                 {jev_correct}/{len(ties)}")
    print(f"  Above confidence threshold:   {len(used)}/{len(ties)} used by app, {used_correct} correct")
    print(f"  Baseline, first candidate:    {sum(r['expected'] == 0 for r in ties)}/{len(ties)}")
    print(f"  Prefilter alone decided:      {len(prefilter_decided)} cases, "
          f"{sum(r['prefilter_unique_pick'] == r['expected'] for r in prefilter_decided)} correct")

    print("\nBASE vs DISH (single food, or a dish to decompose?)")
    def jev_label(n):
        return True if n >= 0.7 else False if n <= 0.3 else None
    for r in bases:
        label = jev_label(r["noul"])
        mark = "?" if label is None else "✓" if label == r["expected"] else "✗"
        kw = "✓" if r["keyword_pick"] == r["expected"] else "✗"
        print(f"  {mark} {r['ingredient']!r:24} noul={r['noul']:.2f}  (keywords {kw})")
    decided = [r for r in bases if jev_label(r["noul"]) is not None]
    print(f"  Jev decided:                  {len(decided)}/{len(bases)}, "
          f"{sum(jev_label(r['noul']) == r['expected'] for r in decided)} correct")
    combined = sum(
        (jev_label(r["noul"]) if jev_label(r["noul"]) is not None else r["keyword_pick"]) == r["expected"]
        for r in bases
    )
    print(f"  App behaviour (Jev + keyword fallback): {combined}/{len(bases)}")
    print(f"  Keyword heuristic alone:      {sum(r['keyword_pick'] == r['expected'] for r in bases)}/{len(bases)}")

    latencies = sorted(r["latency_ms"] for r in records)
    p95 = latencies[int(0.95 * (len(latencies) - 1))]
    tokens = sum((r.get("usage") or {}).get("input_tokens", 0) for r in records)
    print(f"\nLATENCY  p50={statistics.median(latencies):.0f}ms  p95={p95:.0f}ms  max={latencies[-1]:.0f}ms")
    print(f"TOKENS   {tokens} input over {len(records)} requests "
          f"(~${tokens * 0.042 / 1e6:.6f} at the published $0.042/MTok)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="/tmp/jev_eval.json")
    asyncio.run(main(parser.parse_args().out))
