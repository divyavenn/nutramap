import asyncio
import json
import sys
from pathlib import Path

import httpx

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.routers import jev  # noqa: E402
from src.routers import recipes  # noqa: E402

CANDIDATES = [
    {"food_id": 1, "food_name": "Carrots, raw"},
    {"food_id": 2, "food_name": "Carrots, cooked, boiled"},
]


def _use_transport(monkeypatch, handler):
    monkeypatch.setenv("JEV_KEY", "test-key")
    monkeypatch.setenv("USE_JEV", "true")
    monkeypatch.setattr(jev, "_http_client", httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def test_jev_breaks_tie_and_judges_base(monkeypatch):
    seen = {}

    def handler(request):
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"answers": {
            "best_match": {"type": "choice", "choice": "option_2", "confidence": 0.92,
                           "probabilities": {"option_1": 0.04, "option_2": 0.96}},
            "is_base": {"type": "noul", "noul": 0.95},
        }})

    _use_transport(monkeypatch, handler)
    chosen, is_base, answered = asyncio.run(recipes._jev_judge_match("carrot", CANDIDATES, "carrot soup"))

    assert chosen == CANDIDATES[1]
    assert is_base is True
    assert answered is True
    assert seen["auth"] == "Bearer test-key"
    assert seen["body"]["state"] == {"ingredient": "carrot", "meal_description": "carrot soup"}
    assert seen["body"]["questions"]["best_match"]["criteria"] == {
        "option_1": "Carrots, raw", "option_2": "Carrots, cooked, boiled",
    }


UNSURE_FIRST_ROUND = {
    "best_match": {"type": "choice", "choice": "option_1", "confidence": 0.2},
    "is_base": {"type": "noul", "noul": 0.5},
}


def test_unsure_answers_trigger_one_followup(monkeypatch):
    requests = []

    def handler(request):
        questions = json.loads(request.content)["questions"]
        requests.append(questions)
        if len(requests) == 1:
            return httpx.Response(200, json={"answers": UNSURE_FIRST_ROUND})
        return httpx.Response(200, json={"answers": {
            "combined": {"type": "noul", "noul": 0.1},
            "match_1": {"type": "noul", "noul": 0.2},
            "match_2": {"type": "noul", "noul": 0.9},
        }})

    _use_transport(monkeypatch, handler)
    chosen, is_base, answered = asyncio.run(recipes._jev_judge_match("carrot", CANDIDATES, "carrot soup"))

    assert (chosen, is_base, answered) == (CANDIDATES[1], True, True)
    assert len(requests) == 2
    assert set(requests[1]) == {"combined", "match_1", "match_2"}
    assert requests[1]["match_2"]["instructions"]["database_entry"] == "Carrots, cooked, boiled"


def test_followup_still_unsure_reports_undecided(monkeypatch):
    def handler(request):
        questions = json.loads(request.content)["questions"]
        if "best_match" in questions:
            return httpx.Response(200, json={"answers": UNSURE_FIRST_ROUND})
        return httpx.Response(200, json={"answers": {
            "combined": {"type": "noul", "noul": 0.5},
            "match_1": {"type": "noul", "noul": 0.4},
            "match_2": {"type": "noul", "noul": 0.5},
        }})

    _use_transport(monkeypatch, handler)
    assert asyncio.run(recipes._jev_judge_match("carrot", CANDIDATES, "")) == (None, None, True)


def test_combined_followup_marks_dish(monkeypatch):
    def handler(request):
        questions = json.loads(request.content)["questions"]
        if "is_base" in questions:
            return httpx.Response(200, json={"answers": {"is_base": {"type": "noul", "noul": 0.44}}})
        return httpx.Response(200, json={"answers": {
            "combined": {"type": "noul", "noul": 0.9},
            "match_1": {"type": "noul", "noul": 0.3},
        }})

    _use_transport(monkeypatch, handler)
    oats = [{"food_id": 7, "food_name": "Cereals, oats, raw"}]
    assert asyncio.run(recipes._jev_judge_match("overnight oats", oats, "")) == (None, False, True)


def test_single_candidate_only_asks_base_question(monkeypatch):
    seen = {}

    def handler(request):
        seen["questions"] = json.loads(request.content)["questions"]
        return httpx.Response(200, json={"answers": {"is_base": {"type": "noul", "noul": 0.1}}})

    _use_transport(monkeypatch, handler)
    chosen, is_base, answered = asyncio.run(recipes._jev_judge_match("pizza", CANDIDATES[:1], ""))

    assert set(seen["questions"]) == {"is_base"}
    assert (chosen, is_base, answered) == (None, False, True)


def test_api_errors_fall_back(monkeypatch):
    _use_transport(monkeypatch, lambda request: httpx.Response(500, json={"error": "boom"}))
    assert asyncio.run(recipes._jev_judge_match("carrot", CANDIDATES, "")) == (None, None, False)


def test_disabled_without_key_makes_no_request(monkeypatch):
    for name in ("JEV_KEY", "jev_key", "TYPESAFE_API_KEY"):
        monkeypatch.delenv(name, raising=False)

    def handler(request):
        raise AssertionError("Jev should not be called without a key")

    monkeypatch.setattr(jev, "_http_client", httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert asyncio.run(recipes._jev_judge_match("carrot", CANDIDATES, "")) == (None, None, False)


def test_keyword_fallback_matches_whole_words():
    assert recipes._is_likely_base_ingredient("olive oil") is True
    assert recipes._is_likely_base_ingredient("boiled chicken curry") is False  # "oil" in "boiled"
    assert recipes._is_likely_base_ingredient("rolled oats") is True  # "roll" in "rolled"
    assert recipes._is_likely_base_ingredient("vegetable sandwich") is False
    assert recipes._is_likely_base_ingredient("chicken noodle soup") is False
