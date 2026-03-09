from __future__ import annotations

import json
import os
from datetime import date, datetime, time
from typing import Any, Dict, List, Optional, Union

import httpx

from .config import DEFAULT_BASE_URL, ConfigStore
from .errors import (
    FoodpanelAPIError,
    FoodpanelAuthError,
    FoodpanelConnectionError,
    FoodpanelNotFoundError,
    FoodpanelValidationError,
)

DateLike = Union[str, date, datetime]


class FoodpanelClient:
    """Shared API client used by CLI, MCP tools, and other agent interfaces."""

    def __init__(
        self,
        *,
        base_url: Optional[str] = None,
        access_token: Optional[str] = None,
        timeout: Optional[float] = None,
        config_path: Optional[str] = None,
        persist_session: bool = True,
    ) -> None:
        self._store = ConfigStore(config_path)
        self._persist_session = persist_session

        stored = self._store.load() if persist_session else None
        resolved_base_url = (
            base_url
            or (stored.base_url if stored else None)
            or os.getenv("FOODPANEL_API_URL")
            or DEFAULT_BASE_URL
        )
        resolved_timeout = timeout
        if resolved_timeout is None:
            env_timeout = os.getenv("FOODPANEL_TIMEOUT_SECONDS")
            try:
                resolved_timeout = float(env_timeout) if env_timeout else 90.0
            except (TypeError, ValueError):
                resolved_timeout = 90.0

        self.base_url = resolved_base_url.rstrip("/")
        self._access_token = access_token if access_token is not None else (stored.access_token if stored else None)
        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=httpx.Timeout(timeout=resolved_timeout),
        )

        if persist_session:
            self._store.save(base_url=self.base_url, access_token=self._access_token)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "FoodpanelClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    @property
    def access_token(self) -> Optional[str]:
        return self._access_token

    def set_access_token(self, token: str, *, persist: bool = True) -> None:
        self._access_token = token
        if persist and self._persist_session:
            self._store.save(base_url=self.base_url, access_token=self._access_token)

    def clear_access_token(self, *, persist: bool = True) -> None:
        self._access_token = None
        if persist and self._persist_session:
            self._store.save(base_url=self.base_url, access_token=None)

    def login(self, username: str, password: str, *, persist: bool = True) -> Dict[str, Any]:
        payload = {"username": username, "password": password}
        response = self._request("POST", "/auth/submit_login", data=payload, auth_required=False)
        token = response.get("access_token")
        if not token:
            raise FoodpanelAuthError("Login succeeded but no access token was returned.", status_code=200)
        self.set_access_token(token, persist=persist)
        return response

    def logout(self) -> None:
        self.clear_access_token(persist=True)

    def _acquire_trial_token(self) -> None:
        """Auto-login as the shared trial user when no token is set."""
        try:
            response = self._request("POST", "/trial/create", auth_required=False)
            token = response.get("access_token")
            if token:
                self.set_access_token(token, persist=self._persist_session)
        except Exception:
            pass  # Fall through to the normal auth error

    def whoami(self) -> str:
        """Return identity: 'trial mode' for trial users, 'Name <email>' for real users."""
        import base64
        if not self._access_token:
            self._acquire_trial_token()
        if not self._access_token:
            raise FoodpanelAuthError("No access token is set. Call login() first.", status_code=401)
        try:
            parts = self._access_token.split(".")
            if len(parts) != 3:
                raise ValueError("Invalid token format")
            payload_b64 = parts[1]
            payload_b64 += "=" * (4 - len(payload_b64) % 4)
            payload = json.loads(base64.b64decode(payload_b64))
        except Exception as exc:
            raise FoodpanelAuthError("Could not decode access token.", status_code=401) from exc

        if payload.get("trial"):
            return "trial mode"

        name = payload.get("name", "")
        email = payload.get("email", "")
        if name and email:
            return f"{name} <{email}>"
        return name or email or "unknown"

    # Logs and progress
    def log_meal(self, meal_description: str, *, date_value: Optional[DateLike] = None) -> Dict[str, Any]:
        form_data: Dict[str, str] = {"meal_description": meal_description}
        if date_value is not None:
            form_data["date"] = self._to_datetime_string(date_value, end_of_day=False)
        return self._request("POST", "/recipes/parse-meal", data=form_data)

    def log_entry(self, entry: str) -> Dict[str, Any]:
        """Log a free-form meal entry via the same parser flow used by the frontend."""
        return self._request(
            "POST",
            "/recipes/parse-meal",
            data={"meal_description": entry},
        )

    def get_logs(self, start_date: DateLike, end_date: DateLike) -> List[Dict[str, Any]]:
        params = {
            "startDate": self._to_datetime_string(start_date, end_of_day=False),
            "endDate": self._to_datetime_string(end_date, end_of_day=True),
        }
        return self._request("GET", "/logs/get", params=params)

    def get_day_logs(self, day: DateLike) -> List[Dict[str, Any]]:
        return self.get_logs(day, day)

    def get_log_nutrition(self, log_id: str) -> Dict[str, Any]:
        """
        Get total nutrition for a log entry (all components combined), with human-readable names.
        Uses the same data the frontend shows on hover. Nutrients are scaled to the logged portion.
        Returns: {"Protein (g)": 12.5, "Energy (kcal)": 230, ...}
        """
        raw = self._request("GET", "/food/panel", params={"log_id": log_id}, auth_required=False)
        return self._humanize_nutrient_totals(raw)

    def get_component_nutrition(self, food_id: str, weight_in_grams: float) -> Dict[str, Any]:
        """
        Get nutrition for a single food component scaled to a given weight.
        food_id: USDA integer ID or custom food ObjectId string (from a log's components list).
        weight_in_grams: actual consumed weight (from the log component's weight_in_grams field).
        Returns: {"Protein (g)": 8.1, "Energy (kcal)": 149, ...}
        """
        raw = self._request(
            "GET", "/food/nutrients",
            params={"food_id": str(food_id), "amount_in_grams": weight_in_grams},
            auth_required=False,
        )
        return self._humanize_nutrient_totals(raw)

    def get_day_intake(self, day: DateLike) -> Dict[str, Any]:
        params = {"date": self._to_datetime_string(day, end_of_day=False)}
        totals = self._request("GET", "/logs/day_intake", params=params)
        if isinstance(totals, dict):
            return self._humanize_nutrient_totals(totals)
        return totals

    def get_top_foods(
        self,
        nutrient_id: int,
        per_nutrient_id: Optional[int] = None,
        limit: int = 20,
    ) -> Dict[str, Any]:
        """
        Return top foods ranked by nutrient content or nutrient ratio.

        nutrient_id only  → ranked by amount of that nutrient per 100g.
        nutrient_id + per_nutrient_id → ranked by nutrient_id / per_nutrient_id ratio
          e.g. protein per calorie: nutrient_id=1003, per_nutrient_id=1008.

        Common nutrient IDs: 1003 Protein, 1004 Fat, 1005 Carbs, 1008 Energy (kcal),
          1079 Fiber, 1087 Calcium, 1089 Iron, 1258 Saturated fat, 1292 PUFAs.
        """
        params: Dict[str, Any] = {"nutrient_id": nutrient_id, "limit": limit}
        if per_nutrient_id is not None:
            params["per_nutrient_id"] = per_nutrient_id
        return self._request("GET", "/food/top", params=params, auth_required=False)

    def get_progress_stats(self, start_date: DateLike, end_date: DateLike) -> Dict[str, Any]:
        params = {
            "startDate": self._to_datetime_string(start_date, end_of_day=False),
            "endDate": self._to_datetime_string(end_date, end_of_day=True),
        }
        totals = self._request("GET", "/logs/range_intake", params=params)
        if isinstance(totals, dict):
            return self._humanize_nutrient_totals(totals)
        return totals

    def get_nutrients(self) -> Dict[str, Dict[str, Any]]:
        """
        Return nutrient metadata keyed by nutrient name:
        {
          "Protein": {"id": 1003, "unit": "g"},
          ...
        }
        """
        return self._request("GET", "/nutrients/all")

    # Requirements
    def list_requirements(self) -> List[Dict[str, Any]]:
        """
        Return requirement list with nutrient names/units:
        [
          {
            "nutrient_id": "1003",
            "nutrient_name": "Protein",
            "unit": "G",
            "target": 120,
            "should_exceed": True
          },
          ...
        ]
        """
        payload = self._request("GET", "/requirements/all")
        if not isinstance(payload, dict):
            return []

        nutrient_lookup = self._build_nutrient_lookup()
        out: List[Dict[str, Any]] = []
        for nutrient_id, cfg in payload.items():
            nutrient_id_str = str(nutrient_id)
            name, unit = nutrient_lookup.get(nutrient_id_str, (f"Nutrient {nutrient_id_str}", ""))
            if not isinstance(cfg, dict):
                continue
            out.append(
                {
                    "nutrient_id": nutrient_id_str,
                    "nutrient_name": name,
                    "unit": unit,
                    "target": cfg.get("target"),
                    "should_exceed": bool(cfg.get("should_exceed")),
                }
            )
        out.sort(key=lambda x: x.get("nutrient_name", ""))
        return out

    def add_requirement(self, nutrient_id: int, target: float, should_exceed: bool) -> Dict[str, Any]:
        payload = {
            "nutrient_id": int(nutrient_id),
            "amt": float(target),
            "should_exceed": bool(should_exceed),
        }
        result = self._request("POST", "/requirements/new", json_data=payload)
        return result if isinstance(result, dict) else {"status": "success"}

    def remove_requirement(self, nutrient_id: int) -> Dict[str, Any]:
        result = self._request("DELETE", "/requirements/delete", params={"requirement_id": int(nutrient_id)})
        return result if isinstance(result, dict) else {"status": "success"}

    def edit_requirement(
        self,
        nutrient_id: int,
        target: float,
        should_exceed: bool,
        *,
        new_nutrient_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Edit a requirement. If new_nutrient_id differs, delete old requirement and add new one.
        """
        effective_id = int(new_nutrient_id) if new_nutrient_id is not None else int(nutrient_id)
        if effective_id != int(nutrient_id):
            self.remove_requirement(int(nutrient_id))
        self.add_requirement(effective_id, target, should_exceed)
        return {"status": "success", "nutrient_id": effective_id}

    # Custom foods
    def list_custom_foods(self) -> List[Dict[str, Any]]:
        foods = self._request("GET", "/food/custom-foods")
        if not isinstance(foods, list):
            return foods

        nutrient_lookup = self._build_nutrient_lookup()
        enriched: List[Dict[str, Any]] = []
        for food in foods:
            if not isinstance(food, dict):
                enriched.append(food)
                continue

            nutrient_details: List[Dict[str, Any]] = []
            nutrients = food.get("nutrients", {})
            if isinstance(nutrients, dict):
                for nutrient_id, amount in nutrients.items():
                    name, unit = nutrient_lookup.get(str(nutrient_id), (f"Nutrient {nutrient_id}", ""))
                    nutrient_details.append(
                        {
                            "nutrient_id": str(nutrient_id),
                            "nutrient_name": name,
                            "amount": amount,
                            "unit": unit,
                        }
                    )

            enriched.append(
                {
                    **food,
                    "id": food.get("_id"),
                    "display_name": str(food.get("name", "")).strip(),
                    "nutrient_details": nutrient_details,
                }
            )
        return enriched

    def get_custom_food(self, food_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/food/custom_foods/{food_id}")

    def add_custom_food(self, name: str, nutrients: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        form_data = {
            "name": name,
            "nutrients": json.dumps(nutrients or []),
        }
        return self._request("POST", "/food/add_custom_food", data=form_data)

    def update_custom_food_name(self, food_id: str, name: str) -> Dict[str, Any]:
        return self._request("PUT", f"/food/custom_foods/{food_id}", params={"name": name})

    def update_custom_food_nutrients(self, food_id: str, nutrients: List[Dict[str, Any]]) -> Dict[str, Any]:
        form_data = {"nutrients": json.dumps(nutrients)}
        return self._request("PUT", f"/food/update-nutrients/{food_id}", data=form_data)

    def delete_custom_food(self, food_id: str) -> Dict[str, Any]:
        return self._request("DELETE", f"/food/custom_foods/{food_id}")

    def delete_log(self, log_id: str) -> Dict[str, Any]:
        return self._request("DELETE", "/logs/delete", params={"log_id": log_id})

    def delete_log_component(self, log_id: str, component_index: int) -> Dict[str, Any]:
        return self._request(
            "DELETE", "/logs/delete-component",
            params={"log_id": log_id, "component_index": component_index},
        )

    # Recipes
    def list_recipes(self) -> Dict[str, Any]:
        payload = self._request("GET", "/recipes/list")
        if not isinstance(payload, dict):
            return payload

        recipes = payload.get("recipes", [])
        if not isinstance(recipes, list):
            return payload

        enriched_recipes: List[Dict[str, Any]] = []
        for recipe in recipes:
            if not isinstance(recipe, dict):
                enriched_recipes.append(recipe)
                continue

            ingredients = recipe.get("ingredients", [])
            ingredient_details: List[Dict[str, Any]] = []
            if isinstance(ingredients, list):
                for ingredient in ingredients:
                    if not isinstance(ingredient, dict):
                        continue
                    food_id = ingredient.get("food_id")
                    food_name = ingredient.get("food_name")
                    ingredient_details.append(
                        {
                            "food_id": str(food_id) if food_id is not None else None,
                            "food_name": (str(food_name).strip() if food_name else f"Food {food_id}"),
                            "amount": ingredient.get("amount"),
                            "weight_in_grams": ingredient.get("weight_in_grams"),
                        }
                    )

            enriched_recipes.append(
                {
                    **recipe,
                    "display_name": str(recipe.get("description", "")).strip(),
                    "serving_label": recipe.get("serving_size_label"),
                    "ingredient_details": ingredient_details,
                }
            )

        return {
            **payload,
            "recipes": enriched_recipes,
        }

    def create_recipe(self, name: str, ingredients: List[Dict[str, Any]]) -> Dict[str, Any]:
        form_data = {
            "description": name,
            "ingredients": json.dumps(ingredients),
        }
        return self._request("POST", "/recipes/create", data=form_data)

    def rename_recipe(self, recipe_id: str, name: str) -> Dict[str, Any]:
        form_data = {"recipe_id": recipe_id, "description": name}
        return self._request("POST", "/recipes/rename", data=form_data)

    def update_recipe_serving_size(self, recipe_id: str, label: str, grams: float) -> Dict[str, Any]:
        form_data = {
            "recipe_id": recipe_id,
            "serving_size_label": label,
            "serving_size_grams": str(grams),
        }
        return self._request("POST", "/recipes/update-serving-size", data=form_data)

    def add_recipe_ingredient(
        self,
        recipe_id: str,
        food_name: str,
        amount: str,
        *,
        weight_in_grams: Optional[float] = None,
        food_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        form_data: Dict[str, str] = {
            "recipe_id": recipe_id,
            "food_name": food_name,
            "amount": amount,
        }
        if weight_in_grams is not None:
            form_data["weight_in_grams"] = str(weight_in_grams)
        if food_id:
            form_data["food_id"] = str(food_id)
        return self._request("POST", "/recipes/add-ingredient", data=form_data)

    def edit_recipe_ingredient(
        self,
        recipe_id: str,
        component_index: int,
        food_name: str,
        amount: str,
        *,
        weight_in_grams: Optional[float] = None,
        food_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        form_data: Dict[str, str] = {
            "recipe_id": recipe_id,
            "component_index": str(component_index),
            "food_name": food_name,
            "amount": amount,
        }
        if weight_in_grams is not None:
            form_data["weight_in_grams"] = str(weight_in_grams)
        if food_id:
            form_data["food_id"] = str(food_id)
        return self._request("POST", "/recipes/edit-ingredient", data=form_data)

    def delete_recipe(self, recipe_id: str) -> Dict[str, Any]:
        return self._request("DELETE", "/recipes/delete", params={"recipe_id": recipe_id})

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        json_data: Optional[Any] = None,
        auth_required: bool = True,
    ) -> Any:
        headers: Dict[str, str] = {}

        if auth_required:
            if not self._access_token:
                self._acquire_trial_token()
            if not self._access_token:
                raise FoodpanelAuthError(
                    "No access token is set. Call login() or set_access_token() first.",
                    status_code=401,
                    path=path,
                )
            headers["Authorization"] = f"Bearer {self._access_token}"

        try:
            response = self._client.request(
                method=method,
                url=path,
                params=params,
                data=data,
                json=json_data,
                headers=headers,
            )
        except httpx.RequestError as exc:
            raise FoodpanelConnectionError(f"Could not connect to Foodpanel API at {self.base_url}: {exc}") from exc

        if response.status_code >= 400:
            self._raise_api_error(response, path)

        if not response.content:
            return {}

        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            return response.json()

        try:
            return response.json()
        except ValueError:
            return response.text

    def _build_nutrient_lookup(self) -> Dict[str, tuple[str, str]]:
        """Return map of nutrient_id -> (nutrient_name, unit)."""
        nutrient_map = self.get_nutrients()
        lookup: Dict[str, tuple[str, str]] = {}
        if not isinstance(nutrient_map, dict):
            return lookup

        for nutrient_name, meta in nutrient_map.items():
            if not isinstance(meta, dict):
                continue
            nutrient_id = meta.get("id")
            if nutrient_id is None:
                continue
            lookup[str(nutrient_id)] = (str(nutrient_name), str(meta.get("unit", "") or ""))
        return lookup

    def _humanize_nutrient_totals(self, totals: Dict[Any, Any]) -> Dict[str, Any]:
        """Convert nutrient-id keyed totals to nutrient-name keyed totals."""
        lookup = self._build_nutrient_lookup()
        humanized: Dict[str, Any] = {}

        for nutrient_id, amount in totals.items():
            nutrient_key = str(nutrient_id)
            name, unit = lookup.get(nutrient_key, (f"Nutrient {nutrient_key}", ""))
            label = f"{name} ({unit})" if unit else name
            humanized[label] = amount

        return humanized

    def _raise_api_error(self, response: httpx.Response, path: str) -> None:
        status_code = response.status_code
        message = f"{response.request.method} {path} failed"
        details: Any = None

        try:
            payload = response.json()
        except ValueError:
            payload = None

        if isinstance(payload, dict):
            detail = payload.get("detail")
            if isinstance(detail, str):
                message = detail
            elif detail is not None:
                details = detail
            else:
                details = payload
        elif payload is not None:
            details = payload
        elif response.text:
            details = response.text

        exc_kwargs = {"status_code": status_code, "path": path, "details": details}

        if status_code in (401, 403):
            raise FoodpanelAuthError(message, **exc_kwargs)
        if status_code == 404:
            raise FoodpanelNotFoundError(message, **exc_kwargs)
        if status_code == 422:
            raise FoodpanelValidationError(message, **exc_kwargs)
        raise FoodpanelAPIError(message, **exc_kwargs)

    @staticmethod
    def _to_datetime_string(value: DateLike, *, end_of_day: bool) -> str:
        if isinstance(value, datetime):
            return value.isoformat()

        if isinstance(value, date):
            current_time = time.max if end_of_day else time.min
            dt = datetime.combine(value, current_time)
            return dt.isoformat()

        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                raise ValueError("Date string cannot be empty.")

            # Keep explicit datetime strings untouched.
            if "T" in stripped:
                return stripped

            try:
                parsed_date = date.fromisoformat(stripped)
            except ValueError:
                # Pass through if caller intentionally supplies custom format.
                return stripped
            return FoodpanelClient._to_datetime_string(parsed_date, end_of_day=end_of_day)

        raise TypeError(f"Unsupported date value type: {type(value)!r}")
