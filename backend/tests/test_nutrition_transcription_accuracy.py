import asyncio
import io
import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import UploadFile


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from src.routers import foods as foods_router  # noqa: E402
from src.routers import sparse_search_nutrients as sparse_router  # noqa: E402


class _FakeNutrientsCollection:
    def __init__(self, docs):
        self.docs = docs
        self.docs_by_id = {doc["_id"]: doc for doc in docs}
        self.name_queries = []
        self.id_queries = []

    def find_one(self, query):
        if "_id" in query:
            self.id_queries.append(query["_id"])
            return self.docs_by_id.get(query["_id"])

        nutrient_query = query.get("nutrient_name", {})
        regex = nutrient_query.get("$regex", "")
        self.name_queries.append(regex)
        expected_name = regex.strip("^$").lower()
        for doc in self.docs:
            if doc["nutrient_name"].lower() == expected_name:
                return doc
        return None


class _FakeDB:
    def __init__(self, nutrient_docs):
        self.nutrients = _FakeNutrientsCollection(nutrient_docs)


class _FakeChatCompletions:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if not self.responses:
            raise AssertionError("Unexpected extra OpenAI call in test")
        content = self.responses.pop(0)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )


class _FakeOpenAIClient:
    def __init__(self, responses):
        self.chat = SimpleNamespace(completions=_FakeChatCompletions(responses))


class _FakeOpenAIModule:
    def __init__(self, responses):
        self.client = _FakeOpenAIClient(responses)

    def OpenAI(self, api_key=None):
        return self.client


def _upload_file(filename: str = "label.jpg") -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(b"fake-image-bytes"))


async def _no_hybrid_search(name, db, threshold=0.5, limit=1):
    return {}


def test_process_images_collagen_label_returns_expected_per_100g_values(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(sparse_router, "search_nutrients_by_name", _no_hybrid_search)

    fake_openai = _FakeOpenAIModule(
        responses=[
            "yes",
            """```json
            {
              "serving_size": "10g",
              "nutrients": [
                {"name": "Calories", "amount": 400, "unit": "KCAL"},
                {"name": "Total lipid (fat)", "amount": 0, "unit": "G"},
                {"name": "Carbohydrate, by difference", "amount": 0, "unit": "G"},
                {"name": "Protein", "amount": 100, "unit": "G"},
                {"name": "Sodium, Na", "amount": 550, "unit": "MG"}
              ]
            }
            ```""",
        ]
    )
    monkeypatch.setitem(sys.modules, "openai", fake_openai)

    db = _FakeDB(
        nutrient_docs=[
            {"_id": 1008, "nutrient_name": "Calories"},
            {"_id": 1004, "nutrient_name": "Total lipid (fat)"},
            {"_id": 1005, "nutrient_name": "Carbohydrate, by difference"},
            {"_id": 1003, "nutrient_name": "Protein"},
            {"_id": 1093, "nutrient_name": "Sodium, Na"},
        ]
    )

    result = asyncio.run(
        foods_router.process_food_images(
            description="collagen powder",
            images=[_upload_file()],
            user={"_id": "test-user"},
            db=db,
        )
    )

    assert result["description"] == "collagen powder"
    assert len(result["nutrients"]) == 5

    by_name = {n["name"]: n for n in result["nutrients"]}
    assert by_name["Calories"]["amount"] == 400
    assert by_name["Calories"]["nutrient_id"] == 1008
    assert by_name["Total lipid (fat)"]["amount"] == 0
    assert by_name["Carbohydrate, by difference"]["amount"] == 0
    assert by_name["Protein"]["amount"] == 100
    assert by_name["Sodium, Na"]["amount"] == 550
    assert all(n["nutrient_id"] != -1 for n in result["nutrients"])


def test_process_images_maps_energy_name_to_calories(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(sparse_router, "search_nutrients_by_name", _no_hybrid_search)

    fake_openai = _FakeOpenAIModule(
        responses=[
            "yes",
            """{
              "serving_size": "10g",
              "nutrients": [
                {"name": "Energy", "amount": 400, "unit": "KCAL"},
                {"name": "Protein", "amount": 100, "unit": "G"}
              ]
            }""",
        ]
    )
    monkeypatch.setitem(sys.modules, "openai", fake_openai)

    db = _FakeDB(
        nutrient_docs=[
            {"_id": 1008, "nutrient_name": "Calories"},
            {"_id": 1003, "nutrient_name": "Protein"},
        ]
    )

    result = asyncio.run(
        foods_router.process_food_images(
            description="collagen powder",
            images=[_upload_file()],
            user={"_id": "test-user"},
            db=db,
        )
    )

    by_name = {n["name"]: n for n in result["nutrients"]}
    assert "Energy" not in by_name
    assert by_name["Calories"]["amount"] == 400
    assert by_name["Calories"]["nutrient_id"] == 1008
    assert by_name["Protein"]["amount"] == 100


def test_process_images_prompt_explicitly_instructs_energy_to_calories(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(sparse_router, "search_nutrients_by_name", _no_hybrid_search)

    fake_openai = _FakeOpenAIModule(
        responses=[
            "yes",
            """{
              "serving_size": "10g",
              "nutrients": [{"name": "Calories", "amount": 400, "unit": "KCAL"}]
            }""",
        ]
    )
    monkeypatch.setitem(sys.modules, "openai", fake_openai)

    db = _FakeDB(nutrient_docs=[{"_id": 1008, "nutrient_name": "Calories"}])

    asyncio.run(
        foods_router.process_food_images(
            description="collagen powder",
            images=[_upload_file()],
            user={"_id": "test-user"},
            db=db,
        )
    )

    extraction_prompt = fake_openai.client.chat.completions.calls[1]["messages"][0]["content"][0]["text"]
    assert 'If label says "Calories" or "Energy", return it as {"name":"Calories","unit":"KCAL"}' in extraction_prompt
    assert 'Never output nutrient name "Energy"' in extraction_prompt
