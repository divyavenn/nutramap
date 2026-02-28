---
name: foodpanel-cli
description: Operate Foodpanel through CLI commands (not MCP). Use when the task is to log meals, read logs for a day, review progress stats, or add/edit/list requirements, custom foods, and recipes using the Foodpanel CLI.
---

# Foodpanel CLI Agent

Use this skill to complete Foodpanel workflows through CLI commands only.

## Execution Mode

1. Use `foodpanel`/`foodPanel` CLI as the primary and only execution path.
2. Do not call MCP tools in this skill.
3. Prefer `--json` on all commands so outputs are machine-readable.
4. Prefer non-interactive flags (`--name`, `--recipe-id`, etc.) over prompt-driven flows.
5. Return concise summaries with IDs after each write operation.

If `foodpanel` is not on `PATH`, run via project entrypoint:
- `uv run foodpanel ...`

## Startup Check

Run this quick health check first:
- `foodpanel --json today`

If it fails with auth/401/403, follow the auth flow below.

## Auth Flow

1. Tell the user to open a new Terminal and run `foodpanel auth login` and confirm when finished
2. When the user confirms, run the startup check again.

Logout command:
- `foodpanel --json auth logout`

## Command Map

### Meals and daily views

- Log meal:
  - `foodpanel --json log "<meal description>"`
- Today:
  - `foodpanel --json today`
- Yesterday:
  - `foodpanel --json yesterday`
- Specific date:
  - `foodpanel --json logs YYYY-MM-DD`

### Progress

- Date range stats:
  - `foodpanel --json stats progress --start YYYY-MM-DD --end YYYY-MM-DD`

### Requirements

- List:
  - `foodpanel --json req list`
- Add:
  - `foodpanel --json req add --nutrient-id 1003 --target 25 --direction min`
- Edit:
  - `foodpanel --json req edit --nutrient-id 1003 --target 30 --direction min`
- Remove:
  - `foodpanel --json req remove --nutrient-id 1003`

### Custom foods

- List:
  - `foodpanel --json food list`
- Add:
  - `foodpanel --json food add --name "Food Name" --nutrients-json '[{"nutrient_id":1003,"amount":25}]'`
- Edit:
  - `foodpanel --json food edit --food-id "<FOOD_ID>" --name "New Name" --nutrients-json '[{"nutrient_id":1003,"amount":30}]'`

### Recipes

- List:
  - `foodpanel --json recipe list`
- Create:
  - `foodpanel --json recipe add --name "Recipe Name" --ingredients-json '[{"food_id":"170903","amount":"1 cup","weight_in_grams":244}]'`
- Edit (name and/or serving size):
  - `foodpanel --json recipe edit --recipe-id "<RECIPE_ID>" --name "New Name" --serving-size-label "1 bowl" --serving-size-grams 320`
- Delete:
  - `foodpanel --json recipe remove --recipe-id "<RECIPE_ID>"`

## Meal Logging Clarification Rules

1. Ask follow-ups only when required fields are missing (portion, key preparation details, or date/time intent).
2. Ask one concise question at a time.
3. If user says "just log it", proceed with minimal assumptions and state them.
4. Map relative time words to explicit dates in your response (`today`, `yesterday`, etc.).
5. Do not invent meal components.

## Data Shape Hints

- Nutrients JSON: `[{"nutrient_id":1003,"amount":25.0}]`
- Ingredients JSON: `[{"food_id":"170903","amount":"1 cup","weight_in_grams":244}]`
