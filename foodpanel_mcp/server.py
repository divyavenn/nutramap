from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from mcp.server.fastmcp import FastMCP

from foodpanel import FoodpanelClient
from foodpanel.config import ConfigStore
from foodpanel.errors import FoodpanelError


SERVER_NAME = "foodpanel"

mcp = FastMCP(
    SERVER_NAME,
    instructions=(
        "Tools for the Foodpanel nutrition tracker API. "
        "Supports meal logging, reading daily logs, progress stats, and custom food/recipe management."
    ),
)


def _get_client(base_url: Optional[str] = None, access_token: Optional[str] = None) -> FoodpanelClient:
    resolved_base_url = base_url or os.getenv("FOODPANEL_API_URL")
    return FoodpanelClient(base_url=resolved_base_url, access_token=access_token, persist_session=True)


def _safe_call(fn):
    try:
        return fn()
    except FoodpanelError as exc:
        raise RuntimeError(str(exc)) from exc


@mcp.tool()
def session_info() -> Dict[str, Any]:
    """Return currently configured base URL and whether a token is available."""

    store = ConfigStore()
    cfg = store.load()
    return {
        "base_url": cfg.base_url,
        "has_access_token": bool(cfg.access_token),
        "config_path": str(store.path),
    }


@mcp.tool()
def login(username: str, password: str, base_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Log in to Foodpanel and persist a bearer token for subsequent tool calls.

    Args:
        username: Foodpanel account email/username.
        password: Foodpanel account password.
        base_url: Optional API base URL override.
    """

    def _run() -> Dict[str, Any]:
        with _get_client(base_url=base_url) as client:
            result = client.login(username=username, password=password, persist=True)
            return {
                "status": "ok",
                "base_url": client.base_url,
                "token_type": result.get("token_type"),
            }

    return _safe_call(_run)


@mcp.tool()
def logout() -> Dict[str, Any]:
    """Clear the persisted Foodpanel access token."""

    def _run() -> Dict[str, Any]:
        with _get_client() as client:
            client.logout()
        return {"status": "ok", "message": "Token cleared"}

    return _safe_call(_run)


@mcp.tool()
def log_meal(meal_description: str, date_value: Optional[str] = None) -> Dict[str, Any]:
    """
    Log a meal from natural language text.

    Args:
        meal_description: Meal text like "2 eggs and toast for breakfast".
        date_value: Optional ISO date/datetime.
    """

    return _safe_call(lambda: _with_client(lambda c: c.log_meal(meal_description, date_value=date_value)))


@mcp.tool()
def get_day_logs(day: str) -> List[Dict[str, Any]]:
    """
    Get logs for a single day.

    Args:
        day: ISO date string (YYYY-MM-DD).
    """

    return _safe_call(lambda: _with_client(lambda c: c.get_day_logs(day)))


@mcp.tool()
def get_day_intake(day: str) -> Dict[str, Any]:
    """
    Get nutrient intake totals for a single day based on user requirements.

    Args:
        day: ISO date string (YYYY-MM-DD).
    """

    return _safe_call(lambda: _with_client(lambda c: c.get_day_intake(day)))


@mcp.tool()
def get_progress_stats(start_date: str, end_date: str) -> Dict[str, Any]:
    """
    Get averaged nutrient intake across a date range.

    Args:
        start_date: ISO date string (YYYY-MM-DD).
        end_date: ISO date string (YYYY-MM-DD).
    """

    return _safe_call(lambda: _with_client(lambda c: c.get_progress_stats(start_date, end_date)))


@mcp.tool()
def list_custom_foods() -> List[Dict[str, Any]]:
    """List current user's custom foods."""

    return _safe_call(lambda: _with_client(lambda c: c.list_custom_foods()))


@mcp.tool()
def add_custom_food(name: str, nutrients: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """
    Add a custom food.

    Args:
        name: Display name for the food.
        nutrients: Optional nutrient list, e.g. [{"nutrient_id": 1003, "amount": 25}].
    """

    return _safe_call(lambda: _with_client(lambda c: c.add_custom_food(name, nutrients or [])))


@mcp.tool()
def edit_custom_food(
    food_id: str,
    name: Optional[str] = None,
    nutrients: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Edit a custom food's name and/or nutrients.

    Args:
        food_id: Custom food ID.
        name: Optional updated food name.
        nutrients: Optional nutrient list.
    """

    if name is None and nutrients is None:
        return {"status": "noop", "message": "Provide at least one of: name, nutrients"}

    def _run() -> Dict[str, Any]:
        updates: Dict[str, Any] = {"food_id": food_id}
        with _get_client() as client:
            if name is not None:
                updates["name_update"] = client.update_custom_food_name(food_id, name)
            if nutrients is not None:
                updates["nutrient_update"] = client.update_custom_food_nutrients(food_id, nutrients)
        updates["status"] = "success"
        return updates

    return _safe_call(_run)


@mcp.tool()
def list_recipes() -> Dict[str, Any]:
    """List current user's recipes."""

    return _safe_call(lambda: _with_client(lambda c: c.list_recipes()))


@mcp.tool()
def create_recipe(name: str, ingredients: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Create a recipe.

    Args:
        name: Recipe name.
        ingredients: Ingredient list with food_id/food_name, amount, weight_in_grams.
    """

    return _safe_call(lambda: _with_client(lambda c: c.create_recipe(name, ingredients)))


@mcp.tool()
def rename_recipe(recipe_id: str, name: str) -> Dict[str, Any]:
    """Rename a recipe."""

    return _safe_call(lambda: _with_client(lambda c: c.rename_recipe(recipe_id, name)))


@mcp.tool()
def set_recipe_serving_size(recipe_id: str, serving_size_label: str, serving_size_grams: float) -> Dict[str, Any]:
    """Set serving size label and gram weight for a recipe."""

    return _safe_call(
        lambda: _with_client(lambda c: c.update_recipe_serving_size(recipe_id, serving_size_label, serving_size_grams))
    )


@mcp.tool()
def add_recipe_ingredient(
    recipe_id: str,
    food_name: str,
    amount: str,
    weight_in_grams: Optional[float] = None,
    food_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Add one ingredient to an existing recipe."""

    return _safe_call(
        lambda: _with_client(
            lambda c: c.add_recipe_ingredient(
                recipe_id=recipe_id,
                food_name=food_name,
                amount=amount,
                weight_in_grams=weight_in_grams,
                food_id=food_id,
            )
        )
    )


@mcp.tool()
def edit_recipe_ingredient(
    recipe_id: str,
    component_index: int,
    food_name: str,
    amount: str,
    weight_in_grams: Optional[float] = None,
    food_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Edit one ingredient in an existing recipe by index."""

    return _safe_call(
        lambda: _with_client(
            lambda c: c.edit_recipe_ingredient(
                recipe_id=recipe_id,
                component_index=component_index,
                food_name=food_name,
                amount=amount,
                weight_in_grams=weight_in_grams,
                food_id=food_id,
            )
        )
    )


def _with_client(fn):
    with _get_client() as client:
        return fn(client)


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
