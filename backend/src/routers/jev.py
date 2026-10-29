"""
Thin async client for TypeSafe's Jev (System One) model: typed, calibrated decisions
(choice / noul) in ~100ms, used for narrow judgment calls instead of an LLM.

Every helper returns None when Jev is disabled, unconfigured, or fails, so callers
fall back to their existing path.
"""
import os
from typing import Dict, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

JEV_API_URL = os.getenv("JEV_API_URL", "https://api.typesafe.ai/v1/systemone")
JEV_MODEL = os.getenv("JEV_MODEL", "jev-latest")
JEV_TIMEOUT_SECONDS = float(os.getenv("JEV_TIMEOUT_SECONDS", "3"))
# Below this confidence a choice is treated as "no answer" and the caller falls back.
# 0.8 from eval: the one wrong tie-break pick in 37 came back at 0.70.
JEV_MIN_CONFIDENCE = float(os.getenv("JEV_MIN_CONFIDENCE", "0.8"))

_http_client: Optional[httpx.AsyncClient] = None


def _api_key() -> Optional[str]:
    return os.getenv("JEV_KEY") or os.getenv("jev_key") or os.getenv("TYPESAFE_API_KEY")


def jev_enabled() -> bool:
    return bool(_api_key()) and os.getenv("USE_JEV", "true").lower() == "true"


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=JEV_TIMEOUT_SECONDS)
    return _http_client


async def ask_jev(state, questions: Dict[str, dict]) -> Optional[Dict[str, dict]]:
    """
    Send one System One request. `questions` maps your ids to question objects
    ({"type": "choice"|"noul"|"score", "instructions": ..., "criteria": ...}).
    Returns the `answers` dict keyed by those ids, or None on any failure.
    """
    if not jev_enabled() or not questions:
        return None
    try:
        response = await _get_http_client().post(
            JEV_API_URL,
            headers={"Authorization": f"Bearer {_api_key()}"},
            json={"model": JEV_MODEL, "state": state, "questions": questions},
        )
        response.raise_for_status()
        return response.json().get("answers") or None
    except Exception as e:
        print(f"    ⚠ Jev request failed: {e}")
        return None


def confident_choice(answer: Optional[dict]) -> Optional[str]:
    """The chosen label from a choice answer, or None if missing or below JEV_MIN_CONFIDENCE."""
    if not answer or answer.get("choice") is None:
        return None
    if float(answer.get("confidence") or 0) < JEV_MIN_CONFIDENCE:
        return None
    return answer["choice"]


def noul_value(answer: Optional[dict]) -> Optional[float]:
    """The 0-1 truth value from a noul answer, or None if missing."""
    if not answer or answer.get("noul") is None:
        return None
    return float(answer["noul"])
