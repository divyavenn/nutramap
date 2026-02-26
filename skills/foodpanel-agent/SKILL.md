---
name: foodpanel-agent
description: Operate Foodpanel through MCP tools for nutrition workflows. Use when the task is to log meals, read logs for a day, review progress stats, or add/edit/list custom foods and recipes in Foodpanel.
---

# Foodpanel Agent

Use this skill to complete Foodpanel nutrition tasks through MCP tools instead of direct HTTP calls.

## MCP Startup

Run the server with `foodpanel-mcp`.

## Operating Rules

1. Start with `session_info`.
2. If no token is available, call `login` before any protected operation.
3. Prefer tool calls over manual calculations for logs, intake, or progress.
4. Return structured summaries with IDs so follow-up edits are deterministic.
5. For edits, read current items first (`list_custom_foods` or `list_recipes`) when the user does not provide an ID.

## Tool Map

1. Session/Auth: `session_info`, `login`, `logout`
2. Meals and logs: `log_meal`, `get_day_logs`, `get_day_intake`, `get_progress_stats`
3. Custom foods: `list_custom_foods`, `add_custom_food`, `edit_custom_food`
4. Recipes: `list_recipes`, `create_recipe`, `rename_recipe`, `set_recipe_serving_size`, `add_recipe_ingredient`, `edit_recipe_ingredient`

## Execution Patterns

### Log a meal

1. Call `log_meal(meal_description, date_value?)`.
2. If response is asynchronous/processing, inform the user and offer to fetch logs for confirmation.

### Read logs and progress

1. For a specific day, call `get_day_logs(day)`.
2. For nutrient totals on that day, call `get_day_intake(day)`.
3. For range progress, call `get_progress_stats(start_date, end_date)`.

### Manage custom foods

1. List: `list_custom_foods`.
2. Add: `add_custom_food(name, nutrients)`.
3. Edit: `edit_custom_food(food_id, name?, nutrients?)`.

### Manage recipes

1. List: `list_recipes`.
2. Add: `create_recipe(name, ingredients)`.
3. Rename: `rename_recipe(recipe_id, name)`.
4. Serving size: `set_recipe_serving_size(recipe_id, serving_size_label, serving_size_grams)`.
5. Add ingredient: `add_recipe_ingredient(...)`.
6. Edit ingredient: `edit_recipe_ingredient(...)`.

## Data Shape Hints

- `nutrients` shape: `[{"nutrient_id": 1003, "amount": 25.0}]`
- `ingredients` shape: `[{"food_id": 170903, "amount": "1 cup", "weight_in_grams": 244}]`

If `food_id` is unknown, include `food_name` and let Foodpanel match where supported.
