from __future__ import annotations

import argparse
import getpass
import json
import sys
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from .client import FoodpanelClient
from .errors import FoodpanelError

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table

    HAVE_RICH = True
except Exception:
    HAVE_RICH = False
    Console = None  # type: ignore[assignment]
    Panel = None  # type: ignore[assignment]
    Table = None  # type: ignore[assignment]

console = Console() if HAVE_RICH else None


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

Requirements (interactive):
  foodpanel req list
  foodpanel req add
  foodpanel req edit
  foodpanel req remove

Custom foods (interactive):
  foodpanel food add
  foodpanel food edit
  foodpanel food list

Recipes (interactive):
  foodpanel recipe add
  foodpanel recipe edit
  foodpanel recipe remove
  foodpanel recipe list
"""


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="foodpanel", description="CLI for Foodpanel API.")
    parser.add_argument("--base-url", help="Foodpanel API base URL")
    parser.add_argument("--token", help="Override bearer token for this invocation")
    parser.add_argument("--timeout", type=float, help="HTTP timeout in seconds (default: FOODPANEL_TIMEOUT_SECONDS or 90)")
    parser.add_argument("--config-path", help="Path to config file (default: ~/.foodpanel/config.json)")
    parser.add_argument("--no-config", action="store_true", help="Disable config persistence")
    parser.add_argument("--json", action="store_true", help="Force JSON output")
    parser.add_argument("--plain", action="store_true", help="Force plain text output (no rich formatting)")

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

    req_parser = subparsers.add_parser("req", help="Nutrient requirement operations")
    req_sub = req_parser.add_subparsers(dest="action", required=True)
    req_sub.add_parser("list", help="List nutrient requirements")

    req_add = req_sub.add_parser("add", help="Add requirement")
    req_add.add_argument("--nutrient-id", type=int, help="Nutrient ID (if omitted, prompt)")
    req_add.add_argument("--target", type=float, help="Target amount (if omitted, prompt)")
    req_add.add_argument(
        "--direction",
        choices=["min", "max"],
        help="min=meet/exceed target, max=stay below target (if omitted, prompt)",
    )

    req_edit = req_sub.add_parser("edit", help="Edit requirement")
    req_edit.add_argument("--nutrient-id", type=int, help="Existing nutrient ID (if omitted, prompt)")
    req_edit.add_argument("--new-nutrient-id", type=int, help="Optional replacement nutrient ID")
    req_edit.add_argument("--target", type=float, help="New target amount (if omitted, prompt)")
    req_edit.add_argument(
        "--direction",
        choices=["min", "max"],
        help="min=meet/exceed target, max=stay below target (if omitted, prompt)",
    )

    req_remove = req_sub.add_parser("remove", help="Remove requirement")
    req_remove.add_argument("--nutrient-id", type=int, help="Nutrient ID to remove (if omitted, prompt)")

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
    recipe_remove = recipe_sub.add_parser("remove", help="Delete recipe")
    recipe_remove.add_argument("--recipe-id", help="Recipe ID (if omitted, prompt)")

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


def _prompt_bool_direction(label: str) -> bool:
    raw = _prompt_required(label).strip().lower()
    if raw in {"min", "1", "true", "exceed", "above"}:
        return True
    if raw in {"max", "0", "false", "below"}:
        return False
    raise ValueError("Direction must be 'min' or 'max'.")


def _client_from_args(args: argparse.Namespace) -> FoodpanelClient:
    return FoodpanelClient(
        base_url=args.base_url,
        access_token=args.token,
        timeout=args.timeout,
        config_path=args.config_path,
        persist_session=not args.no_config,
    )


def _print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, default=str))


def _daily_payload(client: FoodpanelClient, day: str) -> Dict[str, Any]:
    return {
        "date": day,
        "logs": client.get_day_logs(day),
        "stats": client.get_day_intake(day),
    }


def _print_food_list_human(foods: List[Dict[str, Any]], *, plain: bool = False) -> None:
    if not foods:
        print("No custom foods found.")
        return

    if HAVE_RICH and not plain and console is not None:
        table = Table(title="Custom Foods")
        table.add_column("Food", style="cyan")
        table.add_column("Nutrients", style="white")

        for food in foods:
            food_name = str(food.get("display_name") or food.get("name") or "Unknown food").strip()
            nutrient_details = food.get("nutrient_details", [])
            if isinstance(nutrient_details, list) and nutrient_details:
                nutrient_lines = []
                for item in nutrient_details:
                    if not isinstance(item, dict):
                        continue
                    n_name = item.get("nutrient_name", f"Nutrient {item.get('nutrient_id')}")
                    amt = item.get("amount")
                    unit = item.get("unit", "")
                    unit_part = f" {unit}" if unit else ""
                    nutrient_lines.append(f"{n_name}: {amt}{unit_part}")
                nutrient_cell = "\n".join(nutrient_lines) if nutrient_lines else "No nutrients"
            else:
                nutrient_cell = "No nutrients"
            table.add_row(food_name, nutrient_cell)
        console.print(table)
        return

    for food in foods:
        food_name = str(food.get("display_name") or food.get("name") or "Unknown food").strip()
        nutrient_details = food.get("nutrient_details", [])
        print(f"{food_name}:")

        if not isinstance(nutrient_details, list) or not nutrient_details:
            print("  - No nutrients")
            continue

        for item in nutrient_details:
            if not isinstance(item, dict):
                continue
            name = item.get("nutrient_name", f"Nutrient {item.get('nutrient_id')}")
            amount = item.get("amount")
            unit = item.get("unit", "")
            unit_part = f" {unit}" if unit else ""
            print(f"  - {name} - {amount}{unit_part}")


def _print_recipe_list_human(recipes_payload: Dict[str, Any], *, plain: bool = False) -> None:
    recipes = recipes_payload.get("recipes", []) if isinstance(recipes_payload, dict) else []
    if not recipes:
        print("No recipes found.")
        return

    if HAVE_RICH and not plain and console is not None:
        table = Table(title="Recipes")
        table.add_column("Recipe", style="cyan")
        table.add_column("Serving", style="magenta")
        table.add_column("Ingredients", style="white")
        table.add_column("Used", justify="right", style="green")

        for recipe in recipes:
            name = str(recipe.get("display_name") or recipe.get("description") or "Unnamed recipe").strip()
            serving = recipe.get("serving_label") or recipe.get("serving_size_label") or "-"
            usage = str(recipe.get("usage_count", 0))
            ingredient_details = recipe.get("ingredient_details") or recipe.get("ingredients") or []
            lines = []
            if isinstance(ingredient_details, list):
                for ing in ingredient_details:
                    if not isinstance(ing, dict):
                        continue
                    label = str(ing.get("food_name") or "Unknown food").strip()
                    amount = ing.get("amount")
                    grams = ing.get("weight_in_grams")
                    amount_part = f", {amount}" if amount else ""
                    grams_part = f", {grams} g" if grams is not None else ""
                    lines.append(f"{label}{amount_part}{grams_part}")
            ingredients_cell = "\n".join(lines) if lines else "No ingredients"
            table.add_row(name, str(serving), ingredients_cell, usage)
        console.print(table)
        return

    for recipe in recipes:
        name = str(recipe.get("display_name") or recipe.get("description") or "Unnamed recipe").strip()
        serving_label = recipe.get("serving_label") or recipe.get("serving_size_label")
        usage_count = recipe.get("usage_count", 0)
        ingredients = recipe.get("ingredient_details") or recipe.get("ingredients") or []

        if serving_label:
            print(f"{name} (serving: {serving_label}, used {usage_count} times)")
        else:
            print(f"{name} (used {usage_count} times)")

        if not isinstance(ingredients, list) or not ingredients:
            print("  - No ingredients")
            continue

        for ing in ingredients:
            food_name = ing.get("food_name")
            amount = ing.get("amount", "")
            grams = ing.get("weight_in_grams")

            if food_name:
                label = str(food_name).strip()
            else:
                label = "Unknown food"

            amount_part = f", {amount}" if amount else ""
            grams_part = f", {grams} g" if grams is not None else ""
            print(f"  - {label}{amount_part}{grams_part}")


def _print_daily_payload(payload: Dict[str, Any], *, plain: bool = False) -> None:
    if HAVE_RICH and not plain and console is not None:
        day = payload.get("date", "")
        logs = payload.get("logs", [])
        stats = payload.get("stats", {})

        console.print(Panel(f"[bold]Date:[/bold] {day}", title="Foodpanel Day Summary"))

        logs_table = Table(title="Logs")
        logs_table.add_column("Meal", style="cyan")
        logs_table.add_column("Time")
        logs_table.add_column("Components", justify="right")
        if isinstance(logs, list) and logs:
            for log in logs:
                meal = str(log.get("meal_name") or "Meal")
                dt = str(log.get("date") or "")
                time_part = dt.split("T")[1][:5] if "T" in dt else dt
                comp_count = len(log.get("components", [])) if isinstance(log.get("components"), list) else 0
                logs_table.add_row(meal, time_part, str(comp_count))
        else:
            logs_table.add_row("No logs", "-", "-")
        console.print(logs_table)

        stats_table = Table(title="Stats")
        stats_table.add_column("Nutrient ID")
        stats_table.add_column("Amount")
        if isinstance(stats, dict) and stats:
            for key, value in stats.items():
                stats_table.add_row(str(key), str(value))
        else:
            stats_table.add_row("-", "No stats")
        console.print(stats_table)
        return

    _print_json(payload)


def _print_avg_payload(payload: Dict[str, Any], *, plain: bool = False) -> None:
    if HAVE_RICH and not plain and console is not None:
        summary = f"{payload.get('start_date')} -> {payload.get('end_date')}"
        console.print(Panel(summary, title="Past 30 Days Average"))
        avg_stats = payload.get("average_stats", {})
        table = Table(title="Average Stats")
        table.add_column("Nutrient ID")
        table.add_column("Average")
        if isinstance(avg_stats, dict) and avg_stats:
            for key, value in avg_stats.items():
                table.add_row(str(key), str(value))
        else:
            table.add_row("-", "No stats")
        console.print(table)
        return

    _print_json(payload)


def _print_requirements(requirements: List[Dict[str, Any]], *, plain: bool = False) -> None:
    if not requirements:
        print("No requirements found.")
        return

    if HAVE_RICH and not plain and console is not None:
        table = Table(title="Nutrient Requirements")
        table.add_column("Nutrient", style="cyan")
        table.add_column("Target", style="white")
        table.add_column("Rule", style="magenta")
        table.add_column("ID", style="green")

        for req in requirements:
            name = req.get("nutrient_name", "Unknown")
            unit = req.get("unit", "")
            target = req.get("target")
            unit_part = f" {unit}" if unit else ""
            rule = ">=" if req.get("should_exceed") else "<="
            table.add_row(str(name), f"{target}{unit_part}", rule, str(req.get("nutrient_id")))
        console.print(table)
        return

    for req in requirements:
        name = req.get("nutrient_name", "Unknown")
        unit = req.get("unit", "")
        target = req.get("target")
        unit_part = f" {unit}" if unit else ""
        rule = "at least" if req.get("should_exceed") else "at most"
        print(f"{name}: {rule} {target}{unit_part} (id: {req.get('nutrient_id')})")


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
                    _print_json({"status": "ok", "token_type": result.get("token_type"), "base_url": client.base_url})
                    return 0
                if args.action == "logout":
                    client.logout()
                    _print_json({"status": "ok", "message": "Token cleared"})
                    return 0

            if args.resource == "log":
                _print_json(client.log_entry(args.entry))
                return 0

            if args.resource == "today":
                payload = _daily_payload(client, date.today().isoformat())
                if args.json:
                    _print_json(payload)
                else:
                    _print_daily_payload(payload, plain=args.plain)
                return 0

            if args.resource == "yesterday":
                payload = _daily_payload(client, (date.today() - timedelta(days=1)).isoformat())
                if args.json:
                    _print_json(payload)
                else:
                    _print_daily_payload(payload, plain=args.plain)
                return 0

            if args.resource == "logs":
                day = args.date or _prompt_required("Date (YYYY-MM-DD): ")
                payload = _daily_payload(client, day)
                if args.json:
                    _print_json(payload)
                else:
                    _print_daily_payload(payload, plain=args.plain)
                return 0

            if args.resource == "avg":
                end_day = date.today()
                start_day = end_day - timedelta(days=29)
                payload = {
                    "start_date": start_day.isoformat(),
                    "end_date": end_day.isoformat(),
                    "average_stats": client.get_progress_stats(start_day.isoformat(), end_day.isoformat()),
                }
                if args.json:
                    _print_json(payload)
                else:
                    _print_avg_payload(payload, plain=args.plain)
                return 0

            if args.resource == "stats" and args.action == "progress":
                _print_json(client.get_progress_stats(args.start, args.end))
                return 0

            if args.resource == "req":
                if args.action == "list":
                    requirements = client.list_requirements()
                    if args.json:
                        _print_json(requirements)
                    else:
                        _print_requirements(requirements, plain=args.plain)
                    return 0

                if args.action == "add":
                    nutrient_id = args.nutrient_id if args.nutrient_id is not None else int(_prompt_required("Nutrient ID: "))
                    target = args.target if args.target is not None else float(_prompt_required("Target amount: "))
                    should_exceed = (
                        (args.direction == "min")
                        if args.direction is not None
                        else _prompt_bool_direction("Direction (min/max): ")
                    )
                    _print_json(client.add_requirement(nutrient_id, target, should_exceed))
                    return 0

                if args.action == "edit":
                    nutrient_id = args.nutrient_id if args.nutrient_id is not None else int(_prompt_required("Current nutrient ID: "))
                    new_nutrient_id = args.new_nutrient_id
                    if new_nutrient_id is None:
                        maybe_new = _prompt_optional("New nutrient ID (blank to keep current): ")
                        new_nutrient_id = int(maybe_new) if maybe_new else None

                    target = args.target if args.target is not None else float(_prompt_required("New target amount: "))
                    should_exceed = (
                        (args.direction == "min")
                        if args.direction is not None
                        else _prompt_bool_direction("Direction (min/max): ")
                    )
                    _print_json(
                        client.edit_requirement(
                            nutrient_id=nutrient_id,
                            target=target,
                            should_exceed=should_exceed,
                            new_nutrient_id=new_nutrient_id,
                        )
                    )
                    return 0

                if args.action == "remove":
                    nutrient_id = args.nutrient_id if args.nutrient_id is not None else int(_prompt_required("Nutrient ID to remove: "))
                    _print_json(client.remove_requirement(nutrient_id))
                    return 0

            if args.resource == "food":
                if args.action == "list":
                    foods = client.list_custom_foods()
                    if args.json:
                        _print_json(foods)
                    else:
                        _print_food_list_human(foods, plain=args.plain)
                    return 0
                if args.action == "add":
                    name = args.name or _prompt_required("Food name: ")
                    nutrients_raw = args.nutrients_json
                    if nutrients_raw is None:
                        nutrients_raw = input('Nutrients JSON list (or blank for []): ').strip() or "[]"
                    nutrients = _json_list(nutrients_raw)
                    _print_json(client.add_custom_food(name, nutrients))
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
                    _print_json(result)
                    return 0

            if args.resource == "recipe":
                if args.action == "list":
                    recipes_payload = client.list_recipes()
                    if args.json:
                        _print_json(recipes_payload)
                    else:
                        _print_recipe_list_human(recipes_payload, plain=args.plain)
                    return 0
                if args.action == "add":
                    name = args.name or _prompt_required("Recipe name: ")
                    ingredients_raw = args.ingredients_json or _prompt_required("Ingredients JSON list: ")
                    _print_json(client.create_recipe(name, _json_list(ingredients_raw)))
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
                    _print_json(result)
                    return 0
                if args.action == "remove":
                    recipe_id = args.recipe_id or _prompt_required("Recipe ID to delete: ")
                    _print_json(client.delete_recipe(recipe_id))
                    return 0

            parser.error("Unsupported command")
            return 2
    except (FoodpanelError, ValueError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
