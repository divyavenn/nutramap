import asyncio
import copy
import pickle
import sys
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import faiss
from bson import ObjectId


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from src.routers import foods as foods_router  # noqa: E402


class _InsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class _UpdateResult:
    def __init__(self, matched_count):
        self.matched_count = matched_count


def _project_doc(doc, projection):
    if projection is None:
        return copy.deepcopy(doc)
    projected = {}
    for key, include in projection.items():
        if include and key in doc:
            projected[key] = copy.deepcopy(doc[key])
    return projected


def _matches(doc, query):
    for key, value in query.items():
        if isinstance(value, dict):
            if "$lte" in value:
                if doc.get(key) is None or doc.get(key) > value["$lte"]:
                    return False
            else:
                return False
        else:
            if doc.get(key) != value:
                return False
    return True


def _apply_update(doc, update, is_insert=False):
    for key, value in update.get("$set", {}).items():
        doc[key] = value
    for key in update.get("$unset", {}).keys():
        doc.pop(key, None)
    if is_insert:
        for key, value in update.get("$setOnInsert", {}).items():
            if key not in doc:
                doc[key] = value


class _InMemoryCollection:
    def __init__(self):
        self.docs = []
        self.inserted_docs = self.docs

    def insert_one(self, doc):
        copied = copy.deepcopy(doc)
        if "_id" not in copied:
            copied["_id"] = ObjectId()
        self.docs.append(copied)
        return _InsertResult(copied["_id"])

    def find_one(self, query, projection=None):
        for doc in self.docs:
            if _matches(doc, query):
                return _project_doc(doc, projection)
        return None

    def find(self, query, projection=None):
        matched = [_project_doc(doc, projection) for doc in self.docs if _matches(doc, query)]
        return _InMemoryCursor(matched)

    def update_one(self, query, update, upsert=False):
        for doc in self.docs:
            if _matches(doc, query):
                _apply_update(doc, update, is_insert=False)
                return _UpdateResult(matched_count=1)

        if not upsert:
            return _UpdateResult(matched_count=0)

        new_doc = {}
        for key, value in query.items():
            if not isinstance(value, dict):
                new_doc[key] = value
        if "_id" not in new_doc:
            new_doc["_id"] = ObjectId()
        _apply_update(new_doc, update, is_insert=True)
        self.docs.append(new_doc)
        return _UpdateResult(matched_count=0)

    def find_one_and_update(self, query, update, sort=None, return_document=None):
        matches = [doc for doc in self.docs if _matches(doc, query)]
        if not matches:
            return None

        if sort:
            for sort_key, direction in reversed(sort):
                reverse = direction == -1
                matches.sort(key=lambda d: d.get(sort_key), reverse=reverse)

        doc = matches[0]
        _apply_update(doc, update, is_insert=False)
        return copy.deepcopy(doc)


class _FakeUsersCollection:
    def __init__(self):
        self.update_calls = []

    def update_one(self, query, update):
        self.update_calls.append((query, update))
        return _UpdateResult(matched_count=1)


class _FakeDB:
    def __init__(self):
        self.foods = _InMemoryCollection()
        self.users = _FakeUsersCollection()
        self.embedding_retry_jobs = _InMemoryCollection()
        self.embedding_failure_logs = _InMemoryCollection()

    def __getitem__(self, key):
        return getattr(self, key)


class _FakeDocuments:
    def __init__(self):
        self.created = []
        self.upserted = []

    def create(self, document):
        self.created.append(document)

    def upsert(self, document):
        self.upserted.append(document)


class _FakeCollection:
    def __init__(self):
        self.documents = _FakeDocuments()


class _FakeTypesenseCollections(dict):
    def __getitem__(self, key):
        if key not in self:
            self[key] = _FakeCollection()
        return dict.__getitem__(self, key)


class _FakeTypesenseClient:
    def __init__(self):
        self.collections = _FakeTypesenseCollections()


def _fake_request_with_state(faiss_index=None):
    return SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                faiss_index=faiss_index,
                id_list=[],
                id_name_map={},
            )
        )
    )


class _InMemoryCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, key, direction):
        reverse = direction == -1
        self.docs.sort(key=lambda d: d.get(key), reverse=reverse)
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def __iter__(self):
        return iter(self.docs)


def test_add_custom_food_generates_embedding_and_persists_it(monkeypatch, tmp_path):
    captured_embed_request = {}
    embedding_vector = [0.11, 0.22, 0.33]
    fake_typesense = _FakeTypesenseClient()

    class _FakeEmbeddingsAPI:
        def create(self, model, input):
            captured_embed_request["model"] = model
            captured_embed_request["input"] = input
            return SimpleNamespace(data=[SimpleNamespace(embedding=embedding_vector)])

    class _FakeOpenAI:
        def __init__(self, api_key=None):
            self.api_key = api_key
            self.embeddings = _FakeEmbeddingsAPI()

    cache_path = tmp_path / "food_ids.pkl"
    monkeypatch.setenv("FOOD_ID_CACHE", str(cache_path))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(foods_router, "OpenAI", _FakeOpenAI)

    import src.routers.sparse as sparse_router

    monkeypatch.setattr(sparse_router, "_get_client", lambda: fake_typesense)

    request = _fake_request_with_state(faiss_index=None)
    fake_db = _FakeDB()
    user_id = ObjectId()

    result = asyncio.run(
        foods_router.add_custom_food(
            request=request,
            name="My Custom Food",
            nutrients="[]",
            user={"_id": user_id},
            db=fake_db,
        )
    )

    assert result["status"] == "success"
    assert result["embedding_status"] == "ready"
    assert "food_id" in result

    assert captured_embed_request["model"] == "text-embedding-3-large"
    assert captured_embed_request["input"] == "my custom food"

    assert len(fake_db.foods.inserted_docs) == 1
    inserted = fake_db.foods.inserted_docs[0]
    assert inserted["food_name"] == "My Custom Food"
    assert inserted["embedding"] == embedding_vector

    docs_created = fake_typesense.collections["foods"].documents.created
    assert len(docs_created) == 1
    assert docs_created[0]["food_name"] == "My Custom Food"
    assert docs_created[0]["id"] == result["food_id"]

    assert cache_path.exists()
    with open(cache_path, "rb") as f:
        id_name_map = pickle.load(f)
    assert result["food_id"] in id_name_map
    assert id_name_map[result["food_id"]]["name"] == "My Custom Food"
    assert len(fake_db.embedding_retry_jobs.docs) == 0
    assert len(fake_db.embedding_failure_logs.docs) == 0


def test_add_custom_food_logs_failure_on_embedding_error(monkeypatch, tmp_path):
    fake_typesense = _FakeTypesenseClient()
    emailed = {"called": False}

    class _FailingEmbeddingsAPI:
        def create(self, model, input):
            raise RuntimeError("transient openai timeout")

    class _FailingOpenAI:
        def __init__(self, api_key=None):
            self.api_key = api_key
            self.embeddings = _FailingEmbeddingsAPI()

    cache_path = tmp_path / "food_ids.pkl"
    monkeypatch.setenv("FOOD_ID_CACHE", str(cache_path))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(foods_router, "OpenAI", _FailingOpenAI)
    monkeypatch.setattr(
        foods_router,
        "_send_embedding_failure_email",
        lambda **kwargs: emailed.__setitem__("called", True) or True,
    )

    import src.routers.sparse as sparse_router

    monkeypatch.setattr(sparse_router, "_get_client", lambda: fake_typesense)

    fake_db = _FakeDB()
    request = _fake_request_with_state(faiss_index=None)
    user_id = ObjectId()

    result = asyncio.run(
        foods_router.add_custom_food(
            request=request,
            name="Transient Failure Food",
            nutrients="[]",
            user={"_id": user_id},
            db=fake_db,
        )
    )

    assert result["status"] == "success"
    assert result["embedding_status"] == "pending"
    food_id = result["food_id"]

    inserted = fake_db.foods.find_one({"_id": ObjectId(food_id)})
    assert inserted is not None
    assert "embedding" not in inserted
    assert inserted["embedding_status"] == "pending"

    assert len(fake_db.embedding_retry_jobs.docs) == 0

    assert len(fake_db.embedding_failure_logs.docs) == 1
    failure = fake_db.embedding_failure_logs.docs[0]
    assert failure["food_id"] == food_id
    assert "transient openai timeout" in failure["error"]
    assert failure["source"] == "add_custom_food"
    assert emailed["called"] is True


def test_repair_custom_food_embeddings_backfills_missing(monkeypatch, tmp_path):
    fake_typesense = _FakeTypesenseClient()
    embedding_vector = [0.8, 0.1, 0.4]
    source_user = ObjectId()

    class _FakeEmbeddingsAPI:
        def create(self, model, input):
            return SimpleNamespace(data=[SimpleNamespace(embedding=embedding_vector)])

    class _FakeOpenAI:
        def __init__(self, api_key=None):
            self.api_key = api_key
            self.embeddings = _FakeEmbeddingsAPI()

    cache_path = tmp_path / "food_ids.pkl"
    monkeypatch.setenv("FOOD_ID_CACHE", str(cache_path))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(foods_router, "OpenAI", _FakeOpenAI)

    import src.routers.sparse as sparse_router
    import src.routers.match as match_router

    monkeypatch.setattr(sparse_router, "_get_client", lambda: fake_typesense)
    monkeypatch.setattr(match_router, "upsert_custom_food_in_autocomplete_cache", lambda user_id, food_id, name: None)

    fake_db = _FakeDB()
    missing_doc_id = ObjectId()
    fake_db.foods.insert_one(
        {
            "_id": missing_doc_id,
            "food_name": "Repair Me Food",
            "is_custom": True,
            "source": source_user,
            "created_at": datetime.utcnow(),
            "embedding_status": "pending",
        }
    )

    app = SimpleNamespace(state=SimpleNamespace(faiss_index=None, id_list=[], id_name_map={}))
    stats = asyncio.run(
        foods_router.repair_custom_food_embeddings(
            app=app,
            db=fake_db,
            limit=20,
            include_wrong_dim=True,
            dry_run=False,
        )
    )

    assert stats["records_with_empty_embedding"] == 1
    assert stats["records_with_malformed_embedding"] == 0
    assert stats["records_with_embedding_issues"] == 1
    assert stats["repaired"] == 1
    assert stats["failed_now"] == 0
    assert stats["unfixed_ids"] == []

    repaired_doc = fake_db.foods.find_one({"_id": missing_doc_id})
    assert repaired_doc["embedding"] == embedding_vector
    assert repaired_doc["embedding_status"] == "ready"

    with open(cache_path, "rb") as f:
        id_name_map = pickle.load(f)
    assert str(missing_doc_id) in id_name_map
    assert id_name_map[str(missing_doc_id)]["name"] == "Repair Me Food"


def test_repair_embeddings_returns_unfixed_ids_and_breakdown(monkeypatch, tmp_path):
    fake_typesense = _FakeTypesenseClient()
    embedding_vector = [0.9] * 3072
    source_user = ObjectId()

    class _FakeEmbeddingsAPI:
        def create(self, model, input):
            return SimpleNamespace(data=[SimpleNamespace(embedding=embedding_vector)])

    class _FakeOpenAI:
        def __init__(self, api_key=None):
            self.api_key = api_key
            self.embeddings = _FakeEmbeddingsAPI()

    cache_path = tmp_path / "food_ids.pkl"
    monkeypatch.setenv("FOOD_ID_CACHE", str(cache_path))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(foods_router, "OpenAI", _FakeOpenAI)

    import src.routers.sparse as sparse_router
    import src.routers.match as match_router

    monkeypatch.setattr(sparse_router, "_get_client", lambda: fake_typesense)
    monkeypatch.setattr(match_router, "upsert_custom_food_in_autocomplete_cache", lambda user_id, food_id, name: None)

    fake_db = _FakeDB()
    fixable_missing_id = ObjectId()
    invalid_name_id = ObjectId()
    malformed_dim_id = ObjectId()

    fake_db.foods.insert_one(
        {
            "_id": fixable_missing_id,
            "food_name": "Fixable Missing",
            "is_custom": True,
            "source": source_user,
            "created_at": datetime.utcnow(),
        }
    )
    fake_db.foods.insert_one(
        {
            "_id": invalid_name_id,
            "food_name": None,
            "is_custom": True,
            "source": source_user,
            "created_at": datetime.utcnow(),
        }
    )
    fake_db.foods.insert_one(
        {
            "_id": malformed_dim_id,
            "food_name": "Wrong Dim Food",
            "is_custom": True,
            "source": source_user,
            "created_at": datetime.utcnow(),
            "embedding": [0.1, 0.2],
        }
    )

    app = SimpleNamespace(state=SimpleNamespace(faiss_index=None, id_list=[], id_name_map={}))
    stats = asyncio.run(
        foods_router.repair_custom_food_embeddings(
            app=app,
            db=fake_db,
            limit=None,
            include_wrong_dim=True,
            dry_run=False,
        )
    )

    assert stats["records_with_empty_embedding"] == 2
    assert stats["records_with_malformed_embedding"] == 1
    assert stats["records_with_embedding_issues"] == 3
    assert stats["needs_repair"] == 3
    assert stats["attempted_repairs"] == 2
    assert stats["repaired"] == 2
    assert stats["failed_now"] == 0
    assert str(invalid_name_id) in stats["unfixed_ids"]
    assert str(fixable_missing_id) not in stats["unfixed_ids"]
    assert str(malformed_dim_id) not in stats["unfixed_ids"]
