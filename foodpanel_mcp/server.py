from __future__ import annotations

import os
from typing import Any, Callable, Dict, List, Optional, TypeVar

from mcp.server.fastmcp import Context, FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from foodpanel import FoodpanelClient
from foodpanel.config import ConfigStore
from foodpanel.errors import FoodpanelError


SERVER_NAME = "foodpanel"
STATELESS_ENV = "FOODPANEL_MCP_STATELESS"
TRANSPORT_ENV = "FOODPANEL_MCP_TRANSPORT"
ACCESS_TOKEN_ENV = "FOODPANEL_ACCESS_TOKEN"
ACCESS_TOKEN_HEADER = "x-foodpanel-access-token"

mcp = FastMCP(
    SERVER_NAME,
    instructions=(
        "Tools for the Foodpanel nutrition tracker API. "
        "Supports meal logging, reading daily logs, progress stats, and custom food/recipe management."
    ),
    streamable_http_path="/mcp",
    stateless_http=True,
)


@mcp.custom_route("/healthz", methods=["GET"], include_in_schema=False)
async def healthz(_: Request) -> Response:
    return JSONResponse({"status": "ok", "server": SERVER_NAME})


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _request_from_ctx(ctx: Optional[Context]) -> Optional[Request]:
    if ctx is None:
        return None
    try:
        request = ctx.request_context.request
    except (LookupError, ValueError, AttributeError):
        return None
    if isinstance(request, Request):
        return request
    return None


def _extract_bearer_token(header_value: Optional[str]) -> Optional[str]:
    if not header_value:
        return None
    parts = header_value.strip().split(" ", 1)
    if len(parts) != 2:
        return None
    scheme, token = parts
    if scheme.lower() != "bearer":
        return None
    cleaned = token.strip()
    return cleaned or None


def _resolve_access_token(ctx: Optional[Context], explicit_token: Optional[str] = None) -> tuple[Optional[str], str]:
    if explicit_token:
        return explicit_token, "explicit"

    request = _request_from_ctx(ctx)
    if request is not None:
        forwarded = request.headers.get(ACCESS_TOKEN_HEADER)
        if forwarded:
            return forwarded.strip(), ACCESS_TOKEN_HEADER
        bearer = _extract_bearer_token(request.headers.get("authorization"))
        if bearer:
            return bearer, "authorization"

    env_token = os.getenv(ACCESS_TOKEN_ENV)
    if env_token:
        return env_token, ACCESS_TOKEN_ENV
    return None, "none"


def _is_stateless_mode(ctx: Optional[Context]) -> bool:
    if _env_flag(STATELESS_ENV, default=False):
        return True
    # Any HTTP request context should avoid disk-backed sessions.
    return _request_from_ctx(ctx) is not None


def _get_client(
    *,
    ctx: Optional[Context] = None,
    base_url: Optional[str] = None,
    access_token: Optional[str] = None,
) -> FoodpanelClient:
    resolved_token, _ = _resolve_access_token(ctx, explicit_token=access_token)
    resolved_base_url = base_url or os.getenv("FOODPANEL_API_URL")
    return FoodpanelClient(
        base_url=resolved_base_url,
        access_token=resolved_token,
        persist_session=not _is_stateless_mode(ctx),
    )


def _safe_call(fn):
    try:
        return fn()
    except FoodpanelError as exc:
        raise RuntimeError(str(exc)) from exc


@mcp.tool()
def session_info(ctx: Optional[Context] = None) -> Dict[str, Any]:
    """Return currently configured base URL and whether a token is available."""

    stateless = _is_stateless_mode(ctx)
    access_token, source = _resolve_access_token(ctx)

    with _get_client(ctx=ctx) as client:
        payload: Dict[str, Any] = {
            "base_url": client.base_url,
            "mode": "stateless" if stateless else "stateful",
            "has_access_token": bool(access_token),
            "access_token_source": source,
        }

    if not stateless:
        store = ConfigStore()
        payload["config_path"] = str(store.path)

    return payload


@mcp.tool()
def login(
    username: str,
    password: str,
    base_url: Optional[str] = None,
    ctx: Optional[Context] = None,
) -> Dict[str, Any]:
    """
    Log in to Foodpanel.

    Args:
        username: Foodpanel account email/username.
        password: Foodpanel account password.
        base_url: Optional API base URL override.
    """

    def _run() -> Dict[str, Any]:
        stateless = _is_stateless_mode(ctx)
        with _get_client(ctx=ctx, base_url=base_url) as client:
            result = client.login(username=username, password=password, persist=not stateless)
            response: Dict[str, Any] = {
                "status": "ok",
                "base_url": client.base_url,
                "token_type": result.get("token_type"),
                "mode": "stateless" if stateless else "stateful",
            }
            if stateless and result.get("access_token"):
                response["access_token"] = result.get("access_token")
                response["message"] = (
                    "Stateless mode: send this as Authorization: Bearer <token> "
                    "or x-foodpanel-access-token on each request."
                )
            return response

    return _safe_call(_run)


@mcp.tool()
def logout(ctx: Optional[Context] = None) -> Dict[str, Any]:
    """Clear the persisted Foodpanel access token."""

    if _is_stateless_mode(ctx):
        return {"status": "ok", "message": "Stateless mode enabled; no persisted token to clear."}

    def _run() -> Dict[str, Any]:
        with _get_client(ctx=ctx) as client:
            client.logout()
        return {"status": "ok", "message": "Token cleared"}

    return _safe_call(_run)


@mcp.tool()
def log_meal(meal_description: str, date_value: Optional[str] = None, ctx: Optional[Context] = None) -> Dict[str, Any]:
    """
    Log a meal from natural language text.

    Args:
        meal_description: Meal text like "2 eggs and toast for breakfast".
        date_value: Optional ISO date/datetime.
    """

    return _safe_call(lambda: _with_client(lambda c: c.log_meal(meal_description, date_value=date_value), ctx=ctx))


@mcp.tool()
def get_day_logs(day: str, ctx: Optional[Context] = None) -> List[Dict[str, Any]]:
    """
    Get logs for a single day.

    Args:
        day: ISO date string (YYYY-MM-DD).
    """

    return _safe_call(lambda: _with_client(lambda c: c.get_day_logs(day), ctx=ctx))


@mcp.tool()
def get_day_intake(day: str, ctx: Optional[Context] = None) -> Dict[str, Any]:
    """
    Get nutrient intake totals for a single day based on user requirements.

    Args:
        day: ISO date string (YYYY-MM-DD).
    """

    return _safe_call(lambda: _with_client(lambda c: c.get_day_intake(day), ctx=ctx))


@mcp.tool()
def get_progress_stats(start_date: str, end_date: str, ctx: Optional[Context] = None) -> Dict[str, Any]:
    """
    Get averaged nutrient intake across a date range.

    Args:
        start_date: ISO date string (YYYY-MM-DD).
        end_date: ISO date string (YYYY-MM-DD).
    """

    return _safe_call(lambda: _with_client(lambda c: c.get_progress_stats(start_date, end_date), ctx=ctx))


@mcp.tool()
def list_custom_foods(ctx: Optional[Context] = None) -> List[Dict[str, Any]]:
    """List current user's custom foods."""

    return _safe_call(lambda: _with_client(lambda c: c.list_custom_foods(), ctx=ctx))


@mcp.tool()
def add_custom_food(
    name: str,
    nutrients: Optional[List[Dict[str, Any]]] = None,
    ctx: Optional[Context] = None,
) -> Dict[str, Any]:
    """
    Add a custom food.

    Args:
        name: Display name for the food.
        nutrients: Optional nutrient list, e.g. [{"nutrient_id": 1003, "amount": 25}].
    """

    return _safe_call(lambda: _with_client(lambda c: c.add_custom_food(name, nutrients or []), ctx=ctx))


@mcp.tool()
def edit_custom_food(
    food_id: str,
    name: Optional[str] = None,
    nutrients: Optional[List[Dict[str, Any]]] = None,
    ctx: Optional[Context] = None,
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
        with _get_client(ctx=ctx) as client:
            if name is not None:
                updates["name_update"] = client.update_custom_food_name(food_id, name)
            if nutrients is not None:
                updates["nutrient_update"] = client.update_custom_food_nutrients(food_id, nutrients)
        updates["status"] = "success"
        return updates

    return _safe_call(_run)


@mcp.tool()
def list_recipes(ctx: Optional[Context] = None) -> Dict[str, Any]:
    """List current user's recipes."""

    return _safe_call(lambda: _with_client(lambda c: c.list_recipes(), ctx=ctx))


@mcp.tool()
def create_recipe(name: str, ingredients: List[Dict[str, Any]], ctx: Optional[Context] = None) -> Dict[str, Any]:
    """
    Create a recipe.

    Args:
        name: Recipe name.
        ingredients: Ingredient list with food_id/food_name, amount, weight_in_grams.
    """

    return _safe_call(lambda: _with_client(lambda c: c.create_recipe(name, ingredients), ctx=ctx))


@mcp.tool()
def rename_recipe(recipe_id: str, name: str, ctx: Optional[Context] = None) -> Dict[str, Any]:
    """Rename a recipe."""

    return _safe_call(lambda: _with_client(lambda c: c.rename_recipe(recipe_id, name), ctx=ctx))


@mcp.tool()
def set_recipe_serving_size(
    recipe_id: str,
    serving_size_label: str,
    serving_size_grams: float,
    ctx: Optional[Context] = None,
) -> Dict[str, Any]:
    """Set serving size label and gram weight for a recipe."""

    return _safe_call(
        lambda: _with_client(
            lambda c: c.update_recipe_serving_size(recipe_id, serving_size_label, serving_size_grams),
            ctx=ctx,
        )
    )


@mcp.tool()
def add_recipe_ingredient(
    recipe_id: str,
    food_name: str,
    amount: str,
    weight_in_grams: Optional[float] = None,
    food_id: Optional[str] = None,
    ctx: Optional[Context] = None,
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
            ),
            ctx=ctx,
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
    ctx: Optional[Context] = None,
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
            ),
            ctx=ctx,
        )
    )


@mcp.tool()
def delete_recipe(recipe_id: str, ctx: Optional[Context] = None) -> Dict[str, Any]:
    """Delete a recipe by ID."""

    return _safe_call(lambda: _with_client(lambda c: c.delete_recipe(recipe_id), ctx=ctx))


T = TypeVar("T")


def _with_client(fn: Callable[[FoodpanelClient], T], *, ctx: Optional[Context] = None) -> T:
    with _get_client(ctx=ctx) as client:
        return fn(client)


def streamable_http_app():
    """ASGI app for remote MCP deployment (e.g., Modal)."""

    return mcp.streamable_http_app()


def main_http() -> None:
    mcp.run(transport="streamable-http")


def main() -> None:
    transport = os.getenv(TRANSPORT_ENV, "stdio").strip().lower()
    if transport in {"streamable-http", "streamable_http", "http"}:
        mcp.run(transport="streamable-http")
        return
    if transport == "sse":
        mcp.run(transport="sse")
        return
    mcp.run()


if __name__ == "__main__":
    main()
