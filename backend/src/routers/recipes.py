from fastapi import APIRouter, Depends, HTTPException, Form, BackgroundTasks
from pymongo.database import Database
from typing import List, Dict, Optional, Tuple, Union
from typing_extensions import Annotated
from bson import ObjectId
from datetime import datetime
import uuid
import numpy as np
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv
import json
import re
import asyncio

from src.databases.mongo import get_data
from src.databases.mongo_models import UserRecipe, RecipeIngredient
from src.routers.auth import get_current_user
from src.routers.parse import estimate_grams, FAST_LLM_MODEL
from src.routers.logs import add_log
from src.routers.match import rrf_fusion
from src.routers.foods import get_food_name, get_user_custom_foods

__package__ = "nutramap.routers"

# ── Embedding model singleton ──────────────────────────────────────────────────
# Loaded once per process (either at startup via load_embedding_model() or
# lazily on first use).  Never re-downloaded after the first run because
# sentence-transformers caches to HF_HOME (~/.cache/huggingface/hub).
_embedding_model = None

def load_embedding_model():
    """Load (or no-op if already loaded) the SentenceTransformer model.
    Call this from the FastAPI lifespan so it warms up before any request arrives.
    Safe to call from a thread — sentence-transformers is not async-native.
    """
    global _embedding_model
    if _embedding_model is not None:
        return
    use_gpu = os.getenv("USE_GPU_EMBEDDINGS", "true").lower() == "true"
    if not use_gpu:
        return
    try:
        from sentence_transformers import SentenceTransformer
        import torch
        print("Loading SentenceTransformer model (BAAI/bge-large-en-v1.5)...")
        model = SentenceTransformer("BAAI/bge-large-en-v1.5")
        if torch.cuda.is_available():
            model = model.to("cuda")
            print(f"✓ Embedding model on GPU: {torch.cuda.get_device_name(0)}")
        else:
            print("✓ Embedding model loaded on CPU")
        _embedding_model = model
    except Exception as e:
        print(f"⚠ Could not pre-load embedding model: {e}")


router = APIRouter(
    prefix='/recipes',
    tags=['recipes']
)

user = Annotated[dict, Depends(get_current_user)]
db = Annotated[Database, Depends(get_data)]

# Load environment variables
load_dotenv()

# Meal parsing and dish decomposition need good quantity estimates; keep them on a
# stronger model than the fast one used for narrow picks.
MEAL_PARSE_MODEL = os.getenv("MEAL_PARSE_MODEL", "gpt-4o-mini")

# Lazy OpenAI client initialization
_client = None

def _get_client():
    """Get OpenAI client, initializing if needed"""
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        # Async client: the sync one blocks the event loop (and every other request) per call
        _client = AsyncOpenAI(api_key=api_key)
    return _client

response_format = {"type": "json_object"}


def _to_float_or_none(value) -> Optional[float]:
    try:
        if value is None:
            return None
        parsed = float(value)
        if parsed <= 0:
            return None
        return parsed
    except (TypeError, ValueError):
        return None


def _normalize_serving_unit(label: Optional[str]) -> Optional[str]:
    if not label:
        return None
    cleaned = re.sub(r"^\s*\d+(\.\d+)?\s*", "", str(label)).strip().lower()
    return cleaned or None


def _weight_of(ingredient: dict) -> float:
    try:
        return float(ingredient.get("weight_in_grams", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


def _sum_ingredient_weight(ingredients: List[dict]) -> float:
    return sum(_weight_of(ing) for ing in ingredients)


def _recipe_scale_ratio(ingredients: List[dict], servings: float, serving_size_grams=None) -> float:
    """
    Multiplier to apply to a recipe's ingredient list to get `servings` servings.

    serving_size_grams is the weight of ONE serving. When it's unset, the ingredient
    list itself is one serving.
    """
    per_serving_grams = _to_float_or_none(serving_size_grams)
    base_total_weight = _sum_ingredient_weight(ingredients)
    if per_serving_grams and base_total_weight > 0:
        return servings * per_serving_grams / base_total_weight
    return servings


def _scale_ingredients(ingredients: List[dict], ratio: float) -> List[dict]:
    """Return copies of ingredients with amount text and grams multiplied by ratio."""
    from src.routers.parse import scale_portion_text

    scaled = []
    for ing in ingredients:
        base_amount = ing.get("amount", "") or ""
        scaled.append({
            **ing,
            "amount": scale_portion_text(base_amount, ratio) if base_amount else "",
            "weight_in_grams": _weight_of(ing) * ratio,
        })
    return scaled


def _ingredients_scale_for_servings(ingredients: List[dict], servings: float, logged_weight_grams) -> float:
    """
    The parser is asked for ingredients describing ONE serving, but sometimes returns
    ingredients for the whole amount eaten instead. Use its total-weight estimate to tell
    which it did. Returns the multiplier from the given ingredients to the amount eaten.
    """
    base_total_weight = _sum_ingredient_weight(ingredients)
    logged = _to_float_or_none(logged_weight_grams)
    if servings == 1.0 or not logged or base_total_weight <= 0:
        return servings
    ratio = logged / base_total_weight
    # Closer to 1x than to servings x → ingredients already cover everything eaten
    if abs(ratio - 1.0) < abs(ratio - servings):
        return 1.0
    return servings


def _normalize_food_id(food_id):
    """
    Canonicalize food IDs:
    - USDA foods -> int
    - custom foods -> ObjectId
    """
    if isinstance(food_id, (int, ObjectId)):
        return food_id
    if isinstance(food_id, str):
        stripped = food_id.strip()
        if stripped.isdigit():
            return int(stripped)
        if len(stripped) == 24 and ObjectId.is_valid(stripped):
            return ObjectId(stripped)
    return food_id


def _infer_recipe_servings_from_text(
    *,
    meal_description: str,
    item_description: str,
    parsed_servings: float,
    serving_unit: Optional[str],
) -> float:
    """
    Heuristic fallback for existing-recipe matches when the parser underestimates quantity.
    Example: "whole pizza" when serving unit is "slice".
    """
    text = (meal_description or "").lower()
    item = (item_description or "").lower().strip()
    unit = (serving_unit or "").strip().lower()
    servings = parsed_servings if parsed_servings > 0 else 1.0

    if not item or unit not in {"slice", "slices", "piece", "pieces"}:
        return servings

    # "whole" must modify this item ("a whole pizza", "whole veggie pizza"), not some
    # other word in the meal ("whole wheat toast", "whole milk").
    whole_item = re.search(
        r"\bwhole\s+(?!(?:wheat|grain|milk|foods?)\b)(?:\w+\s+){0,2}" + re.escape(item),
        text,
    )
    if whole_item:
        # Midpoint of common 8-12 slice range.
        return max(servings, 10.0 if unit.startswith("slice") else 8.0)

    return servings


async def generate_recipe_embedding(description: str) -> List[float]:
    """Generate embedding for recipe description using GPU if available"""
    use_gpu = os.getenv("USE_GPU_EMBEDDINGS", "true").lower() == "true"

    try:
        if use_gpu:
            # Use the module-level singleton; load lazily if startup didn't run.
            load_embedding_model()
            if _embedding_model is not None:
                embedding = _embedding_model.encode(
                    description.lower().strip(),
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                )
                return embedding.tolist()
        else:
            # Fall back to OpenAI API
            client = _get_client()
            response = await client.embeddings.create(
                model="text-embedding-3-small",
                input=description.lower().strip()
            )
            return response.data[0].embedding

    except Exception as e:
        print(f"Error generating embedding: {e}")
        # Fall back to OpenAI if GPU fails
        if use_gpu:
            print("GPU embedding failed, falling back to OpenAI API...")
            try:
                client = _get_client()
                response = await client.embeddings.create(
                    model="text-embedding-3-small",
                    input=description.lower().strip()
                )
                return response.data[0].embedding
            except Exception as e2:
                print(f"OpenAI fallback also failed: {e2}")
                raise HTTPException(status_code=500, detail=f"Failed to generate embedding: {str(e2)}")
        else:
            raise HTTPException(status_code=500, detail=f"Failed to generate embedding: {str(e)}")


def cosine_similarity(embedding1: List[float], embedding2: List[float]) -> float:
    """Calculate cosine similarity between two embeddings"""
    vec1 = np.array(embedding1)
    vec2 = np.array(embedding2)
    # Embeddings from different models (local vs OpenAI fallback) aren't comparable
    if vec1.shape != vec2.shape:
        return 0.0
    norm = np.linalg.norm(vec1) * np.linalg.norm(vec2)
    if norm == 0:
        return 0.0
    return float(np.dot(vec1, vec2) / norm)


async def find_similar_recipes(
    user_id: ObjectId,
    embedding: List[float],
    db: Database,
    threshold: float = 0.85
) -> List[dict]:
    """Find user's recipes with similarity above threshold"""
    user_doc = db.users.find_one({"_id": user_id})
    if not user_doc or "recipes" not in user_doc:
        return []

    matches = []
    for recipe in user_doc.get("recipes", []):
        if "embedding" in recipe:
            similarity = cosine_similarity(embedding, recipe["embedding"])
            if similarity >= threshold:
                matches.append({
                    "recipe_id": recipe["recipe_id"],
                    "description": recipe["description"],
                    "similarity_score": similarity,
                    "ingredients": recipe["ingredients"]
                })

    # Sort by similarity score descending
    matches.sort(key=lambda x: x["similarity_score"], reverse=True)
    return matches


def calculate_name_similarity(name1: str, name2: str) -> float:
    """
    Calculate similarity between two food names.
    Returns a score between 0 and 1.
    Handles USDA's verbose naming (e.g., "Lentils, mature seeds, cooked, boiled, without salt").
    """
    import re

    # Normalize: lowercase, strip, remove punctuation for comparison
    def normalize(s):
        return re.sub(r'[^\w\s]', '', s.lower().strip())

    # Simple stemming for common food plurals
    def stem_word(word):
        if word.endswith('ies'):
            return word[:-3] + 'y'  # berries -> berry
        if word.endswith('oes') and len(word) > 3:
            return word[:-2]  # tomatoes -> tomato, potatoes -> potato
        if word.endswith('s') and len(word) > 2 and not word.endswith('ss'):
            return word[:-1]  # apples -> apple, bagels -> bagel, oranges -> orange
        return word

    def stem_words(words):
        return {stem_word(w) for w in words}

    def stem_words_ordered(words):
        """Order-preserving stemming (list, not set) — needed for startswith checks."""
        return [stem_word(w) for w in words]

    n1 = normalize(name1)
    n2 = normalize(name2)

    # Exact match
    if n1 == n2:
        return 1.0

    # Get the PRIMARY food name (first part before comma in USDA names)
    # USDA format: "Primary food, qualifier1, qualifier2"
    def get_primary(original_name):
        parts = original_name.lower().split(',')
        return normalize(parts[0]) if parts else normalize(original_name)

    primary1 = get_primary(name1)
    primary2 = get_primary(name2)

    # Order-preserving stemmed strings for equality and startswith checks
    stemmed_n1 = ' '.join(stem_words_ordered(n1.split()))
    stemmed_primary2 = ' '.join(stem_words_ordered(primary2.split()))
    stemmed_n2 = ' '.join(stem_words_ordered(n2.split()))
    stemmed_primary1 = ' '.join(stem_words_ordered(primary1.split()))

    # Check if search term matches the PRIMARY food (with stemming)
    # "milk" matches "Milk, whole", "bagel" matches "Bagels, plain"
    if stemmed_n1 == stemmed_primary2 or stemmed_n2 == stemmed_primary1:
        return 0.85

    if stemmed_primary1 == stemmed_primary2:
        return 0.8

    # One starts with the other at the START (primary position)
    # Use order-preserving strings so "strudel apple" won't spuriously match "apple"
    if stemmed_n2.startswith(stemmed_n1 + ' ') or stemmed_n1.startswith(stemmed_n2 + ' '):
        return 0.75

    # Word overlap with stemming
    words1 = stem_words(n1.split())
    words2 = stem_words(n2.split())

    if not words1 or not words2:
        return 0.0

    # Check if all words from shorter name appear in longer name
    shorter, longer = (words1, words2) if len(words1) <= len(words2) else (words2, words1)
    if shorter.issubset(longer):
        # Penalize heavily when query words only appear in qualifier position (after comma),
        # not in the primary food name. E.g. "apple" in "babyfood, juice, apple" but
        # the primary is "babyfood" — a poor match.
        primary2_stemmed = stem_words(primary2.split())
        primary1_stemmed = stem_words(primary1.split())
        query_words = words1 if len(words1) <= len(words2) else words2
        primary_of_longer = primary2_stemmed if len(words1) <= len(words2) else primary1_stemmed
        if not query_words.intersection(primary_of_longer):
            return 0.3  # query only appears as a qualifier — very poor primary match
        return 0.7

    # Check overlap relative to the SHORTER name
    overlap = len(words1 & words2)
    coverage = overlap / len(shorter)

    # Also check traditional Jaccard
    jaccard = overlap / len(words1 | words2)

    return max(coverage * 0.6, jaccard)


# Processing that changes what a food is; only pick a candidate with one of these if the
# user actually said it. Deliberately excludes words USDA uses on ordinary entries
# ("Carrots, cooked, boiled, drained", "Tomato products, canned, sauce").
_PROCESSING_WORDS = (
    "juice", "puree", "pureed", "babyfood", "baby food", "dehydrated", "concentrate", "candied",
)


def _prefilter_tied_candidates(ingredient_name: str, candidates: List[dict], original_query: Optional[str]) -> List[dict]:
    """
    Cheap first pass before asking an LLM to break a tie: drop candidates processed in
    ways the user didn't mention (e.g. "orange" shouldn't become "Orange juice").
    Returns the survivors, or the original list if the filter would remove everything.
    """
    said = f"{ingredient_name} {original_query or ''}".lower()
    survivors = [
        c for c in candidates
        if not any(word in c["food_name"].lower() and word not in said for word in _PROCESSING_WORDS)
    ]
    return survivors or candidates


async def llm_disambiguate_food(
    ingredient_name: str,
    candidates: List[dict],  # [{"food_id": ..., "food_name": ...}, ...]
    original_query: Optional[str] = None,
) -> Optional[dict]:
    """
    When multiple RRF candidates are tied on similarity score, use an LLM to pick
    the most likely match given the original ingredient name and optional full meal query.
    Returns the chosen {"food_id": ..., "food_name": ...} or None on failure.
    """
    try:
        client = _get_client()

        candidates_str = "\n".join(
            f"{i + 1}. food_id={c['food_id']}  name=\"{c['food_name']}\""
            for i, c in enumerate(candidates)
        )
        
        print(candidates_str)

        context_line = ""
        if original_query:
            context_line = f"User description of meal: \"{original_query}\"\n"

        response = await client.chat.completions.create(
            model=FAST_LLM_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        """Given an ingredient name, the user's description of their meal, and a list of USDA food database entries, 
                        return the food_id of the entry that most closely matches what the user actually ended up consuming.
                        For example, if the ingredient is carrot and the user describes a soup, it would be boiled carrots. 
                        if the user describes eating carrots and ranch, it would be raw carrots. 
                        Don't pick something that was processed in ways that was not mentioned (pureed, babyfood, juiced, drained, etc.)
                        For example, if the user says orange, don't pick orange juice.
                        If multiple entries are possible, pick the simplest, most commonly available option."
                        "Respond with JSON only."""
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Ingredient: \"{ingredient_name}\"\n"
                        f"{context_line}"
                        f"\nCandidates:\n{candidates_str}\n\n"
                        "Which food_id is the best match?\n"
                        "Respond with: {\"food_id\": <id>, \"reason\": \"<brief reason>\"}"
                    ),
                },
            ],
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        chosen_id = result.get("food_id")
        reason = result.get("reason", "")

        if chosen_id is None:
            print(f"    ⚠ LLM returned no food_id for '{ingredient_name}'")
            return None

        # Normalise type (LLM may return int or string)
        try:
            chosen_id = int(chosen_id)
        except (ValueError, TypeError):
            pass

        match = next(
            (c for c in candidates
             if c["food_id"] == chosen_id or str(c["food_id"]) == str(chosen_id)),
            None,
        )

        if match:
            print(f"    🤖 LLM picked '{match['food_name']}' (id={chosen_id}) — {reason}")
            return match

        print(f"    ⚠ LLM returned unknown food_id={chosen_id} for '{ingredient_name}'")
        return None

    except Exception as e:
        print(f"    ⚠ LLM disambiguation failed for '{ingredient_name}': {e}")
        return None


async def find_high_confidence_match(ingredient_name: str, db: Database, user: dict, original_query: Optional[str] = None) -> Optional[dict]:
    """
    Find a high-confidence match for an ingredient using RRF fusion.
    Returns {"id": food_id, "name": food_name, "confidence": score} if found, None otherwise.

    Pipeline:
    1. Exact-name check in sparse results (custom-food priority).
    2. RRF fusion → top 10 candidates.
    3. Re-rank by calculate_name_similarity.
    4. If multiple candidates share the top similarity score (tie), call
       llm_disambiguate_food to break the tie.
    """
    from src.routers.match import get_sparse_index, rrf_fusion
    from src.routers.dense import find_dense_matches

    # FIRST: Check sparse results for exact name match (custom foods priority)
    sparse_results = await get_sparse_index(ingredient_name, db, user, 40, 50)
    if sparse_results:
        for food_id, score in sparse_results.items():
            food_name = get_food_name(food_id, db, None)
            if food_name and food_name.lower().strip() == ingredient_name.lower().strip():
                return {
                    "id": food_id,
                    "name": food_name,
                    "confidence": 1.0,
                    "is_base": False,
                    "exact_match": True,
                }

    # Use RRF to get top-10 candidates
    matches = await rrf_fusion(
        get_sparse_index, [ingredient_name, db, user, 40, 50],
        find_dense_matches, [ingredient_name, db, user, None, 40, 50],
        k=30,
        n=10,
    )

    if not matches:
        print(f"    🔍 No RRF matches found for '{ingredient_name}'")
        return None

    # Score every candidate with the name-similarity heuristic
    scored: List[dict] = []
    for match_id in matches:
        try:
            match_id = int(match_id)
        except (ValueError, TypeError):
            pass
        matched_name = get_food_name(match_id, db, None)
        if not matched_name:
            continue
        scored.append({
            "food_id": match_id,
            "food_name": matched_name,
            "similarity": calculate_name_similarity(ingredient_name, matched_name),
        })

    if not scored:
        print(f"    🔍 Could not get food names for any RRF matches for '{ingredient_name}'")
        return None

    best_similarity = max(c["similarity"] for c in scored)

    # Find all candidates that share the best score
    top_candidates = [c for c in scored if c["similarity"] == best_similarity]

    if len(top_candidates) > 1:
        top_candidates = _prefilter_tied_candidates(ingredient_name, top_candidates, original_query)

    # Fast path: Jev breaks the tie and judges base-vs-dish (~100ms; a second call only if unsure)
    jev_choice, jev_is_base, jev_answered = await _jev_judge_match(ingredient_name, top_candidates, original_query)

    if len(top_candidates) > 1 and jev_choice:
        print(f"    ⚡ Jev picked '{jev_choice['food_name']}' from {len(top_candidates)} tied candidates")
        best_result = jev_choice
    elif len(top_candidates) > 1:
        # No clear winner from name similarity — ask the LLM to break the tie
        print(
            f"    🔍 {len(top_candidates)} tied candidates at sim={best_similarity:.2f} "
            f"for '{ingredient_name}', calling LLM to disambiguate..."
        )
        llm_choice = await llm_disambiguate_food(ingredient_name, top_candidates, original_query=original_query)
        best_result = llm_choice if llm_choice else top_candidates[0]
    else:
        best_result = top_candidates[0]

    if jev_is_base is not None:
        is_base = jev_is_base
    elif jev_answered:
        # Jev is still unsure after its follow-up. Breaking a single food down usually still
        # lands close; logging a dish as one food (overnight oats as plain oats) silently
        # drops ingredients. So take the cheaper mistake.
        is_base = False
    else:
        # Jev not configured or unreachable
        is_base = _is_likely_base_ingredient(ingredient_name)
    print(
        f"    🔍 Best match for '{ingredient_name}': '{best_result['food_name']}' "
        f"(similarity={best_similarity:.2f}, is_base={is_base})"
    )

    return {
        "id": best_result["food_id"],
        "name": best_result["food_name"],
        "confidence": best_similarity,
        "is_base": is_base,
    }


def _jev_match_questions(ingredient_name: str, candidates: List[dict]) -> Tuple[dict, dict]:
    """Jev questions for a matched ingredient, plus the option label -> candidate map."""
    questions = {
        "is_base": {
            "type": "noul",
            "instructions": (
                "Is the ingredient a single basic food that a nutrition database lists as-is, "
                "rather than a dish made by combining several ingredients?"
            ),
            "criteria": {
                "true": "One food, possibly prepared or cooked: milk, banana, cooked rice, bagel, olive oil, boiled carrots",
                "false": "A dish of several ingredients: pizza, chicken curry, sandwich, sambar, lasagna, smoothie",
            },
        },
    }
    labels = {f"option_{i + 1}": c for i, c in enumerate(candidates)}
    if len(candidates) > 1:
        questions["best_match"] = {
            "type": "choice",
            "instructions": (
                "Which database entry is what the user actually ate? Use the meal description for "
                "context (carrot in a soup is boiled; carrots with ranch are raw). Don't pick an entry "
                "processed in a way the user didn't mention (juiced, pureed, babyfood, canned, drained). "
                "If several fit, pick the simplest, most common option."
            ),
            "criteria": {label: c["food_name"] for label, c in labels.items()},
        }
    return questions, labels


def _jev_match_state(ingredient_name: str, original_query: Optional[str]) -> dict:
    return {"ingredient": ingredient_name, "meal_description": original_query or ""}


def _jev_followup_questions(candidates: List[dict]) -> Tuple[dict, dict]:
    """
    Second-round questions for when the first answer was unsure. Each brings different
    evidence rather than re-asking the same thing: a per-entry judgment of the actual
    database rows, and a narrower "is it several foods combined?" question.
    """
    questions = {
        "combined": {
            "type": "noul",
            "instructions": (
                "Does the ingredient refer to something made by combining two or more distinct foods "
                "(for example oats soaked in milk, or a sauce made from several ingredients), rather "
                "than one food that may be cooked or prepared?"
            ),
        },
    }
    labels = {}
    for i, c in enumerate(candidates):
        label = f"match_{i + 1}"
        labels[label] = c
        questions[label] = {
            "type": "noul",
            "instructions": {
                "question": (
                    "Is this database entry an accurate record of what the user ate for this ingredient, "
                    "given the meal description? Answer false if it is a different food, a different "
                    "preparation than described, or only part of what the ingredient contains."
                ),
                "database_entry": c["food_name"],
            },
        }
    return questions, labels


def _noul_verdict(probability: Optional[float]) -> Optional[bool]:
    """True/False when a noul is decisive, None when it's in the unsure band."""
    if probability is None:
        return None
    if probability >= 0.7:
        return True
    if probability <= 0.3:
        return False
    return None


async def _jev_judge_match(
    ingredient_name: str,
    candidates: List[dict],
    original_query: Optional[str],
) -> Tuple[Optional[dict], Optional[bool], bool]:
    """
    Progressive Jev judgment for a matched ingredient:
    1. One request: which tied candidate the user ate, and is it a single food or a dish.
    2. Only if either answer was unsure: one follow-up request with narrower questions.

    Returns (chosen candidate or None, is_base or None, jev_answered). None values mean
    Jev couldn't decide; jev_answered says whether Jev was reachable at all.
    """
    from src.routers.jev import ask_jev, confident_choice, noul_value

    state = _jev_match_state(ingredient_name, original_query)
    questions, labels = _jev_match_questions(ingredient_name, candidates)
    answers = await ask_jev(state, questions)
    if not answers:
        return None, None, False

    chosen = labels.get(confident_choice(answers.get("best_match")) or "")
    is_base = _noul_verdict(noul_value(answers.get("is_base")))

    needs_choice = len(candidates) > 1 and chosen is None
    if not needs_choice and is_base is not None:
        return chosen, is_base, True

    followup_questions, followup_labels = _jev_followup_questions(candidates)
    followup = await ask_jev(state, followup_questions)
    if not followup:
        return chosen, is_base, True

    match_scores = {
        label: noul_value(followup.get(label)) or 0.0 for label in followup_labels
    }
    ranked = sorted(match_scores.items(), key=lambda item: item[1], reverse=True)
    best_label, best_score = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else 0.0
    # This question is strict, so absolute scores run low; what's reliable is a clear lead.
    # (Eval: the top entry was right 34/34 times; genuinely ambiguous sets were within 0.15.)
    clear_winner = best_score >= 0.3 and best_score - runner_up >= 0.2

    if needs_choice and clear_winner:
        chosen = followup_labels[best_label]
        print(f"    ⚡ Jev follow-up picked '{chosen['food_name']}' (match={best_score:.2f}, lead={best_score - runner_up:.2f})")

    if is_base is None:
        if best_score >= 0.7:
            # A database entry fits what they ate as a whole (ketchup, soy sauce), so use it
            # as-is even though it's technically made of several ingredients
            is_base = True
        else:
            combined = _noul_verdict(noul_value(followup.get("combined")))
            if combined is not None:
                is_base = not combined
        if is_base is not None:
            print(f"    ⚡ Jev follow-up judged '{ingredient_name}' as {'a single food' if is_base else 'a dish'}")

    return chosen, is_base, True


def _is_likely_base_ingredient(name: str) -> bool:
    """Check if this is likely a base ingredient vs a composite dish."""
    name_lower = name.lower().strip()

    # ALWAYS base ingredients - check these FIRST (spices, powders, leaves, pastes)
    always_base_patterns = [
        'powder', 'paste', 'leaves', 'leaf', 'seeds', 'seed',
        'spice', 'seasoning', 'extract', 'oil', 'flour'
    ]
    # Whole words only: "oil" must not match "boiled", "and" must not match "brandy"
    def has_word(word):
        return re.search(rf"\b{re.escape(word)}(?:e?s)?\b", name_lower) is not None

    for pattern in always_base_patterns:
        if has_word(pattern):
            return True

    # Composite dish indicators
    dish_keywords = [
        # South Asian dishes (but NOT when followed by powder/paste/leaves)
        'sambar', 'chutney', 'curry', 'biryani', 'pulao', 'masala',
        'idli', 'dosa', 'uttapam', 'vada', 'upma', 'pongal', 'rasam',
        'korma', 'tikka', 'tandoori', 'pakora', 'bhaji', 'paratha', 'naan',
        'dal', 'daal', 'sabzi', 'raita', 'paneer',
        # Western dishes
        'gravy', 'soup', 'stew', 'casserole', 'salad',
        'sandwich', 'burger', 'pizza', 'wrap', 'roll', 'taco', 'burrito',
        'pasta', 'lasagna', 'risotto', 'gnocchi',
        # Asian dishes
        'stir fry', 'fried rice', 'noodles', 'ramen', 'pho', 'sushi', 'tempura',
        # General composite indicators
        'with', 'and', 'style', 'homemade', 'recipe'
    ]

    # Check if it's a composite dish
    for keyword in dish_keywords:
        if has_word(keyword):
            return False

    # Common base ingredients (single foods that exist in USDA)
    base_keywords = [
        # Proteins
        'chicken', 'beef', 'pork', 'fish', 'egg', 'shrimp', 'tofu', 'turkey', 'lamb',
        'salmon', 'tuna', 'bacon', 'sausage', 'ham',
        # Dairy
        'milk', 'butter', 'cheese', 'cream', 'yogurt', 'curd',
        # Grains & breads
        'rice', 'bread', 'bagel', 'tortilla', 'oat', 'barley', 'wheat', 'flour',
        'noodle', 'pasta', 'cereal', 'cracker', 'muffin', 'croissant',
        # Legumes
        'lentil', 'bean', 'pea', 'chickpea', 'legume',
        # Vegetables
        'tomato', 'onion', 'garlic', 'ginger', 'potato', 'carrot', 'celery',
        'spinach', 'lettuce', 'cucumber', 'broccoli', 'pepper', 'corn',
        'vegetable', 'sprout', 'cabbage', 'kale', 'mushroom', 'squash',
        # Fruits
        'apple', 'banana', 'orange', 'mango', 'berry', 'grape', 'fruit',
        'lemon', 'lime', 'avocado', 'peach', 'pear',
        # Nuts & seeds
        'coconut', 'almond', 'cashew', 'nuts', 'peanut', 'walnut',
        # Condiments & basics
        'sugar', 'salt', 'honey', 'syrup', 'vinegar', 'broth', 'stock', 'water', 'yeast',
        # Spices
        'tamarind', 'turmeric', 'cumin', 'coriander', 'mustard', 'chili', 'basil', 'cilantro',
        # Descriptors that indicate base foods
        'cooked', 'raw', 'dried', 'fresh', 'frozen', 'canned', 'whole', 'sliced',
        'ground', 'chopped', 'minced', 'steamed', 'grilled', 'baked', 'fried'
    ]

    # Check if it's a known base ingredient
    for keyword in base_keywords:
        if keyword in name_lower:
            return True

    # Default: NOT a base ingredient (safer to decompose if unsure)
    return False


async def decompose_ingredient_to_base(ingredient_name: str, amount: str, weight: float) -> List[dict]:
    """
    Use GPT to decompose a composite ingredient into base ingredients.
    Example: "sambar" -> [{"food_name": "toor dal", "amount": "1/4 cup", ...}, ...]
    """
    try:
        client = _get_client()

        prompt = f"""Decompose this food/dish into its base ingredients that would exist in a nutrition database (like USDA).

Food: {ingredient_name}
Amount: {amount}
Total weight: {weight}g

Return ONLY base ingredients that are:
- Single foods (not dishes or recipes)
- Common names found in nutrition databases
- Examples of base ingredients: rice, lentils, tomatoes, onions, oil, salt, chicken, 
eggs, milk, flour, sugar, butter


Do NOT return:
- Dish names (sambar, chutney, curry, biryani, pasta sauce)
- Brand names
- Vague terms

Respond with JSON:
{{
  "ingredients": [
    {{"food_name": "ingredient name", "amount": "portion", "weight_in_grams": number}},
    ...
  ]
}}

Example - "sambar" (1 cup, 200g):
{{
  "ingredients": [
    {{"food_name": "Lentils, pigeon peas, cooked", "amount": "1/3 cup", "weight_in_grams": 65}},
    {{"food_name": "Tomatoes, raw", "amount": "1/4 cup", "weight_in_grams": 40}},
    {{"food_name": "Onions, raw", "amount": "2 tbsp", "weight_in_grams": 20}},
    {{"food_name": "Tamarind", "amount": "1 tsp", "weight_in_grams": 5}},
    {{"food_name": "Vegetable oil", "amount": "1 tbsp", "weight_in_grams": 14}}
  ]
}}
"""

        response = await client.chat.completions.create(
            model=MEAL_PARSE_MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"Decompose: {ingredient_name} ({amount}, {weight}g)"}
            ],
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        return result.get("ingredients", [])

    except Exception as e:
        print(f"Error decomposing ingredient '{ingredient_name}': {e}")
        return []


def find_matching_recipe(ingredient_name: str, user_recipes: List[dict]) -> Optional[dict]:
    """
    Check if ingredient name matches an existing user recipe.
    Returns the recipe if found, None otherwise.
    """
    name_lower = ingredient_name.lower().strip()

    for recipe in user_recipes:
        recipe_name = recipe.get("description", "").lower().strip()
        # Exact match or close match
        if recipe_name == name_lower:
            return recipe
        # Check if one contains the other
        if name_lower in recipe_name or recipe_name in name_lower:
            # Only accept if substantial overlap
            if len(name_lower) >= 3 and len(recipe_name) >= 3:
                return recipe

    return None


async def classify_ingredient(
    ingredient_name: str,
    amount: str,
    weight: float,
    db: Database,
    user: dict,
    user_recipes: List[dict] = None,
    original_query: Optional[str] = None,
) -> dict:
    """
    Classify an ingredient as one of:
    - "recipe": matches an existing user recipe (log separately)
    - "food": matches a food in database (include as ingredient)
    - "decompose": no match found (create new recipe from decomposition)

    Returns:
    {
        "type": "recipe" | "food" | "decompose",
        "data": recipe_dict | food_dict | decomposed_ingredients_list
    }
    """
    print(f"  Classifying: '{ingredient_name}'")

    # 1. Check if it matches an existing recipe → log as that recipe
    if user_recipes:
        matching_recipe = find_matching_recipe(ingredient_name, user_recipes)
        if matching_recipe:
            print(f"  ✓ RECIPE match: '{matching_recipe['description']}'")
            return {
                "type": "recipe",
                "name": ingredient_name,
                "amount": amount,
                "weight": weight,
                "data": matching_recipe
            }

    # 2. Check for high-confidence food match → include as ingredient
    match = await find_high_confidence_match(ingredient_name, db, user, original_query=original_query)
    if match:
        # If this is a composite dish (pizza, curry, etc.), don't accept a database
        # match for a processed version (e.g. "frozen pizza") — decompose instead.
        if not match.get('is_base') and not match.get('exact_match') and match['confidence'] < 0.95:
            print(f"  ↷ Skipping '{match['name']}' (composite dish, confidence={match['confidence']:.2f}) — will decompose")
        else:
            conf_str = f"confidence: {match['confidence']:.2f}"
            if match.get('exact_match'):
                conf_str = "exact match"
            print(f"  ✓ FOOD match: '{match['name']}' ({conf_str})")
            return {
                "type": "food",
                "name": ingredient_name,
                "amount": amount,
                "weight": weight,
                "data": {
                    "food_id": match["id"],
                    "food_name": match["name"],
                    "amount": amount,
                    "weight_in_grams": _to_float_or_none(weight) or 0.0
                }
            }

    # 3. No match → decompose and create new recipe
    print(f"  ✗ No match for '{ingredient_name}', will decompose into new recipe")
    base_ingredients = await decompose_ingredient_to_base(ingredient_name, amount, weight)

    if not base_ingredients:
        print(f"  ⚠ Could not decompose '{ingredient_name}'")
        return {"type": "none", "name": ingredient_name, "data": None}

    # The decomposition's weights should add up to the dish's weight; the LLM's often don't
    decomposed_total = _sum_ingredient_weight(base_ingredients)
    target_weight = _to_float_or_none(weight)
    if target_weight and decomposed_total > 0 and abs(decomposed_total - target_weight) > 0.01 * target_weight:
        base_ingredients = _scale_ingredients(base_ingredients, target_weight / decomposed_total)

    # Recursively match each base ingredient (these should all become foods)
    matched_ingredients = []
    base_ingredients = [b for b in base_ingredients if b.get("food_name")]
    base_matches = await asyncio.gather(*[
        find_high_confidence_match(b["food_name"], db, user, original_query=original_query)
        for b in base_ingredients
    ], return_exceptions=True)
    for base_ing, base_match in zip(base_ingredients, base_matches):
        if isinstance(base_match, Exception):
            print(f"    ⚠ Matching failed for base ingredient '{base_ing['food_name']}': {base_match}")
            continue
        if base_match:
            # Skip composite dish matches with low confidence (same guard as in classify_ingredient).
            # Prevents e.g. "pizza crust" from matching "Pizza, pepperoni topping".
            if not base_match.get('is_base') and not base_match.get('exact_match') and base_match['confidence'] < 0.95:
                print(f"    ⚠ Skipping composite match '{base_match['name']}' for base ingredient '{base_ing['food_name']}' (confidence={base_match['confidence']:.2f})")
                continue
            matched_ingredients.append({
                "food_id": base_match["id"],
                "food_name": base_match["name"],
                "amount": base_ing.get("amount", ""),
                "weight_in_grams": _weight_of(base_ing)
            })
        else:
            print(f"    ⚠ Could not match base ingredient: '{base_ing['food_name']}'")

    print(f"  → Decomposed into {len(matched_ingredients)} ingredients for new recipe")
    return {
        "type": "decompose",
        "name": ingredient_name,
        "amount": amount,
        "weight": weight,
        "data": matched_ingredients
    }


async def match_ingredient_to_food_id(ingredient_name: str, db: Database, user: dict) -> Optional[Union[int, str]]:
    """
    Match ingredient name to food_id using hybrid vector search (sparse + dense + RRF).
    This is a simplified version that returns just the food_id for backwards compatibility.
    For new code, prefer using classify_ingredient() instead.
    """
    try:
        print(f"Matching ingredient: '{ingredient_name}'")
        from src.routers.match import get_sparse_index
        from src.routers.dense import find_dense_matches

        # Get sparse results first - check for exact matches
        sparse_results = await get_sparse_index(ingredient_name, db, user, 60, 50)
        print(f"  Sparse results: {list(sparse_results.keys())[:5] if sparse_results else []}")

        # PRIORITY: Check if sparse found an exact name match (case-insensitive)
        if sparse_results:
            for food_id, score in sparse_results.items():
                food_name = get_food_name(food_id, db, None)
                if food_name and food_name.lower().strip() == ingredient_name.lower().strip():
                    print(f"  ✓ EXACT MATCH found: '{food_name}' (ID: {food_id})")
                    return food_id

        # No exact match - use RRF fusion
        dense_results = await find_dense_matches(ingredient_name, db, user, None, 40, 50)
        print(f"  Dense results: {list(dense_results.keys())[:5] if dense_results else []}")

        matches = await rrf_fusion(
            get_sparse_index, [ingredient_name, db, user, 60, 50],
            find_dense_matches, [ingredient_name, db, user, None, 40, 50],
            k=30,
            n=1
        )

        if matches and len(matches) > 0:
            matched_food_id = matches[0]
            try:
                matched_food_id = int(matched_food_id)
            except (ValueError, TypeError):
                pass
            matched_food_name = get_food_name(matched_food_id, db, None)
            print(f"  ✓ Matched '{ingredient_name}' to: {matched_food_name} (ID: {matched_food_id})")
            return matched_food_id

        print(f"  ✗ No match found for '{ingredient_name}'")
        return None
    except Exception as e:
        print(f"Error matching ingredient '{ingredient_name}': {e}")
        import traceback
        traceback.print_exc()
        return None


async def parse_recipe_into_ingredients(recipe_description: str) -> List[dict]:
    """Use GPT-4 to break recipe into ingredients with portions"""
    try:
        client = _get_client()

        prompt = f"""Please break down this recipe into individual ingredients with portions.

Recipe: {recipe_description}

Guidelines:
- List ALL ingredients typically used in this recipe
- Use natural portions (cups, tablespoons, teaspoons, pinches, pieces)
- Be specific about ingredient preparation (cooked, raw, drained, chopped)
- Use realistic portions for a single serving of what the user describes. if the user says "2 slices" 
  estimate what would be needed for one slice
- only include what would be left in the food itself, not the preparation. for example, 
you may use 1 cup of oil when frying something but only 3 tablespoons would be in the final dish

Respond with a JSON object in this format:
{{
  "ingredients": [
    {{
      "food_name": "ingredient name with preparation details",
      "amount": "natural portion (e.g., 1 cup, 2 tablespoons)"
    }},
    ...
  ]
}}

Examples:
{{
  "ingredients": [
    {{
      "food_name": "yellow lentils, cooked",
      "amount": "1 cup"
    }},
    {{
      "food_name": "olive oil",
      "amount": "2 tablespoons"
    }},
    {{
      "food_name": "cumin seeds",
      "amount": "1 teaspoon"
    }},
    ...
  ]
}}

Thank you!
 
"""

        response = await client.chat.completions.create(
            model=MEAL_PARSE_MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": recipe_description}
            ],
            response_format=response_format
        )

        result = json.loads(response.choices[0].message.content)
        return result.get("ingredients", [])

    except Exception as e:
        print(f"Error parsing recipe: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse recipe: {str(e)}")


async def identify_recipes_from_meal(meal_description: str, user_recipes: List[dict], user_custom_foods: List[dict], submission_time: datetime = None) -> List[dict]:
    """Use GPT-4 to identify recipes in meal description and match to existing recipes"""
    current_time = submission_time or datetime.now()
    try:
        client = _get_client()

        # Prepare context with top 30 user recipes
        recipes_context = ""
        if user_recipes:
            recipes_context = "User's existing recipes:\n"
            for idx, recipe in enumerate(user_recipes[:30], 1):
                serving_label = recipe.get("serving_size_label")
                serving_grams = recipe.get("serving_size_grams") or round(
                    _sum_ingredient_weight(recipe.get("ingredients", []))
                ) or None
                serving_bits = []
                if serving_label:
                    serving_bits.append(f"label={serving_label}")
                if serving_grams:
                    serving_bits.append(f"grams={serving_grams}")
                serving_info = f", serving_info: ({', '.join(serving_bits)})" if serving_bits else ""
                recipes_context += (
                    f"{idx}. {recipe['description']} (ID: {recipe['recipe_id']}{serving_info})\n"
                )
                
        custom_foods_context = ""
        if user_custom_foods:
            custom_foods_context = "User's custom foods:\n"
            for idx, food in enumerate(user_custom_foods[:30], 1):
                custom_foods_context += f"{idx}. {food['food_name']}\n"

        prompt = f"""Parse this meal description into SEPARATE food items.

{recipes_context}
{custom_foods_context}

Meal description: {meal_description}

CRITICAL INSTRUCTIONS:
1. Split the meal into INDIVIDUAL food items - do NOT combine them into one recipe
2. Each distinct food (idli, sambar, chutney, rice, dal, etc.) should be its OWN separate entry
3. For EACH item, match the WHOLE ITEM NAME in this order:
   a) FIRST: Does the item name match an existing RECIPE? (e.g., "matcha latte" matches recipe "Matcha latte")
      → Use that recipe_id, leave ingredients EMPTY
   b) SECOND: Does the item name match a CUSTOM FOOD exactly? (e.g., "idli" matches custom food "Idli")
      → recipe_id=null, ONE ingredient with the exact custom food name
   c) THIRD: No match found?
      → recipe_id=null, decompose into base ingredients

IMPORTANT: Match the WHOLE item name, not its ingredients!
- "matcha latte" → matches RECIPE "Matcha latte" (use recipe_id, empty ingredients)
- "idli" → matches CUSTOM FOOD "Idli" (recipe_id=null, 1 ingredient)
- "chicken curry" → no match, decompose into base ingredients

PRIORITY when same name exists as both recipe AND custom food:
- Custom food takes priority (user explicitly created it)

IMPORTANT RULES:
- "idli sambar chutney" = THREE separate entries, NOT one combined recipe
- Recipe match = use recipe_id from list, ingredients array MUST be EMPTY []
- Custom food match = recipe_id: null, ONE ingredient with the exact custom food name
- No match = recipe_id: null, decomposed base ingredients — NEVER leave ingredients empty when recipe_id is null
- ingredients: [] is ONLY allowed when recipe_id is set (existing recipe matched)
- QUANTITY MULTIPLIERS set recipe_servings, they do NOT create duplicate entries:
  "2 slices cheese pizza" = ONE entry for "cheese pizza" with recipe_servings=2
  "3 cups oatmeal" = ONE entry for "oatmeal" with recipe_servings=3
  "half a bowl of rice" = ONE entry for "rice" with recipe_servings=0.5
- INGREDIENTS DESCRIBE EXACTLY ONE SERVING (one serving_size_label unit), NOT the total eaten.
  The total eaten is ingredients x recipe_servings.
  "2 slices cheese pizza" → recipe_servings=2, ingredients for ONE slice
- If the user gives a weight for an existing recipe ("200g of daal"), set
  recipe_servings = that weight / the recipe's serving grams.
- For EXISTING recipe matches, use that recipe's serving_info to infer realistic servings and grams:
  if serving unit is "slice" and user says "whole pizza", infer ~8-12 slices (use best estimate).

For timestamps:
- The user's current local time is: {current_time.isoformat()}
- If the user mentions a relative time (e.g. "yesterday", "last night", "this morning", "breakfast", "2 days ago"), calculate the timestamp from this reference time.
- If NO time context is mentioned, use the exact submission time above as the timestamp.
- Return timestamps in ISO format (YYYY-MM-DDTHH:MM:SS)

For EVERY parsed item, return serving semantics:
- "serving_unit": unit from user text (e.g. "slice", "bowl", "cup", "mug", "plate")
- "serving_size_label": normalized one-unit label (e.g. "1 slice", "1 bowl")
- "serving_size_grams": grams for ONE serving unit
- "logged_weight_grams": total grams consumed for this logged item (= serving_size_grams x recipe_servings)
If uncertain, estimate using typical values and ingredient context.

Respond with ONLY a JSON object:
{{
  "recipes": [
    {{
      "recipe_id": "existing-id or null",
      "timestamp": "YYYY-MM-DDTHH:MM:SS",
      "description": "food item name",
      "recipe_servings": number,
      "serving_unit": "unit string",
      "serving_size_label": "natural measurement or null",
      "serving_size_grams": number or null,
      "logged_weight_grams": number or null,
      "ingredients": [
        {{"food_name": "name", "amount": "portion", "weight_in_grams": number}}
      ]
    }}
  ]
}}

EXAMPLES:

Input: "eggs and toast for breakfast" (user has custom food "Sourdough bread")
Output:
{{
  "recipes": [
    {{
      "recipe_id": null,
      "timestamp": "2024-06-15T08:00:00",
      "description": "Eggs",
      "recipe_servings": 1,
      "ingredients": [
        {{"food_name": "Eggs, scrambled", "amount": "2 eggs", "weight_in_grams": 100}}
      ]
    }},
    {{
      "recipe_id": null,
      "timestamp": "2024-06-15T08:00:00",
      "description": "Sourdough bread",
      "recipe_servings": 1,
      "ingredients": [
        {{"food_name": "Sourdough bread", "amount": "2 slices", "weight_in_grams": 60}}
      ]
    }}
  ]
}}

Input: "chicken curry with rice" (user has NO custom foods for these)
Output:
{{
  "recipes": [
    {{
      "recipe_id": null,
      "timestamp": "2024-06-15T12:00:00",
      "description": "Chicken curry",
      "recipe_servings": 1,
      "ingredients": [
        {{"food_name": "Chicken, breast, cooked", "amount": "4 oz", "weight_in_grams": 113}},
        {{"food_name": "Onions, raw", "amount": "1/4 cup", "weight_in_grams": 40}},
        {{"food_name": "Tomatoes, raw", "amount": "1/4 cup", "weight_in_grams": 45}},
        {{"food_name": "Vegetable oil", "amount": "1 tbsp", "weight_in_grams": 14}},
        {{"food_name": "Coconut milk", "amount": "1/4 cup", "weight_in_grams": 60}}
      ]
    }},
    {{
      "recipe_id": null,
      "timestamp": "2024-06-15T12:00:00",
      "description": "Rice",
      "recipe_servings": 1,
      "ingredients": [
        {{"food_name": "Rice, white, cooked", "amount": "1 cup", "weight_in_grams": 158}}
      ]
    }}
  ]
}}

Input: "2 slices of cheese pizza" (user has NO matching recipe)
Output:
{{
  "recipes": [
    {{
      "recipe_id": null,
      "timestamp": "2024-06-15T12:00:00",
      "description": "Cheese pizza",
      "recipe_servings": 2,
      "serving_unit": "slice",
      "serving_size_label": "1 slice",
      "serving_size_grams": 107,
      "logged_weight_grams": 214,
      "ingredients": [
        {{"food_name": "Wheat flour, white, all-purpose", "amount": "1/3 cup", "weight_in_grams": 45}},
        {{"food_name": "Cheese, mozzarella, whole milk", "amount": "1 oz", "weight_in_grams": 28}},
        {{"food_name": "Sauce, pasta, marinara", "amount": "2 tbsp", "weight_in_grams": 30}},
        {{"food_name": "Oil, olive", "amount": "1 tsp", "weight_in_grams": 4}}
      ]
    }}
  ]
}}

Input: "half a pot of homemade daal" (user has existing recipe "homemade daal" with ID "abc-123")
Output:
{{
  "recipes": [
    {{
      "recipe_id": "abc-123",
      "timestamp": "2024-06-15T12:00:00",
      "description": "homemade daal",
      "recipe_servings": 0.5,
      "ingredients": []
    }}
  ]
}}

Input: "matcha latte and pho" (user has recipe "Matcha latte" ID "latte-456", recipe "Vegetarian pho" ID "pho-789")
Output:
{{
  "recipes": [
    {{
      "recipe_id": "latte-456",
      "timestamp": "2024-06-15T08:00:00",
      "description": "Matcha latte",
      "recipe_servings": 1,
      "ingredients": []
    }},
    {{
      "recipe_id": "pho-789",
      "timestamp": "2024-06-15T12:00:00",
      "description": "Vegetarian pho",
      "recipe_servings": 1,
      "ingredients": []
    }}
  ]
}}
"""

        response = await client.chat.completions.create(
            model=MEAL_PARSE_MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": meal_description}
            ],
            response_format=response_format
        )

        result = json.loads(response.choices[0].message.content)
        return result.get("recipes", [])

    except Exception as e:
        print(f"Error identifying recipes: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to identify recipes: {str(e)}")


async def process_recipes_in_background(
    identified_recipes: List[dict],
    user_id: ObjectId,
    user_recipes: List[dict],
    meal_date: datetime,
    db: Database,
    meal_description: str = "",
):
    """
    Process recipes in the background: match ingredients, generate embeddings, create logs.

    GPT now returns SEPARATE entries for each food item:
    - Custom food: 1 ingredient with same name as description → standalone food log
    - Decomposed dish: multiple base ingredients → create new recipe + log
    - Existing recipe: recipe_id set → log using existing recipe
    """
    try:
        print(f"=== Background processing started for {len(identified_recipes)} items ===")

        for item in identified_recipes:
            try:
                recipe_id = item.get("recipe_id")
                description = item["description"]
                servings = _to_float_or_none(item.get("recipe_servings")) or 1.0
                ingredients = item.get("ingredients", [])
                serving_unit = _normalize_serving_unit(item.get("serving_unit") or item.get("serving_size_label"))
                item_serving_size_label = item.get("serving_size_label")
                parsed_serving_size_grams = _to_float_or_none(item.get("serving_size_grams"))
                parsed_logged_weight_grams = _to_float_or_none(item.get("logged_weight_grams"))
                timestamp_str = item.get("timestamp")
                if timestamp_str:
                    try:
                        timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                    except (ValueError, AttributeError):
                        timestamp = meal_date
                else:
                    timestamp = meal_date

                print(f"\nProcessing '{description}': {len(ingredients)} ingredients, servings={servings}")

                # CASE 1: Existing recipe match
                if recipe_id:
                    existing_recipe = next(
                        (r for r in user_recipes if r["recipe_id"] == recipe_id),
                        None
                    )
                    if existing_recipe:
                        print(f"  → Existing recipe match")
                        recipe_serving_size_grams = _to_float_or_none(existing_recipe.get("serving_size_grams"))
                        # Servings are counted in the recipe's own unit, so label the log with it
                        item_serving_size_label = existing_recipe.get("serving_size_label") or item_serving_size_label
                        inferred_unit = _normalize_serving_unit(item_serving_size_label)
                        servings = _infer_recipe_servings_from_text(
                            meal_description=meal_description or description,
                            item_description=description,
                            parsed_servings=servings,
                            serving_unit=inferred_unit,
                        )
                        await _create_log_for_recipe(
                            recipe_id=recipe_id,
                            meal_name=description,
                            servings=servings,
                            timestamp=timestamp,
                            ingredients=existing_recipe["ingredients"],
                            user_id=user_id,
                            db=db,
                            serving_unit=serving_unit,
                            serving_size_label=item_serving_size_label,
                            serving_size_grams=recipe_serving_size_grams,
                        )
                        continue

                # CASE 2: Single ingredient → try to log as standalone food
                # Covers both custom foods ("idli") and simple USDA foods ("2 apples").
                if len(ingredients) == 1:
                    ing = ingredients[0]
                    ing_name = ing.get("food_name", "")
                    if ing_name:
                        classification = await classify_ingredient(
                            ing_name,
                            ing.get("amount", ""),
                            ing.get("weight_in_grams", 0),
                            db,
                            {"_id": user_id},
                            user_recipes=[],
                            original_query=meal_description or description,
                        )
                        if classification["type"] == "food":
                            food_data = classification["data"]
                            print(f"  → Standalone food: '{food_data['food_name']}'")
                            await _create_log_for_food(
                                food_data["food_name"],
                                servings,
                                timestamp,
                                food_data,
                                user_id,
                                db,
                                serving_unit=serving_unit,
                                serving_size_label=item_serving_size_label,
                                logged_weight_grams=parsed_logged_weight_grams,
                                serving_size_grams=parsed_serving_size_grams,
                            )
                            continue
                        elif classification["type"] == "decompose":
                            # Single ingredient that itself decomposes → treat as a recipe
                            print(f"  → '{ing_name}' decomposes, promoting to CASE 3")
                            ingredients = classification["data"]
                        else:
                            # Re-classifying the same ingredient in CASE 3 would fail the same way
                            print(f"  ⚠ Could not classify '{ing_name}', skipping")
                            continue

                # CASE 3: Multiple ingredients → create new recipe + log
                print(f"  → Creating new recipe with {len(ingredients)} ingredients")

                # Classify each ingredient via classify_ingredient (same path as the test).
                # Defensive fallback: GPT sometimes returns ingredients: [] for composite dishes
                # (should never happen per prompt rules, but handle it gracefully).
                matched_ingredients = []
                if not ingredients:
                    print(f"  ⚠ GPT returned no ingredients for '{description}', classifying description directly")
                    classification = await classify_ingredient(
                        description,
                        item_serving_size_label or "1 serving",
                        parsed_serving_size_grams or 0,
                        db,
                        {"_id": user_id},
                        user_recipes=[],
                        original_query=meal_description or description,
                    )
                    if classification["type"] == "food":
                        matched_ingredients = [classification["data"]]
                    elif classification["type"] == "decompose":
                        matched_ingredients = list(classification["data"])
                    else:
                        print(f"  ⚠ Could not classify '{description}', skipping")
                        continue
                else:
                    # Ingredients are independent, so match them concurrently
                    named_ingredients = [ing for ing in ingredients if ing.get("food_name")]
                    classifications = await asyncio.gather(*[
                        classify_ingredient(
                            ing["food_name"],
                            ing.get("amount", ""),
                            ing.get("weight_in_grams", 0),
                            db,
                            {"_id": user_id},
                            user_recipes=[],  # sub-ingredients are never themselves recipes
                            original_query=meal_description or description,
                        )
                        for ing in named_ingredients
                    ], return_exceptions=True)

                    for ing, classification in zip(named_ingredients, classifications):
                        ing_name = ing["food_name"]
                        if isinstance(classification, Exception):
                            print(f"    ✗ '{ing_name}' — matching failed: {classification}")
                            continue

                        if classification["type"] == "food":
                            matched_ingredients.append(classification["data"])
                            print(f"    ✓ '{ing_name}' → '{classification['data']['food_name']}'")
                        elif classification["type"] == "decompose":
                            # e.g. "pizza crust" further decomposes into flour, water, yeast
                            for sub in classification["data"]:
                                matched_ingredients.append(sub)
                            print(f"    ✓ '{ing_name}' → decomposed into {len(classification['data'])} sub-ingredient(s)")
                        else:
                            print(f"    ✗ '{ing_name}' — no match found")

                if not matched_ingredients:
                    print(f"  ⚠ No valid ingredients for '{description}', skipping")
                    continue

                # Store the recipe as ONE serving so later logs can scale it by servings.
                # The parser sometimes gives ingredients for everything eaten instead.
                if servings != 1.0 and _ingredients_scale_for_servings(
                    matched_ingredients, servings, parsed_logged_weight_grams
                ) == 1.0:
                    matched_ingredients = _scale_ingredients(matched_ingredients, 1.0 / servings)

                # Create the new recipe
                new_recipe_id = str(uuid.uuid4())
                embedding = await generate_recipe_embedding(description)

                serving_size_label = item_serving_size_label or None
                # The ingredient list is exactly one serving; leaving this unset keeps it
                # in sync with the ingredients when they're edited later.
                serving_size_grams = None

                new_recipe = {
                    "recipe_id": new_recipe_id,
                    "description": description,
                    "embedding": embedding,
                    "ingredients": matched_ingredients,
                    "serving_size_label": serving_size_label,
                    "serving_size_grams": serving_size_grams,
                    "created_at": timestamp,
                    "updated_at": datetime.now()
                }

                db.users.update_one(
                    {"_id": user_id},
                    {"$push": {"recipes": new_recipe}}
                )
                user_recipes.append(new_recipe)

                print(f"  ✓ Created recipe '{description}' with {len(matched_ingredients)} ingredients")

                # Create log for this new recipe
                await _create_log_for_recipe(
                    recipe_id=new_recipe_id,
                    meal_name=description,
                    servings=servings,
                    timestamp=timestamp,
                    ingredients=matched_ingredients,
                    user_id=user_id,
                    db=db,
                    serving_unit=serving_unit,
                    serving_size_label=serving_size_label,
                )
            except Exception as e:
                import traceback
                print(f"Error processing '{item.get('description')}': {e}")
                print(f"Traceback: {traceback.format_exc()}")

        print(f"\n=== Background processing completed ===")

    except Exception as e:
        import traceback
        print(f"Error in background recipe processing: {e}")
        print(f"Traceback: {traceback.format_exc()}")


async def _create_log_for_food(
    food_name: str,
    servings: float,
    timestamp: datetime,
    food_data: dict,
    user_id: ObjectId,
    db: Database,
    serving_unit: Optional[str] = None,
    serving_size_label: Optional[str] = None,
    logged_weight_grams: Optional[float] = None,
    serving_size_grams: Optional[float] = None,
):
    """Create a standalone log entry for a single food (no recipe)."""
    food_id = food_data.get("food_id")
    if not food_id:
        food_id = await match_ingredient_to_food_id(food_name, db, {"_id": user_id})

    if not food_id:
        print(f"⚠ Could not find food_id for '{food_name}', skipping")
        return

    if _weight_of(food_data) > 0:
        # food_data's amount/weight describe one serving (or, if the parser ignored
        # that, everything eaten) — scale it to what was eaten.
        ratio = _ingredients_scale_for_servings([food_data], servings, logged_weight_grams)
        component = _scale_ingredients([food_data], ratio)[0]
    else:
        per_serving_grams = _to_float_or_none(serving_size_grams)
        component = {
            "amount": food_data.get("amount", "") or "",
            "weight_in_grams": (
                _to_float_or_none(logged_weight_grams)
                or (per_serving_grams * servings if per_serving_grams else 0.0)
            ),
        }
    actual_weight = component["weight_in_grams"]

    log_dict = {
        "recipe_id": None,  # No recipe - standalone food log
        "meal_name": food_name,
        "servings": servings,
        "date": timestamp,
        "components": [{
            "food_id": food_id,
            "amount": component["amount"],
            "weight_in_grams": actual_weight
        }],
        "serving_unit": serving_unit,
        "serving_size_label": serving_size_label,
        "logged_weight_grams": actual_weight,
        "user_id": user_id,
        "_id": ObjectId()
    }

    print(f"Creating standalone food log: '{food_name}', {actual_weight}g, {servings} servings")
    await add_log({"_id": user_id}, log_dict, db)


async def _create_log_for_recipe(
    recipe_id: str,
    meal_name: str,
    servings: float,
    timestamp: datetime,
    ingredients: List[dict],
    user_id: ObjectId,
    db: Database,
    serving_unit: Optional[str] = None,
    serving_size_label: Optional[str] = None,
    serving_size_grams: Optional[float] = None,
):
    """Create a log entry for `servings` servings of a recipe, with its ingredients as components."""
    scale_ratio = _recipe_scale_ratio(ingredients, servings, serving_size_grams)

    components = []
    for ingredient in _scale_ingredients(ingredients, scale_ratio):
        food_id = ingredient.get("food_id")
        if not food_id and ingredient.get("food_name"):
            food_id = await match_ingredient_to_food_id(ingredient["food_name"], db, {"_id": user_id})

        if food_id:
            components.append({
                "food_id": food_id,
                "amount": ingredient["amount"],
                "weight_in_grams": ingredient["weight_in_grams"]
            })

    if not components:
        print(f"⚠ No valid components for log '{meal_name}', skipping")
        return

    log_dict = {
        "recipe_id": recipe_id,
        "meal_name": meal_name,
        "servings": servings,
        "date": timestamp,
        "components": components,
        "serving_unit": serving_unit,
        "serving_size_label": serving_size_label,
        "logged_weight_grams": sum(c["weight_in_grams"] for c in components),
        "user_id": user_id,
        "_id": ObjectId()
    }

    print(f"Creating log: recipe_id={recipe_id}, meal='{meal_name}', {len(components)} components, {servings} servings")
    await add_log({"_id": user_id}, log_dict, db)


@router.post("/parse-meal")
async def parse_meal(
    user: user,
    db: db,
    background_tasks: BackgroundTasks,
    meal_description: str = Form(...),
    date: str = Form(None)
):
    """
    Parse a meal description into recipes and their ingredients.
    Returns immediately with recipe info, then processes ingredients in background.
    """
    try:
        print(f"=== parse_meal called ===")
        print(f"meal_description: {meal_description}")
        print(f"date: {date}")
        print(f"user: {user['_id']}")

        # Handle ISO format with Z timezone indicator
        if date:
            # Replace 'Z' with '+00:00' for proper ISO format parsing
            date_str = date.replace('Z', '+00:00')
            meal_date = datetime.fromisoformat(date_str)
        else:
            meal_date = datetime.now()

        print(f"meal_date: {meal_date}")

        # Get user's existing recipes
        user_doc = db.users.find_one({"_id": user["_id"]})
        user_recipes = user_doc.get("recipes", []) if user_doc else []

        # Debug: print all existing recipe names and IDs
        print(f"=== User has {len(user_recipes)} existing recipes ===")
        for r in user_recipes:
            print(f"  - '{r.get('description')}' (ID: {r.get('recipe_id')})")

        # Get user's custom foods
        user_custom_foods = await get_user_custom_foods(db, user)

        # Debug: print all custom foods
        print(f"=== User has {len(user_custom_foods)} custom foods ===")
        for f in user_custom_foods[:10]:  # Limit to first 10
            print(f"  - '{f.get('food_name')}'")
        if len(user_custom_foods) > 10:
            print(f"  ... and {len(user_custom_foods) - 10} more")

        # Identify recipes in the meal (this is fast - just GPT parsing)
        identified_recipes = await identify_recipes_from_meal(meal_description, user_recipes, user_custom_foods, meal_date)
        print(f"identified_recipes: {identified_recipes}")

        # Return immediately with recipe count and info
        response_data = {
            "status": "processing",
            "recipe_count": len(identified_recipes),
            "recipes": [
                {
                    "description": r["description"],
                    "servings": r.get("recipe_servings", 1.0),
                    "matched_existing": r.get("recipe_id") is not None
                }
                for r in identified_recipes
            ]
        }

        # Queue background processing for ingredient matching and logging
        background_tasks.add_task(
            process_recipes_in_background,
            identified_recipes,
            user["_id"],
            user_recipes,
            meal_date,
            db,
            meal_description,
        )

        print(f"=== parse_meal returning immediately (processing in background) ===")
        return response_data

    except Exception as e:
        import traceback
        print(f"Error in parse_meal: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/migrate-food-names")
async def migrate_recipe_food_names(user: user, db: db):
    """
    Migration endpoint to add food_name to existing recipe ingredients
    that only have food_id
    """
    try:
        user_doc = db.users.find_one({"_id": user["_id"]})
        if not user_doc or "recipes" not in user_doc:
            return {"status": "no_recipes", "message": "No recipes found"}

        recipes = user_doc.get("recipes", [])
        updated_count = 0

        for recipe in recipes:
            updated_ingredients = []
            needs_update = False

            for ingredient in recipe.get("ingredients", []):
                # Check if food_name is missing
                if "food_id" in ingredient and "food_name" not in ingredient:
                    needs_update = True
                    food_name = get_food_name(ingredient["food_id"], db, None)
                    updated_ingredients.append({
                        **ingredient,
                        "food_name": food_name
                    })
                else:
                    updated_ingredients.append(ingredient)

            # Update the recipe if needed
            if needs_update:
                db.users.update_one(
                    {"_id": user["_id"], "recipes.recipe_id": recipe["recipe_id"]},
                    {"$set": {"recipes.$.ingredients": updated_ingredients}}
                )
                updated_count += 1

        return {
            "status": "success",
            "updated_recipes": updated_count,
            "total_recipes": len(recipes)
        }

    except Exception as e:
        print(f"Error migrating recipe food names: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/migrate-food-ids")
async def migrate_recipe_food_ids(user: user, db: db):
    """
    Migration endpoint to add food_id to existing recipe ingredients
    that only have food_name (reverse of migrate-food-names)
    """
    try:
        user_doc = db.users.find_one({"_id": user["_id"]})
        if not user_doc or "recipes" not in user_doc:
            return {"status": "no_recipes", "message": "No recipes found"}

        recipes = user_doc.get("recipes", [])
        updated_count = 0
        total_ingredients_updated = 0

        for recipe in recipes:
            updated_ingredients = []
            needs_update = False

            for ingredient in recipe.get("ingredients", []):
                # Check if food_id is missing but food_name exists
                if "food_name" in ingredient and ("food_id" not in ingredient or not ingredient.get("food_id")):
                    needs_update = True
                    # Try to match the food_name to a food_id
                    food_id = await match_ingredient_to_food_id(ingredient["food_name"], db, user)
                    if food_id:
                        updated_ingredients.append({
                            **ingredient,
                            "food_id": _normalize_food_id(food_id)
                        })
                        total_ingredients_updated += 1
                    else:
                        # Keep ingredient as-is if we can't find a match
                        updated_ingredients.append(ingredient)
                else:
                    updated_ingredients.append(ingredient)

            # Update the recipe if needed
            if needs_update:
                db.users.update_one(
                    {"_id": user["_id"], "recipes.recipe_id": recipe["recipe_id"]},
                    {"$set": {"recipes.$.ingredients": updated_ingredients}}
                )
                updated_count += 1

        return {
            "status": "success",
            "updated_recipes": updated_count,
            "total_ingredients_updated": total_ingredients_updated,
            "total_recipes": len(recipes)
        }

    except Exception as e:
        print(f"Error migrating recipe food IDs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
def list_recipes(user: user, db: db):
    """Get all user recipes sorted alphabetically"""
    user_doc = db.users.find_one({"_id": user["_id"]})
    recipes = user_doc.get("recipes", []) if user_doc else []

    # Calculate usage counts for ALL recipes in a single aggregation query
    # This replaces the N+1 query problem (was making 1 query per recipe)
    usage_counts = {}
    if recipes:
        pipeline = [
            {"$match": {
                "user_id": user["_id"],
                "recipe_id": {"$exists": True}
            }},
            {"$group": {
                "_id": "$recipe_id",
                "count": {"$sum": 1}
            }}
        ]
        usage_results = list(db.logs.aggregate(pipeline))
        usage_counts = {result["_id"]: result["count"] for result in usage_results}

    # Add usage counts to recipes (O(1) lookup instead of N database queries)
    for recipe in recipes:
        recipe["usage_count"] = usage_counts.get(recipe.get("recipe_id"), 0)

    # Sort alphabetically by description
    recipes.sort(key=lambda r: (r.get("description") or "").lower())

    def _serialize(obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, dict):
            return {k: _serialize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_serialize(i) for i in obj]
        return obj

    # Remove embeddings from response (too large) and serialize ObjectIds
    serialized = []
    for recipe in recipes:
        recipe.pop("embedding", None)
        serialized.append(_serialize(recipe))

    return {"recipes": serialized}


@router.post("/update-ingredients")
async def update_recipe_ingredients(
    user: user,
    db: db,
    recipe_id: str = Form(...),
    ingredients: str = Form(...)  # JSON string
):
    """Update a recipe's ingredients - automatically matches food_ids for ingredients without them"""
    try:
        ingredients_list = json.loads(ingredients)

        # Process ingredients to add missing food_ids
        processed_ingredients = []
        for ingredient in ingredients_list:
            # If ingredient has food_name but no food_id, try to match it
            if "food_name" in ingredient and ingredient.get("food_name"):
                if not ingredient.get("food_id"):
                    # Try to match the food_name to a food_id
                    food_id = await match_ingredient_to_food_id(ingredient["food_name"], db, user)
                    if food_id:
                        ingredient["food_id"] = food_id
                        print(f"✓ Matched '{ingredient['food_name']}' to food_id {food_id}")
                    else:
                        print(f"✗ Could not match '{ingredient['food_name']}'")

            if ingredient.get("food_id"):
                ingredient["food_id"] = _normalize_food_id(ingredient["food_id"])
            ingredient["weight_in_grams"] = _weight_of(ingredient)
            processed_ingredients.append(ingredient)

        # Update the recipe
        result = db.users.update_one(
            {"_id": user["_id"], "recipes.recipe_id": recipe_id},
            {
                "$set": {
                    "recipes.$.ingredients": processed_ingredients,
                    "recipes.$.updated_at": datetime.now()
                }
            }
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Recipe not found")

        return {"status": "success", "recipe_id": recipe_id}

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid ingredients JSON")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating recipe: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update-serving-size")
async def update_serving_size(
    user: user,
    db: db,
    recipe_id: str = Form(...),
    serving_size_label: str = Form(...),
    serving_size_grams: Optional[float] = Form(None)
):
    """Update the serving size label and weight for a recipe"""
    serving_size_grams = _to_float_or_none(serving_size_grams)
    result = db.users.update_one(
        {"_id": user["_id"], "recipes.recipe_id": recipe_id},
        {
            "$set": {
                "recipes.$.serving_size_label": serving_size_label,
                "recipes.$.serving_size_grams": serving_size_grams,
                "recipes.$.updated_at": datetime.now()
            }
        }
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")

    return {"status": "success"}


@router.post("/rename")
async def rename_recipe(
    user: user,
    db: db,
    recipe_id: str = Form(...),
    description: str = Form(...)
):
    """Rename a recipe"""
    try:
        result = db.users.update_one(
            {"_id": user["_id"], "recipes.recipe_id": recipe_id},
            {
                "$set": {
                    "recipes.$.description": description,
                    "recipes.$.updated_at": datetime.now()
                }
            }
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Recipe not found")

        # Update meal_name on all linked logs
        db.logs.update_many(
            {"user_id": user["_id"], "recipe_id": recipe_id},
            {"$set": {"meal_name": description}}
        )

        return {"status": "success", "description": description}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error renaming recipe: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/edit-ingredient")
async def edit_recipe_ingredient(
    user: user,
    db: db,
    recipe_id: str = Form(...),
    component_index: int = Form(...),
    food_name: str = Form(...),
    amount: str = Form(...),
    weight_in_grams: Optional[float] = Form(None),
    food_id: Optional[str] = Form(None)
):
    """Edit a single ingredient in a recipe by index"""
    try:
        # Get the recipe
        user_data = db.users.find_one(
            {"_id": user["_id"], "recipes.recipe_id": recipe_id},
            {"recipes.$": 1}
        )

        if not user_data or "recipes" not in user_data or len(user_data["recipes"]) == 0:
            raise HTTPException(status_code=404, detail="Recipe not found")

        recipe = user_data["recipes"][0]
        ingredients = recipe.get("ingredients", [])

        if component_index < 0 or component_index >= len(ingredients):
            raise HTTPException(status_code=400, detail="Invalid ingredient index")

        # Use provided food_id if available, otherwise match the food_name
        if not food_id:
            print(f"No food_id provided, matching '{food_name}' using RRF...")
            food_id = await match_ingredient_to_food_id(food_name, db, user)
            if not food_id:
                raise HTTPException(status_code=404, detail=f"Could not match food: {food_name}")
        else:
            # Convert to appropriate type (int for USDA, keep string for custom foods)
            try:
                food_id = int(food_id)
            except (ValueError, TypeError):
                pass  # Keep as string for custom foods
            print(f"Using provided food_id: {food_id}")

        food_id = _normalize_food_id(food_id)

        # Use provided weight_in_grams if given, otherwise estimate from amount
        if not weight_in_grams or weight_in_grams <= 0:
            weight_in_grams = await estimate_grams(food_name, amount)

        # Update the ingredient at the specified index
        ingredients[component_index] = {
            "food_id": food_id,
            "food_name": food_name,
            "amount": amount,
            "weight_in_grams": weight_in_grams
        }

        # Update the recipe in the database
        result = db.users.update_one(
            {"_id": user["_id"], "recipes.recipe_id": recipe_id},
            {
                "$set": {
                    "recipes.$.ingredients": ingredients,
                    "recipes.$.updated_at": datetime.now()
                }
            }
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Recipe not found")

        return {
            "status": "success",
            "weight_in_grams": weight_in_grams,
            "food_name": food_name
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error editing recipe ingredient: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/add-ingredient")
async def add_recipe_ingredient(
    user: user,
    db: db,
    recipe_id: str = Form(...),
    food_name: str = Form(...),
    amount: str = Form(...),
    weight_in_grams: Optional[float] = Form(None),
    food_id: Optional[str] = Form(None)
):
    """Add a new ingredient to a recipe"""
    try:
        # Get the recipe
        user_data = db.users.find_one(
            {"_id": user["_id"], "recipes.recipe_id": recipe_id},
            {"recipes.$": 1}
        )

        if not user_data or "recipes" not in user_data or len(user_data["recipes"]) == 0:
            raise HTTPException(status_code=404, detail="Recipe not found")

        recipe = user_data["recipes"][0]
        ingredients = recipe.get("ingredients", [])

        # Use provided food_id if available, otherwise match the food_name
        if not food_id:
            print(f"No food_id provided, matching '{food_name}' using RRF...")
            food_id = await match_ingredient_to_food_id(food_name, db, user)
            if not food_id:
                raise HTTPException(status_code=404, detail=f"Could not match food: {food_name}")
        else:
            # Convert to appropriate type (int for USDA, keep string for custom foods)
            try:
                food_id = int(food_id)
            except (ValueError, TypeError):
                pass  # Keep as string for custom foods
            print(f"Using provided food_id: {food_id}")

        food_id = _normalize_food_id(food_id)

        # Use provided weight_in_grams if given, otherwise estimate from amount
        if not weight_in_grams or weight_in_grams <= 0:
            weight_in_grams = await estimate_grams(food_name, amount)

        # Append the new ingredient to the list
        new_ingredient = {
            "food_id": food_id,
            "food_name": food_name,
            "amount": amount,
            "weight_in_grams": weight_in_grams
        }
        ingredients.append(new_ingredient)

        # Update the recipe in the database
        result = db.users.update_one(
            {"_id": user["_id"], "recipes.recipe_id": recipe_id},
            {
                "$set": {
                    "recipes.$.ingredients": ingredients,
                    "recipes.$.updated_at": datetime.now()
                }
            }
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Recipe not found")

        return {
            "status": "success",
            "weight_in_grams": weight_in_grams,
            "food_name": food_name,
            "component_index": len(ingredients) - 1  # Return the index of the new ingredient
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error adding recipe ingredient: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete-ingredient")
def delete_recipe_ingredient(
    user: user,
    db: db,
    recipe_id: str,
    component_index: int
):
    """Delete a single ingredient from a recipe by index"""
    try:
        # Get the recipe
        user_data = db.users.find_one(
            {"_id": user["_id"], "recipes.recipe_id": recipe_id},
            {"recipes.$": 1}
        )

        if not user_data or "recipes" not in user_data or len(user_data["recipes"]) == 0:
            raise HTTPException(status_code=404, detail="Recipe not found")

        recipe = user_data["recipes"][0]
        ingredients = recipe.get("ingredients", [])

        if component_index < 0 or component_index >= len(ingredients):
            raise HTTPException(status_code=400, detail="Invalid ingredient index")

        # Remove the ingredient at the specified index
        ingredients.pop(component_index)

        # Update the recipe in the database
        result = db.users.update_one(
            {"_id": user["_id"], "recipes.recipe_id": recipe_id},
            {
                "$set": {
                    "recipes.$.ingredients": ingredients,
                    "recipes.$.updated_at": datetime.now()
                }
            }
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Recipe not found")

        return {"status": "success"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting recipe ingredient: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete")
def delete_recipe(user: user, db: db, recipe_id: str):
    """Delete a recipe and unlink its logs"""
    print(f"🗑️ Delete recipe request - user_id: {user['_id']}, recipe_id: {recipe_id}")

    # Remove recipe from user's recipes
    result = db.users.update_one(
        {"_id": user["_id"]},
        {"$pull": {"recipes": {"recipe_id": recipe_id}}}
    )

    print(f"🗑️ Delete result - matched: {result.matched_count}, modified: {result.modified_count}")

    if result.modified_count == 0:
        # Check if recipe exists to give better error message
        user_data = db.users.find_one({"_id": user["_id"]}, {"recipes.recipe_id": 1})
        existing_ids = [r.get("recipe_id") for r in user_data.get("recipes", [])] if user_data else []
        print(f"🗑️ Recipe not found. Existing recipe IDs: {existing_ids}")
        raise HTTPException(status_code=404, detail=f"Recipe not found. Requested: {recipe_id}")

    # Unlink all logs with this recipe_id
    unlink_result = db.logs.update_many(
        {"user_id": user["_id"], "recipe_id": recipe_id},
        {"$set": {"recipe_id": None, "recipe_servings": None}}
    )

    print(f"🗑️ Unlinked {unlink_result.modified_count} logs")

    return {
        "status": "success",
        "unlinked_logs": unlink_result.modified_count
    }


@router.post("/create")
async def create_recipe(
    user: user,
    db: db,
    description: str = Form(...),
    ingredients: str = Form(...)  # JSON string of ingredients
):
    """
    Manually create a new recipe.
    Used in the MyRecipes page when users want to add a recipe manually.
    """
    try:
        ingredients_list = json.loads(ingredients)

        # Validate ingredients structure
        if not isinstance(ingredients_list, list):
            raise HTTPException(status_code=400, detail="Ingredients must be a list")

        # Process ingredients - match food_ids and calculate weights if needed
        processed_ingredients = []
        for ing in ingredients_list:
            food_id = ing.get("food_id")
            amount = ing.get("amount")
            weight_in_grams = ing.get("weight_in_grams")

            # If food_id not provided but food_name is, try to match
            if not food_id and "food_name" in ing:
                food_id = await match_ingredient_to_food_id(ing["food_name"], db, user)
                if not food_id:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Could not find food: {ing['food_name']}"
                    )

            food_id = _normalize_food_id(food_id)

            food_name = ing.get("food_name") or get_food_name(food_id, db, None) or ""

            # If weight not provided, estimate from amount
            if not _to_float_or_none(weight_in_grams) and amount:
                weight_in_grams = await estimate_grams(food_name or "unknown", amount)

            processed_ingredients.append({
                "food_id": food_id,
                "food_name": food_name,
                "amount": amount or "",
                "weight_in_grams": _to_float_or_none(weight_in_grams) or 0.0
            })

        # Generate recipe ID and embedding
        recipe_id = str(uuid.uuid4())
        embedding = await generate_recipe_embedding(description)

        # Create recipe document
        new_recipe = {
            "recipe_id": recipe_id,
            "description": description,
            "embedding": embedding,
            "ingredients": processed_ingredients,
            "serving_size_label": None,
            "serving_size_grams": None,
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }

        # Add to user's recipes
        result = db.users.update_one(
            {"_id": user["_id"]},
            {"$push": {"recipes": new_recipe}}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")

        # Remove embedding from response (too large)
        response_recipe = {**new_recipe}
        response_recipe.pop("embedding")

        return {
            "status": "success",
            "recipe": response_recipe
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid ingredients JSON")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating recipe: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/match")
async def match_recipe(user: user, db: db, recipe_description: str = Form(...)):
    """Find semantically similar recipes in user's recipe list"""
    embedding = await generate_recipe_embedding(recipe_description)
    matches = await find_similar_recipes(user["_id"], embedding, db, threshold=0.85)

    return {"matches": matches}


@router.post("/create-from-meal")
async def create_recipe_from_meal(
    user: user,
    db: db,
    log_id: str = Form(...),
    recipe_name: str = Form(...)
):
    """
    Create a new recipe using an existing log's components as ingredients,
    then link the log to that recipe.
    """
    target_log = db.logs.find_one({"_id": ObjectId(log_id), "user_id": user["_id"]})

    if not target_log:
        raise HTTPException(status_code=404, detail="Log not found.")

    components = target_log.get("components", [])
    if not components:
        raise HTTPException(status_code=400, detail="Log has no components.")

    # Build ingredients from components. The log covers `servings` servings and recipes
    # store one serving, so divide back down.
    log_servings = _to_float_or_none(target_log.get("servings")) or 1.0
    ingredients = []
    for comp in _scale_ingredients(components, 1.0 / log_servings):
        food_id = comp.get("food_id")
        if food_id is not None:
            food_id = _normalize_food_id(food_id)
            food_name_str = get_food_name(food_id, db, None)
            ingredients.append({
                "food_id": food_id,
                "food_name": food_name_str,
                "amount": comp.get("amount", ""),
                "weight_in_grams": comp.get("weight_in_grams", 0)
            })

    if not ingredients:
        raise HTTPException(status_code=400, detail="No valid ingredients found in log.")

    serving_size_label = target_log.get("serving_size_label")
    if not serving_size_label and target_log.get("serving_unit"):
        serving_size_label = f"1 {target_log['serving_unit']}"

    recipe_id = str(uuid.uuid4())
    embedding = await generate_recipe_embedding(recipe_name)

    new_recipe = {
        "recipe_id": recipe_id,
        "description": recipe_name,
        "embedding": embedding,
        "ingredients": ingredients,
        "serving_size_label": serving_size_label,
        "serving_size_grams": None,
        "created_at": datetime.now(),
        "updated_at": datetime.now()
    }

    db.users.update_one(
        {"_id": user["_id"]},
        {"$push": {"recipes": new_recipe}}
    )

    # Link the log to the new recipe and update meal_name
    db.logs.update_one(
        {"_id": target_log["_id"]},
        {"$set": {"recipe_id": recipe_id, "meal_name": recipe_name}}
    )

    return {
        "status": "success",
        "recipe_id": recipe_id,
        "description": recipe_name
    }


@router.post("/unlink-log")
def unlink_log_from_recipe(user: user, db: db, log_id: str = Form(...)):
    """Remove recipe_id from a log to make it standalone"""
    result = db.logs.update_one(
        {"_id": ObjectId(log_id), "user_id": user["_id"]},
        {"$set": {"recipe_id": None, "recipe_servings": None}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Log not found")

    return {"status": "success"}


@router.post("/sync-logs")
def sync_logs_to_recipe(user: user, db: db, recipe_id: str = Form(...)):
    """Update all linked logs to match the current recipe ingredients"""
    # Fetch recipe from user's recipes
    user_data = db.users.find_one(
        {"_id": user["_id"], "recipes.recipe_id": recipe_id},
        {"recipes.$": 1}
    )

    if not user_data or not user_data.get("recipes"):
        raise HTTPException(status_code=404, detail="Recipe not found")

    recipe = user_data["recipes"][0]
    ingredients = recipe.get("ingredients", [])

    # Find all logs linked to this recipe
    linked_logs = list(db.logs.find(
        {"user_id": user["_id"], "recipe_id": recipe_id}
    ))

    if not linked_logs:
        return {"status": "success", "updated_count": 0}

    updated_count = 0
    for log in linked_logs:
        servings = _to_float_or_none(log.get("servings")) or 1.0
        # Recompute from servings: the old gram total reflects the old ingredient list,
        # so scaling to it would shrink/grow every ingredient when one is added/removed.
        scale_ratio = _recipe_scale_ratio(ingredients, servings, recipe.get("serving_size_grams"))

        new_components = []
        for ing in _scale_ingredients(ingredients, scale_ratio):
            normalized_food_id = _normalize_food_id(ing.get("food_id"))
            resolved_food_name = ing.get("food_name")
            if not resolved_food_name:
                resolved_food_name = get_food_name(normalized_food_id, db, None)
            new_components.append({
                "food_id": normalized_food_id,
                "food_name": resolved_food_name,
                "amount": ing["amount"],
                "weight_in_grams": ing["weight_in_grams"]
            })
        logged_weight_grams = sum(c["weight_in_grams"] for c in new_components)

        result = db.logs.update_one(
            {"_id": log["_id"]},
            {"$set": {"components": new_components, "logged_weight_grams": logged_weight_grams}}
        )
        if result.modified_count > 0:
            updated_count += 1

    return {"status": "success", "updated_count": updated_count}


@router.post("/unlink-all-logs")
def unlink_all_logs_from_recipe(user: user, db: db, recipe_id: str = Form(...)):
    """Unlink all logs from a recipe without deleting the recipe"""
    result = db.logs.update_many(
        {"user_id": user["_id"], "recipe_id": recipe_id},
        {"$set": {"recipe_id": None, "recipe_servings": None}}
    )

    return {"status": "success", "unlinked_count": result.modified_count}
