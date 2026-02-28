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
2. If `session_info.has_access_token == false`, ask the user for Foodpanel credentials before any protected operation.
3. After receiving credentials, call `login(username, password)` and continue only on success.
4. If any protected tool returns 401/403 or auth error, stop and ask the user to re-authenticate with `login`.
5. Never echo passwords back in chat output.
6. Use MCP tools as the primary execution path for all Foodpanel actions.
7. Do not use CLI commands if MCP tools are available and functioning.
8. Use CLI only as explicit fallback when MCP is unavailable, and clearly state that fallback is being used.
9. Return structured summaries with IDs so follow-up edits are deterministic.
10. For edits, read current items first (`list_custom_foods` or `list_recipes`) when the user does not provide an ID.
11. If a workflow uses the `foodpanel` CLI instead of MCP tools, pass `--json` for machine-readable output.
12. For meal logging, follow the strict clarification protocol below before calling `log_meal`.

## Auth Prompt Script

Use this exact style when auth is needed:

1. `I need to sign in to Foodpanel before I can do that. Please share your Foodpanel email/username.`
2. `Please share your Foodpanel password.`
3. After `login` succeeds: `Signed in. Proceeding with your request now.`

## Tool Map

1. Session/Auth: `session_info`, `login`, `logout`
2. Meals and logs: `log_meal`, `get_day_logs`, `get_day_intake`, `get_progress_stats`
3. Custom foods: `list_custom_foods`, `add_custom_food`, `edit_custom_food`
4. Recipes: `list_recipes`, `create_recipe`, `rename_recipe`, `set_recipe_serving_size`, `add_recipe_ingredient`, `edit_recipe_ingredient`, `delete_recipe`

## CLI Fallback (Only If MCP Unavailable)

Use these exact command formats:

1. Meal log:
   - `foodPanel --json log "one small cup vegan chilli"`
   - The meal description must be a single quoted argument.
2. Today:
   - `foodpanel --json today`
3. Yesterday:
   - `foodpanel --json yesterday`
4. Date logs:
   - `foodpanel --json logs 2026-02-26`

Do not use `foodpanel help log --json` (invalid ordering). Use `foodpanel help` or `foodpanel log --help`.

## Execution Patterns

### Log a meal

1. Extract required fields from user text:
   - food items/components
   - portion/amount for each component
   - meal date/time
2. Ask clarifying questions only for missing critical fields:
   - missing portion or quantity
   - ambiguous preparation that changes nutrition significantly (fried vs baked, milk type, etc.)
   - missing date/time when user intent is not clearly "now/today"
3. Once enough detail exists, provide a one-message confirmation summary:
   - what will be logged
   - date/time assumption
4. Wait for user confirmation if assumptions were made.
5. Call `log_meal(meal_description, date_value?)`.
6. Return a post-log summary with:
   - what was logged
   - any assumptions used
   - optional next action (`get_day_logs` for verification).

### Clarification Rules (Strict)

1. Do not ask unnecessary follow-ups if key fields are already present.
2. Ask one concise question at a time when possible.
3. If the user says "just log it", proceed with minimal assumptions and clearly state them.
4. If user gives relative time words, map to explicit date in responses:
   - today
   - yesterday
   - this morning/tonight
5. Never silently invent meal components.

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
7. Delete recipe: `delete_recipe(recipe_id)`.

## Data Shape Hints

- `nutrients` shape: `[{"nutrient_id": 1003, "amount": 25.0}]`
- `ingredients` shape: `[{"food_id": 170903, "amount": "1 cup", "weight_in_grams": 244}]`

If `food_id` is unknown, include `food_name` and let Foodpanel match where supported.
