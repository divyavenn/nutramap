from __future__ import annotations

import argparse
import getpass
import json
import sys
from datetime import date, timedelta
from typing import Any, Dict, List

from .client import FoodpanelClient
from .errors import FoodpanelError


EXAMPLES_TEXT = """Foodpanel CLI examples

Auth:
  foodpanel auth login
  foodpanel auth login --username you@example.com
  foodpanel auth logout

Meals and logs:
  foodPanel log "2 eggs and toast for breakfast yesterday"
  foodpanel log "chicken salad at 1pm"
  foodpanel today
  foodpanel yesterday
  foodpanel meal log --text "2 eggs and toast"
  foodpanel meal log --text "chicken salad" --date 2026-02-26
  foodpanel logs day --date 2026-02-26

Progress stats:
  foodpanel avg
  foodpanel stats progress --start 2026-02-20 --end 2026-02-26

Custom foods:
  foodpanel food list
  foodpanel food add --name "Protein Shake" --nutrients-json '[{"nutrient_id":1003,"amount":25}]'
  foodpanel food edit-nutrients --food-id <FOOD_ID> --nutrients-json '[{"nutrient_id":1003,"amount":30}]'

Recipes:
  foodpanel recipe list
  foodpanel recipe add --name "Egg Toast" --ingredients-json '[{"food_id":170903,"amount":"2 eggs","weight_in_grams":100}]'
  foodpanel recipe rename --recipe-id <RECIPE_ID> --name "Egg Toast Deluxe"

Global options:
  foodpanel --base-url https://your-api-url <command>
  foodpanel --token <JWT> <command>
  foodpanel --no-config <command>
"""


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="foodpanel", description="CLI for Foodpanel API.")
    parser.add_argument("--base-url", help="Foodpanel API base URL (e.g. http://localhost:8000)")
    parser.add_argument("--token", help="Override bearer token for this invocation")
    parser.add_argument("--config-path", help="Path to config file (default: ~/.foodpanel/config.json)")
    parser.add_argument("--no-config", action="store_true", help="Disable config persistence")

    subparsers = parser.add_subparsers(dest="resource", required=True)

    # help
    subparsers.add_parser("help", help="Show command examples")

    # top-level quick log
    log_parser = subparsers.add_parser("log", help="Log a free-form meal entry (date/time inferred from text)")
    log_parser.add_argument("entry", help='Free-form log text, e.g. "2 eggs and toast for breakfast yesterday"')
    log_parser.add_argument("--json", action="store_true")

    # top-level shortcuts
    subparsers.add_parser("today", help="Show today's logs and intake totals")
    subparsers.add_parser("yesterday", help="Show yesterday's logs and intake totals")
    subparsers.add_parser("avg", help="Show average intake stats for the past 30 days")

    # auth
    auth_parser = subparsers.add_parser("auth", help="Authentication commands")
    auth_sub = auth_parser.add_subparsers(dest="action", required=True)
    auth_login = auth_sub.add_parser("login", help="Login and persist token")
    auth_login.add_argument("--username", help="Email/username. If omitted, prompt interactively.")
    auth_login.add_argument("--password", help="Password. If omitted, prompt interactively.")
    auth_sub.add_parser("logout", help="Remove stored token")

    # meal
    meal_parser = subparsers.add_parser("meal", help="Meal logging commands")
    meal_sub = meal_parser.add_subparsers(dest="action", required=True)
    meal_log = meal_sub.add_parser("log", help="Log a meal from text")
    meal_log.add_argument("--text", required=True, help="Meal description")
    meal_log.add_argument("--date", help="Optional ISO date/datetime")
    meal_log.add_argument("--json", action="store_true")

    # logs
    logs_parser = subparsers.add_parser("logs", help="Read logs")
    logs_sub = logs_parser.add_subparsers(dest="action", required=True)
    logs_day = logs_sub.add_parser("day", help="Get logs for a day")
    logs_day.add_argument("--date", required=True, help="YYYY-MM-DD")
    logs_day.add_argument("--json", action="store_true")

    # stats
    stats_parser = subparsers.add_parser("stats", help="Progress stats")
    stats_sub = stats_parser.add_subparsers(dest="action", required=True)
    stats_progress = stats_sub.add_parser("progress", help="Get range intake averages")
    stats_progress.add_argument("--start", required=True, help="YYYY-MM-DD")
    stats_progress.add_argument("--end", required=True, help="YYYY-MM-DD")
    stats_progress.add_argument("--json", action="store_true")

    # food
    food_parser = subparsers.add_parser("food", help="Custom food operations")
    food_sub = food_parser.add_subparsers(dest="action", required=True)
    food_list = food_sub.add_parser("list", help="List custom foods")
    food_list.add_argument("--json", action="store_true")
    food_add = food_sub.add_parser("add", help="Add custom food")
    food_add.add_argument("--name", required=True)
    food_add.add_argument(
        "--nutrients-json",
        default="[]",
        help='JSON list like \'[{"nutrient_id":1003,"amount":25}]\'',
    )
    food_add.add_argument("--json", action="store_true")
    food_edit = food_sub.add_parser("edit-nutrients", help="Edit custom food nutrients")
    food_edit.add_argument("--food-id", required=True)
    food_edit.add_argument("--nutrients-json", required=True)
    food_edit.add_argument("--json", action="store_true")

    # recipes
    recipe_parser = subparsers.add_parser("recipe", help="Recipe operations")
    recipe_sub = recipe_parser.add_subparsers(dest="action", required=True)
    recipe_list = recipe_sub.add_parser("list", help="List recipes")
    recipe_list.add_argument("--json", action="store_true")
    recipe_add = recipe_sub.add_parser("add", help="Create recipe")
    recipe_add.add_argument("--name", required=True)
    recipe_add.add_argument(
        "--ingredients-json",
        required=True,
        help='JSON list like \'[{"food_id":170903,"amount":"1 cup","weight_in_grams":244}]\'',
    )
    recipe_add.add_argument("--json", action="store_true")
    recipe_rename = recipe_sub.add_parser("rename", help="Rename recipe")
    recipe_rename.add_argument("--recipe-id", required=True)
    recipe_rename.add_argument("--name", required=True)
    recipe_rename.add_argument("--json", action="store_true")

    return parser


def _json_list(raw: str) -> List[Dict[str, Any]]:
    parsed = json.loads(raw)
    if not isinstance(parsed, list):
        raise ValueError("Expected a JSON list.")
    return parsed


def _print(data: Any, as_json: bool = True) -> None:
    if as_json:
        print(json.dumps(data, indent=2, default=str))
    else:
        print(data)


def _client_from_args(args: argparse.Namespace) -> FoodpanelClient:
    client = FoodpanelClient(
        base_url=args.base_url,
        access_token=args.token,
        config_path=args.config_path,
        persist_session=not args.no_config,
    )
    return client


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
                    username = args.username or input("Username/email: ").strip()
                    if not username:
                        raise ValueError("Username is required.")

                    password = args.password or getpass.getpass("Password: ")
                    if not password:
                        raise ValueError("Password is required.")

                    result = client.login(username, password, persist=not args.no_config)
                    _print(
                        {
                            "status": "ok",
                            "token_type": result.get("token_type"),
                            "base_url": client.base_url,
                        }
                    )
                    return 0
                if args.action == "logout":
                    client.logout()
                    _print({"status": "ok", "message": "Token cleared"})
                    return 0

            if args.resource == "log":
                result = client.log_entry(args.entry)
                _print(result, as_json=True)
                return 0

            if args.resource == "today":
                day = date.today().isoformat()
                result = {
                    "date": day,
                    "logs": client.get_day_logs(day),
                    "intake": client.get_day_intake(day),
                }
                _print(result, as_json=True)
                return 0

            if args.resource == "yesterday":
                day = (date.today() - timedelta(days=1)).isoformat()
                result = {
                    "date": day,
                    "logs": client.get_day_logs(day),
                    "intake": client.get_day_intake(day),
                }
                _print(result, as_json=True)
                return 0

            if args.resource == "avg":
                end_day = date.today()
                start_day = end_day - timedelta(days=29)
                result = {
                    "start_date": start_day.isoformat(),
                    "end_date": end_day.isoformat(),
                    "average_intake": client.get_progress_stats(start_day.isoformat(), end_day.isoformat()),
                }
                _print(result, as_json=True)
                return 0

            if args.resource == "meal" and args.action == "log":
                result = client.log_meal(args.text, date_value=args.date)
                _print(result, as_json=True)
                return 0

            if args.resource == "logs" and args.action == "day":
                result = client.get_day_logs(args.date)
                _print(result, as_json=True)
                return 0

            if args.resource == "stats" and args.action == "progress":
                result = client.get_progress_stats(args.start, args.end)
                _print(result, as_json=True)
                return 0

            if args.resource == "food":
                if args.action == "list":
                    result = client.list_custom_foods()
                    _print(result, as_json=True)
                    return 0
                if args.action == "add":
                    nutrients = _json_list(args.nutrients_json)
                    result = client.add_custom_food(args.name, nutrients)
                    _print(result, as_json=True)
                    return 0
                if args.action == "edit-nutrients":
                    nutrients = _json_list(args.nutrients_json)
                    result = client.update_custom_food_nutrients(args.food_id, nutrients)
                    _print(result, as_json=True)
                    return 0

            if args.resource == "recipe":
                if args.action == "list":
                    result = client.list_recipes()
                    _print(result, as_json=True)
                    return 0
                if args.action == "add":
                    ingredients = _json_list(args.ingredients_json)
                    result = client.create_recipe(args.name, ingredients)
                    _print(result, as_json=True)
                    return 0
                if args.action == "rename":
                    result = client.rename_recipe(args.recipe_id, args.name)
                    _print(result, as_json=True)
                    return 0

            parser.error("Unsupported command")
            return 2
    except (FoodpanelError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
