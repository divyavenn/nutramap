"""
Tests for GET /food/top endpoint (get_top_foods).

Uses fake DB collections following the same pattern as test_log_custom_food_nutrients.py.
The fake aggregate() returns pre-built pipeline-output documents so we test
result formatting, sorting, and response structure without needing a live MongoDB.
"""
import asyncio
import math
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from src.routers import foods as foods_router  # noqa: E402


# ---------------------------------------------------------------------------
# Fake DB helpers
# ---------------------------------------------------------------------------

class _FakeFoodsCollection:
    """Fake foods collection whose aggregate() returns a fixed result list."""

    def __init__(self, agg_results):
        # agg_results: list of dicts shaped like MongoDB pipeline output
        self._results = agg_results
        self.last_pipeline = None

    def aggregate(self, pipeline):
        self.last_pipeline = pipeline
        return iter(self._results)


class _FakeNutrientsCollection:
    def __init__(self, docs):
        # docs: list of {_id, nutrient_name, unit}
        self._by_id = {d["_id"]: d for d in docs}

    def find_one(self, query):
        return self._by_id.get(query.get("_id"))


class _FakeDB:
    def __init__(self, agg_results, nutrient_docs):
        self.foods = _FakeFoodsCollection(agg_results)
        self.nutrients = _FakeNutrientsCollection(nutrient_docs)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

NUTRIENT_DOCS = [
    {"_id": 1003, "nutrient_name": "Protein", "unit": "g"},
    {"_id": 1008, "nutrient_name": "Energy", "unit": "kcal"},
    {"_id": 1089, "nutrient_name": "Iron", "unit": "mg"},
    {"_id": 1258, "nutrient_name": "Fatty acids, total saturated", "unit": "g"},
    {"_id": 1292, "nutrient_name": "Fatty acids, total polyunsaturated", "unit": "g"},
]

# Pipeline output for absolute-content queries (no per_nutrient_id)
PROTEIN_ABS_RESULTS = [
    {"_id": 1001, "food_name": "Egg white, dried", "value": 82.0},
    {"_id": 1002, "food_name": "Gelatin, dry powder", "value": 76.0},
    {"_id": 1003, "food_name": "Chicken breast, cooked", "value": 32.0},
]

# Pipeline output for ratio queries (per_nutrient_id provided)
PROTEIN_PER_CALORIE_RESULTS = [
    {
        "_id": 1001,
        "food_name": "Egg white, dried",
        "value": 0.24,
        "nutrient_per_100g": 82.0,
        "per_nutrient_per_100g": 340.0,
    },
    {
        "_id": 1002,
        "food_name": "Chicken breast, cooked",
        "value": 0.19,
        "nutrient_per_100g": 32.0,
        "per_nutrient_per_100g": 165.0,
    },
]


# ---------------------------------------------------------------------------
# Tests: absolute content
# ---------------------------------------------------------------------------

def test_top_foods_absolute_returns_correct_structure():
    """Response includes nutrient metadata and a results list."""
    db = _FakeDB(PROTEIN_ABS_RESULTS, NUTRIENT_DOCS)
    result = asyncio.run(foods_router.get_top_foods(nutrient_id=1003, db=db))

    assert result["nutrient_id"] == 1003
    assert result["nutrient_name"] == "Protein"
    assert result["unit"] == "g"
    assert "metric" in result
    assert "per 100g" in result["metric"]
    assert len(result["results"]) == 3


def test_top_foods_absolute_result_fields():
    """Each result has food_id, food_name, and value."""
    db = _FakeDB(PROTEIN_ABS_RESULTS, NUTRIENT_DOCS)
    result = asyncio.run(foods_router.get_top_foods(nutrient_id=1003, db=db))

    first = result["results"][0]
    assert "food_id" in first
    assert "food_name" in first
    assert "value" in first
    assert first["food_name"] == "Egg white, dried"
    assert math.isclose(first["value"], 82.0)


def test_top_foods_absolute_sorted_descending():
    """Results must be in descending order by value."""
    db = _FakeDB(PROTEIN_ABS_RESULTS, NUTRIENT_DOCS)
    result = asyncio.run(foods_router.get_top_foods(nutrient_id=1003, db=db))

    values = [r["value"] for r in result["results"]]
    assert values == sorted(values, reverse=True)


def test_top_foods_absolute_no_per_nutrient_fields():
    """Ratio fields must NOT appear in absolute-content response."""
    db = _FakeDB(PROTEIN_ABS_RESULTS, NUTRIENT_DOCS)
    result = asyncio.run(foods_router.get_top_foods(nutrient_id=1003, db=db))

    assert "per_nutrient_id" not in result
    assert "per_nutrient_name" not in result
    for r in result["results"]:
        assert "nutrient_per_100g" not in r
        assert "per_nutrient_per_100g" not in r


def test_top_foods_absolute_respects_limit():
    """Pipeline receives a $limit stage matching the requested limit."""
    db = _FakeDB(PROTEIN_ABS_RESULTS[:1], NUTRIENT_DOCS)
    asyncio.run(foods_router.get_top_foods(nutrient_id=1003, limit=5, db=db))

    pipeline = db.foods.last_pipeline
    limit_stages = [s["$limit"] for s in pipeline if "$limit" in s]
    assert limit_stages == [5]


# ---------------------------------------------------------------------------
# Tests: ratio mode
# ---------------------------------------------------------------------------

def test_top_foods_ratio_returns_correct_structure():
    """Ratio response includes both nutrient metadata fields."""
    db = _FakeDB(PROTEIN_PER_CALORIE_RESULTS, NUTRIENT_DOCS)
    result = asyncio.run(
        foods_router.get_top_foods(nutrient_id=1003, per_nutrient_id=1008, db=db)
    )

    assert result["nutrient_id"] == 1003
    assert result["nutrient_name"] == "Protein"
    assert result["per_nutrient_id"] == 1008
    assert result["per_nutrient_name"] == "Energy"
    assert "metric" in result


def test_top_foods_ratio_result_fields():
    """Ratio results include nutrient_per_100g and per_nutrient_per_100g."""
    db = _FakeDB(PROTEIN_PER_CALORIE_RESULTS, NUTRIENT_DOCS)
    result = asyncio.run(
        foods_router.get_top_foods(nutrient_id=1003, per_nutrient_id=1008, db=db)
    )

    first = result["results"][0]
    assert "value" in first
    assert "nutrient_per_100g" in first
    assert "per_nutrient_per_100g" in first
    assert math.isclose(first["value"], 0.24)
    assert math.isclose(first["nutrient_per_100g"], 82.0)
    assert math.isclose(first["per_nutrient_per_100g"], 340.0)


def test_top_foods_ratio_sorted_descending():
    """Ratio results must be in descending order by value."""
    db = _FakeDB(PROTEIN_PER_CALORIE_RESULTS, NUTRIENT_DOCS)
    result = asyncio.run(
        foods_router.get_top_foods(nutrient_id=1003, per_nutrient_id=1008, db=db)
    )

    values = [r["value"] for r in result["results"]]
    assert values == sorted(values, reverse=True)


def test_top_foods_ratio_pipeline_has_divide_stage():
    """Ratio pipeline must include a $divide expression."""
    db = _FakeDB(PROTEIN_PER_CALORIE_RESULTS, NUTRIENT_DOCS)
    asyncio.run(
        foods_router.get_top_foods(nutrient_id=1003, per_nutrient_id=1008, db=db)
    )

    pipeline = db.foods.last_pipeline
    pipeline_str = str(pipeline)
    assert "$divide" in pipeline_str
    assert "1003" in pipeline_str
    assert "1008" in pipeline_str


def test_top_foods_ratio_pipeline_filters_zero_denominator():
    """Ratio pipeline must require denominator.amt > 0 to avoid division by zero."""
    db = _FakeDB(PROTEIN_PER_CALORIE_RESULTS, NUTRIENT_DOCS)
    asyncio.run(
        foods_router.get_top_foods(nutrient_id=1003, per_nutrient_id=1008, db=db)
    )

    pipeline = db.foods.last_pipeline
    # Find the $match stage that guards against zero denominator
    match_stages = [s["$match"] for s in pipeline if "$match" in s]
    pipeline_str = str(match_stages)
    assert "denominator" in pipeline_str
    assert "$gt" in pipeline_str


# ---------------------------------------------------------------------------
# Tests: edge cases
# ---------------------------------------------------------------------------

def test_top_foods_empty_results():
    """Empty aggregate result returns an empty list without error."""
    db = _FakeDB([], NUTRIENT_DOCS)
    result = asyncio.run(foods_router.get_top_foods(nutrient_id=1003, db=db))

    assert result["results"] == []
    assert result["nutrient_id"] == 1003


def test_top_foods_unknown_nutrient_id_uses_fallback_name():
    """If nutrient is not in the nutrients collection, a fallback label is used."""
    db = _FakeDB([], [])  # empty nutrients collection
    result = asyncio.run(foods_router.get_top_foods(nutrient_id=9999, db=db))

    assert "9999" in result["nutrient_name"]


def test_top_foods_pipeline_filters_to_foods_with_food_name():
    """The aggregation must filter to documents that have a food_name field."""
    db = _FakeDB(PROTEIN_ABS_RESULTS, NUTRIENT_DOCS)
    asyncio.run(foods_router.get_top_foods(nutrient_id=1003, db=db))

    pipeline = db.foods.last_pipeline
    pipeline_str = str(pipeline)
    assert "food_name" in pipeline_str


def test_top_foods_different_nutrient_iron():
    """Verify the endpoint works for a non-protein nutrient (iron)."""
    iron_results = [
        {"_id": 2001, "food_name": "Spices, thyme, dried", "value": 123.6},
        {"_id": 2002, "food_name": "Spices, cumin seed", "value": 66.4},
    ]
    db = _FakeDB(iron_results, NUTRIENT_DOCS)
    result = asyncio.run(foods_router.get_top_foods(nutrient_id=1089, db=db))

    assert result["nutrient_name"] == "Iron"
    assert result["unit"] == "mg"
    assert result["results"][0]["food_name"] == "Spices, thyme, dried"
    assert math.isclose(result["results"][0]["value"], 123.6)
