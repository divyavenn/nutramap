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
        timeout: float = 30.0,
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
        self.base_url = resolved_base_url.rstrip("/")
        self._access_token = access_token if access_token is not None else (stored.access_token if stored else None)
        self._client = httpx.Client(base_url=self.base_url, timeout=timeout)

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

    # Logs and progress
    def log_meal(self, meal_description: str, *, date_value: Optional[DateLike] = None) -> Dict[str, Any]:
        form_data: Dict[str, str] = {"meal_description": meal_description}
        if date_value is not None:
            form_data["date"] = self._to_datetime_string(date_value, end_of_day=False)
        return self._request("POST", "/recipes/parse-meal", data=form_data)

    def log_entry(self, entry: str) -> Dict[str, Any]:
        """Log a free-form meal entry, letting the backend infer dates/times from text."""
        return self._request(
            "POST",
            "/match/log-meal-now",
            json_data={"meal_description": entry},
        )

    def get_logs(self, start_date: DateLike, end_date: DateLike) -> List[Dict[str, Any]]:
        params = {
            "startDate": self._to_datetime_string(start_date, end_of_day=False),
            "endDate": self._to_datetime_string(end_date, end_of_day=True),
        }
        return self._request("GET", "/logs/get", params=params)

    def get_day_logs(self, day: DateLike) -> List[Dict[str, Any]]:
        return self.get_logs(day, day)

    def get_day_intake(self, day: DateLike) -> Dict[str, Any]:
        params = {"date": self._to_datetime_string(day, end_of_day=False)}
        return self._request("GET", "/logs/day_intake", params=params)

    def get_progress_stats(self, start_date: DateLike, end_date: DateLike) -> Dict[str, Any]:
        params = {
            "startDate": self._to_datetime_string(start_date, end_of_day=False),
            "endDate": self._to_datetime_string(end_date, end_of_day=True),
        }
        return self._request("GET", "/logs/range_intake", params=params)

    # Custom foods
    def list_custom_foods(self) -> List[Dict[str, Any]]:
        return self._request("GET", "/food/custom-foods")

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

    # Recipes
    def list_recipes(self) -> Dict[str, Any]:
        return self._request("GET", "/recipes/list")

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
