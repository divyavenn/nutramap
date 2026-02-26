from __future__ import annotations

import argparse
import getpass
import json
import sys
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from .client import FoodpanelClient
from .errors import FoodpanelError


EXAMPLES_TEXT = """Foodpanel CLI examples

Auth:
  foodpanel auth login
  foodpanel auth logout

Quick logging:
  foodPanel log "2 eggs and toast for breakfast yesterday"
  foodpanel log "chicken salad at 1pm"

Daily views:
  foodpanel today
  foodpanel yesterday
  foodpanel logs 2026-02-26

Averages:
  foodpanel avg
  foodpanel stats progress --start 2026-02-20 --end 2026-02-26

Custom foods (interactive):
  foodpanel food add
  foodpanel food edit
  foodpanel food list

Recipes (interactive):
  foodpanel recipe add
  foodpanel recipe edit
  foodpanel recipe list
"""


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="foodpanel", description="CLI for Foodpanel API.")
    parser.add_argument("--base-url", help="Foodpanel API base URL")
    parser.add_argument("--token", help="Override bearer token for this invocation")
    parser.add_argument("--config-path", help="Path to config file (default: ~/.foodpanel/config.json)")
    parser.add_argument("--no-config", action="store_true", help="Disable config persistence")

    subparsers = parser.add_subparsers(dest="resource", required=True)

    subparsers.add_parser("help", help="Show command examples")

    log_parser = subparsers.add_parser("log", help="Log free-form entry (date/time inferred from text)")
    log_parser.add_argument("entry", help='Free-form log text, e.g. "2 eggs and toast yesterday"')

    subparsers.add_parser("today", help="Show today's logs + stats")
    subparsers.add_parser("yesterday", help="Show yesterday's logs + stats")

    logs_parser = subparsers.add_parser("logs", help="Show logs + stats for a date")
    logs_parser.add_argument("date", nargs="?", help="YYYY-MM-DD (if omitted, prompt)")

    subparsers.add_parser("avg", help="Show average stats for the past 30 days")

    auth_parser = subparsers.add_parser("auth", help="Authentication commands")
    auth_sub = auth_parser.add_subparsers(dest="action", required=True)
    auth_login = auth_sub.add_parser("login", help="Login and persist token")
    auth_login.add_argument("--username", help="Email/username (if omitted, prompt)")
    auth_login.add_argument("--password", help="Password (if omitted, prompt securely)")
    auth_sub.add_parser("logout", help="Remove stored token")

    stats_parser = subparsers.add_parser("stats", help="Progress stats")
    stats_sub = stats_parser.add_subparsers(dest="action", required=True)
    stats_progress = stats_sub.add_parser("progress", help="Get range intake averages")
    stats_progress.add_argument("--start", required=True, help="YYYY-MM-DD")
    stats_progress.add_argument("--end", required=True, help="YYYY-MM-DD")

    food_parser = subparsers.add_parser("food", help="Custom food operations")
    food_sub = food_parser.add_subparsers(dest="action", required=True)
    food_sub.add_parser("list", help="List custom foods")
    food_add = food_sub.add_parser("add", help="Add custom food")
    food_add.add_argument("--name", help="Food name (if omitted, prompt)")
    food_add.add_argument("--nutrients-json", help='JSON list like \'[{"nutrient_id":1003,"amount":25}]\'')
    food_edit = food_sub.add_parser("edit", help="Edit custom food")
    food_edit.add_argument("--food-id", help="Food ID (if omitted, prompt)")
    food_edit.add_argument("--name", help="New name (optional)")
    food_edit.add_argument("--nutrients-json", help="New nutrients JSON list (optional)")

    recipe_parser = subparsers.add_parser("recipe", help="Recipe operations")
    recipe_sub = recipe_parser.add_subparsers(dest="action", required=True)
    recipe_sub.add_parser("list", help="List recipes")
    recipe_add = recipe_sub.add_parser("add", help="Create recipe")
    recipe_add.add_argument("--name", help="Recipe name (if omitted, prompt)")
    recipe_add.add_argument("--ingredients-json", help="Ingredients JSON list (if omitted, prompt)")
    recipe_edit = recipe_sub.add_parser("edit", help="Edit recipe")
    recipe_edit.add_argument("--recipe-id", help="Recipe ID (if omitted, prompt)")
    recipe_edit.add_argument("--name", help="New recipe name (optional)")
    recipe_edit.add_argument("--serving-size-label", help='Serving label, e.g. "1 bowl"')
    recipe_edit.add_argument("--serving-size-grams", type=float, help="Serving weight in grams")

    return parser


def _json_list(raw: str) -> List[Dict[str, Any]]:
    parsed = json.loads(raw)
    if not isinstance(parsed, list):
        raise ValueError("Expected a JSON list.")
    return parsed


def _prompt_required(label: str) -> str:
    value = input(label).strip()
    if not value:
        raise ValueError("Required value missing.")
    return value


def _prompt_optional(label: str) -> Optional[str]:
    value = input(label).strip()
    return value or None


def _client_from_args(args: argparse.Namespace) -> FoodpanelClient:
    return FoodpanelClient(
        base_url=args.base_url,
        access_token=args.token,
        config_path=args.config_path,
        persist_session=not args.no_config,
    )


def _print(data: Any) -> None:
    print(json.dumps(data, indent=2, default=str))


def _daily_payload(client: FoodpanelClient, day: str) -> Dict[str, Any]:
    return {
        "date": day,
        "logs": client.get_day_logs(day),
        "stats": client.get_day_intake(day),
    }


def main(argv: List[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        if args.resource == "help":
            print(EXAMPLES_TEXT)
            return 0

        with _client_from_args(args) as client:
            if args.resource == "auth":
                if args.action == "login":
                    username = args.username or _prompt_required("Username/email: ")
                    password = args.password or getpass.getpass("Password: ")
                    if not password:
                        raise ValueError("Password is required.")
                    result = client.login(username, password, persist=not args.no_config)
                    _print({"status": "ok", "token_type": result.get("token_type"), "base_url": client.base_url})
                    return 0
                if args.action == "logout":
                    client.logout()
                    _print({"status": "ok", "message": "Token cleared"})
                    return 0

            if args.resource == "log":
                _print(client.log_entry(args.entry))
                return 0

            if args.resource == "today":
                _print(_daily_payload(client, date.today().isoformat()))
                return 0

            if args.resource == "yesterday":
                _print(_daily_payload(client, (date.today() - timedelta(days=1)).isoformat()))
                return 0

            if args.resource == "logs":
                day = args.date or _prompt_required("Date (YYYY-MM-DD): ")
                _print(_daily_payload(client, day))
                return 0

            if args.resource == "avg":
                end_day = date.today()
                start_day = end_day - timedelta(days=29)
                _print(
                    {
                        "start_date": start_day.isoformat(),
                        "end_date": end_day.isoformat(),
                        "average_stats": client.get_progress_stats(start_day.isoformat(), end_day.isoformat()),
                    }
                )
                return 0

            if args.resource == "stats" and args.action == "progress":
                _print(client.get_progress_stats(args.start, args.end))
                return 0

            if args.resource == "food":
                if args.action == "list":
                    _print(client.list_custom_foods())
                    return 0
                if args.action == "add":
                    name = args.name or _prompt_required("Food name: ")
                    nutrients_raw = args.nutrients_json
                    if nutrients_raw is None:
                        nutrients_raw = input('Nutrients JSON list (or blank for []): ').strip() or "[]"
                    nutrients = _json_list(nutrients_raw)
                    _print(client.add_custom_food(name, nutrients))
                    return 0
                if args.action == "edit":
                    food_id = args.food_id or _prompt_required("Food ID: ")
                    name = args.name
                    nutrients_raw = args.nutrients_json

                    if name is None and nutrients_raw is None:
                        if input("Edit name? (y/N): ").strip().lower() == "y":
                            name = _prompt_optional("New name (blank to skip): ")
                        if input("Edit nutrients? (y/N): ").strip().lower() == "y":
                            nutrients_raw = _prompt_required("Nutrients JSON list: ")

                    if name is None and nutrients_raw is None:
                        raise ValueError("No food edits provided.")

                    result: Dict[str, Any] = {"food_id": food_id, "status": "success"}
                    if name is not None:
                        result["name_update"] = client.update_custom_food_name(food_id, name)
                    if nutrients_raw is not None:
                        result["nutrient_update"] = client.update_custom_food_nutrients(food_id, _json_list(nutrients_raw))
                    _print(result)
                    return 0

            if args.resource == "recipe":
                if args.action == "list":
                    _print(client.list_recipes())
                    return 0
                if args.action == "add":
                    name = args.name or _prompt_required("Recipe name: ")
                    ingredients_raw = args.ingredients_json or _prompt_required("Ingredients JSON list: ")
                    _print(client.create_recipe(name, _json_list(ingredients_raw)))
                    return 0
                if args.action == "edit":
                    recipe_id = args.recipe_id or _prompt_required("Recipe ID: ")
                    name = args.name
                    label = args.serving_size_label
                    grams = args.serving_size_grams

                    if name is None and label is None and grams is None:
                        if input("Edit recipe name? (y/N): ").strip().lower() == "y":
                            name = _prompt_optional("New recipe name: ")
                        if input("Edit serving size? (y/N): ").strip().lower() == "y":
                            label = _prompt_optional('Serving size label (e.g. "1 bowl"): ')
                            grams_raw = _prompt_optional("Serving size grams: ")
                            grams = float(grams_raw) if grams_raw else None

                    if label is not None and grams is None:
                        grams = float(_prompt_required("Serving size grams: "))
                    if grams is not None and label is None:
                        label = _prompt_required('Serving size label (e.g. "1 bowl"): ')

                    if name is None and (label is None or grams is None):
                        raise ValueError("No recipe edits provided.")

                    result: Dict[str, Any] = {"recipe_id": recipe_id, "status": "success"}
                    if name is not None:
                        result["name_update"] = client.rename_recipe(recipe_id, name)
                    if label is not None and grams is not None:
                        result["serving_size_update"] = client.update_recipe_serving_size(recipe_id, label, grams)
                    _print(result)
                    return 0

            parser.error("Unsupported command")
            return 2
    except (FoodpanelError, ValueError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
