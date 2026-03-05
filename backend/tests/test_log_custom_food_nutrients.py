import asyncio
import math
import sys
from pathlib import Path

from bson import ObjectId


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from src.routers import foods as foods_router  # noqa: E402
from src.routers import logs as logs_router  # noqa: E402


class _InsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class _FakeFoodsCollection:
    def __init__(self, docs):
        self.docs = docs
        self.find_one_queries = []

    def find(self, query, projection=None):
        ids = query.get("_id", {}).get("$in", [])
        out = []
        for food_id in ids:
            food = self.docs.get(food_id)
            if food is not None:
                out.append({"_id": food_id, "food_name": food.get("food_name")})
        return out

    def find_one(self, query, projection=None):
        self.find_one_queries.append(query)
        return self.docs.get(query.get("_id"))


class _FakeLogsCollection:
    def __init__(self, log_doc=None):
        self.inserted = []
        self.log_doc = log_doc

    def insert_one(self, doc):
        self.inserted.append(doc)
        return _InsertResult(doc.get("_id", ObjectId()))

    def find_one(self, query):
        if self.log_doc and self.log_doc.get("_id") == query.get("_id"):
            return self.log_doc
        return None


class _FakeDB:
    def __init__(self, foods_docs, log_doc=None):
        self.foods = _FakeFoodsCollection(foods_docs)
        self.logs = _FakeLogsCollection(log_doc=log_doc)


def test_add_log_normalizes_custom_component_food_id():
    user_id = ObjectId()
    custom_food_id = ObjectId()
    db = _FakeDB({custom_food_id: {"_id": custom_food_id, "food_name": "collagen powder"}})

    log_dict = {
        "recipe_id": None,
        "meal_name": "collagen powder",
        "servings": 1.0,
        "date": "2026-03-05T00:00:00",
        "components": [
            {
                "food_id": str(custom_food_id),
                "amount": "20 g",
                "weight_in_grams": 20.0,
            }
        ],
        "user_id": user_id,
        "_id": ObjectId(),
    }

    asyncio.run(logs_router.add_log(user={"_id": user_id}, log=log_dict, db=db))

    assert len(db.logs.inserted) == 1
    inserted_component = db.logs.inserted[0]["components"][0]
    assert inserted_component["food_name"] == "collagen powder"
    assert isinstance(inserted_component["food_id"], ObjectId)
    assert inserted_component["food_id"] == custom_food_id


def test_get_nutrient_panel_resolves_string_objectid_and_legacy_amount_field():
    log_id = ObjectId()
    food_id = ObjectId()

    db = _FakeDB(
        foods_docs={
            food_id: {
                "_id": food_id,
                "nutrients": [
                    {"nutrient_id": 1003, "amount": 33},  # legacy key, per 100g
                ],
            }
        },
        log_doc={
            "_id": log_id,
            "components": [
                {"food_id": str(food_id), "weight_in_grams": 20},
            ],
        },
    )

    result = asyncio.run(foods_router.get_nutrient_panel(log_id=f"{str(log_id)}-0", db=db))

    assert 1003 in result
    assert math.isclose(result[1003], 6.6, rel_tol=1e-6)
    assert isinstance(db.foods.find_one_queries[0]["_id"], ObjectId)


def test_serialize_document_converts_nested_objectids():
    doc = {
        "_id": ObjectId(),
        "components": [
            {"food_id": ObjectId(), "amount": "1 cup", "weight_in_grams": 200},
        ],
    }

    serialized = logs_router.serialize_document(doc)

    assert isinstance(serialized["_id"], str)
    assert isinstance(serialized["components"][0]["food_id"], str)
