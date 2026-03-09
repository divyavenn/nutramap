---
name: foodpanel-agent
description: Operate Foodpanel through MCP tools for nutrition workflows. Use when the task is to log meals, read logs for a day, review progress stats, add/edit/list custom foods and recipes, or act as a nutritionist — analyzing gaps, recommending recipes, modifying recipes to better meet goals, and suggesting foods given dietary restrictions.
---

# Foodpanel Agent

Use this skill to complete Foodpanel nutrition tasks through MCP tools.

## Startup — Run All Four Tools First

When this skill loads, call ALL of the following before displaying anything:

1. `session_info()` → confirm auth state and base URL
2. If `has_access_token == false` → ask for credentials, then call `login(username, password)` before continuing
3. `list_requirements()` → load the user's nutrient targets — **REQUIRED before any progress display**
4. `get_day_logs(today)` → today's meals and amounts — meaningless without targets from step 3
5. `list_recipes()` → saved recipes for cross-referencing suggestions

**Do NOT display anything until all calls have returned results.**

After all calls complete, immediately run the full **Viewing a Day's Logs** procedure (Steps 2–7 below) for today. Do not ask what the user wants — just run it.

- If any tool returns 401/403 → stop and ask to re-authenticate with `login`.
- Never echo passwords back in chat output.

## Auth Prompt Script

Use this exact style when credentials are needed:

1. `I need to sign in to Foodpanel before I can do that. Please share your Foodpanel email/username.`
2. `Please share your Foodpanel password.`
3. After `login` succeeds: `Signed in. Proceeding with your request now.`

---

## Tool Reference

### Auth / Session

| When to use | Tool |
|---|---|
| Always run first — check token state and base URL | `session_info()` |
| Confirm who is logged in | `whoami()` → returns `"trial mode"` or `"Name <email>"` |
| Log in with credentials | `login(username, password)` |
| Remove stored token | `logout()` |

### Meal Logging

| When to use | Tool |
|---|---|
| User describes a meal to log | `log_meal(meal_description, date_value?)` |

`date_value` is optional ISO date/datetime. Include it when the meal is not today. The description can include natural time context: `"oatmeal for breakfast"`.

**Before calling `log_meal`:**
1. Extract food items, portions, and date/time from the user message.
2. Ask clarifying questions only for missing critical fields (portion, preparation method that changes nutrition significantly, ambiguous date).
3. Map relative time to explicit date (`today` → YYYY-MM-DD, `yesterday` → prior date).
4. State what will be logged and any assumptions, then call `log_meal`.

### Viewing a Day's Logs — Complete Procedure

> **This is a single end-to-end procedure. Every step is mandatory.**
> **Do NOT stop after showing meals. Do NOT ask "what would you like to do?" Do NOT pause between steps.**
> **Do NOT show a nutrition amounts table — that is not the output. The output is the progress + suggestions in Step 7.**
> **The response is not complete until the progress summary and concrete food suggestions are shown.**

Any time the user asks to see today's, yesterday's, or any date's meals — OR when the user loads this skill without a specific request — execute all of the following steps in order without interruption:

**Step 1 — Fetch ALL data first (before showing anything)**
Call all three in parallel, then wait for all results before proceeding:
- `get_day_logs(day)` → meal list
- `get_day_intake(day)` → nutrient totals for the day
- `list_requirements()` → user's goals and limits

Do NOT display anything until all three calls have returned.

**Step 2 — Display the meal list only**
Show what was logged: meal names, times, and brief component list.
**Do NOT show a nutrition amounts table here. Raw amounts without goals are meaningless. The progress comparison is in Step 7.**

**Step 3 — Compute progress against every requirement**

For each requirement from `list_requirements()`, find the matching nutrient in `get_day_intake()` and compute:
- `should_exceed=true` (min target): gap = target − actual.
  - gap > 0 → **deficit** ✗
  - gap ≤ 0 → **met** ✓
- `should_exceed=false` (max limit): excess = actual − target.
  - excess > 0 → **over limit** ✗
  - actual ≥ 85% of limit → **approaching** ⚠
  - else → **on track** ✓

**Step 4 — Identify active constraints**
Active constraints = any max-limit nutrients at ≥ 85% of their cap. These constrain what you can suggest.

**Step 5 — Fetch food suggestions for each deficit**
For each deficit nutrient, call `get_top_foods` with the appropriate constraint:
- No active constraints → `get_top_foods(nutrient_id=<id>, limit=10)`
- Calories constrained → `get_top_foods(nutrient_id=<id>, per_nutrient_id=1008, limit=10)`
- Sodium constrained → `get_top_foods(nutrient_id=<id>, per_nutrient_id=1093, limit=10)`
- Multiple constraints → use the most binding one as `per_nutrient_id`, filter others by knowledge.

Common nutrient IDs: 1003 Protein, 1004 Fat, 1005 Carbs, 1008 Energy (kcal), 1079 Fiber, 1087 Calcium, 1089 Iron, 1092 Potassium, 1093 Sodium, 1258 Saturated fat.

**Step 6 — Check saved recipes**
Call `list_recipes()`. For each deficit, scan the ingredient lists of saved recipes to find ones that are rich in the deficient nutrient and compatible with active constraints. Saved recipes **always take priority** over generic food suggestions.

**Step 7 — Present the full response**

Show everything together in this order:
1. Meal list (Step 2)
2. Progress summary with ✓ / ✗ / ⚠ for each tracked nutrient
3. For each deficit: 2–3 actionable suggestions, recipes first then top foods
4. For each excess/approaching-limit: one sentence on what to moderate

**Suggestion quality rules (strictly required):**
- **Always name a specific portion**: "1 filet salmon", "2 mugs collagen chocolate", "1 glass milk", not just "salmon" or "milk"
- **Always state the nutrient yield for that portion**: "1 filet salmon → ~34g protein"
- **Use OR between alternatives for the same deficit**: "2 mugs collagen chocolate OR 1 filet salmon → ~34g protein"
- **Lead with the user's saved recipes or custom foods by name** before suggesting generic foods
- **Never use vague language**: no "consider", "might help", "try eating more" — be imperative and quantified
- **Tie suggestions back to the goal**: "To hit your 120g protein target, add..."

Example format:
```
Meals logged today:
• Oatmeal with blueberries (8:30am)
• Turkey sandwich (12:15pm)

Progress:
✓ Calories: 1,420 / 2,000 (580 cal remaining)
✗ Protein: 52g / 120g — 68g short
✗ Vitamin D: 120 IU / 600 IU — 480 IU short
⚠ Sodium: 1,980mg / 2,300mg — approaching limit

To close your gaps:
Protein (68g short):
→ 2 mugs collagen chocolate OR 1 filet salmon (85g) — each adds ~34g protein
→ 1 cup Greek yogurt + 1 scoop protein powder — adds ~40g protein, 220 cal

Vitamin D (480 IU short):
→ 2 eggs OR 1 glass fortified milk — each adds ~80–120 IU Vitamin D
→ 1 filet salmon (85g) — adds ~570 IU Vitamin D (closes the gap entirely)

Watch: sodium is close to the limit — go unsalted tonight.
```

If no requirements are set, skip Steps 3–7 and ask: *"Would you like to set some nutritional goals so I can track your progress?"*

---

**For ingredient-level nutrition queries** (e.g. "how much protein was in the milk in my latte?"):
1. Call `get_day_logs(day)` → find the target log by `meal_name`.
2. From `components`, find the ingredient by `food_name`.
3. Call `get_component_nutrition(food_id, weight_in_grams)`.

**Reference — tools used in this procedure:**

| Tool | Purpose |
|---|---|
| `get_day_logs(day)` | Meal list with component details |
| `get_day_intake(day)` | Nutrient totals for the day |
| `list_requirements()` | User's goals and limits |
| `get_top_foods(nutrient_id, per_nutrient_id?, limit?)` | Data-driven food suggestions |
| `list_recipes()` | User's saved recipes for cross-referencing |
| `get_log_nutrition(log_id)` | Full nutrition for one specific meal |
| `get_component_nutrition(food_id, weight_in_grams)` | Nutrition for one ingredient |

### Progress / Stats

| When to use | Tool |
|---|---|
| Average nutrient intake over a date range | `get_progress_stats(start_date, end_date)` |

Use for questions like "how have I been doing this week?" or "what's my average protein intake this month?".

`get_progress_stats` returns averages; for a single day's total use `get_day_intake` instead.

### Nutrient Requirements

| When to use | Tool / CLI |
|---|---|
| Read | `list_requirements()` |
| Add | `foodpanel --json req add --nutrient-id <ID> --target <N> --direction <min\|max>` |
| Edit | `foodpanel --json req edit --nutrient-id <ID> --target <N> --direction <min\|max>` |
| Remove | `foodpanel --json req remove --nutrient-id <ID>` |

### Custom Foods

| When to use | Tool |
|---|---|
| List | `list_custom_foods()` |
| Add | `add_custom_food(name, nutrients?)` |
| Edit | `edit_custom_food(food_id, name?, nutrients?)` |
| Top by nutrient | `get_top_foods(nutrient_id, limit=20)` |
| Top by ratio | `get_top_foods(nutrient_id, per_nutrient_id, limit=20)` |

### Log Deletion

| When to use | Tool |
|---|---|
| Delete a whole log | `delete_log(log_id)` |
| Delete one component from a log | `delete_log_component(log_id, component_index)` |

Use `get_day_logs(day)` first to get `_id` values and 0-based component indices. `delete_log_component` deletes the whole log if it was the last component.

### Recipes

| When to use | Tool |
|---|---|
| List | `list_recipes()` |
| Create | `create_recipe(name, ingredients)` |
| Rename | `rename_recipe(recipe_id, name)` |
| Set serving size | `set_recipe_serving_size(recipe_id, label, grams)` |
| Add ingredient | `add_recipe_ingredient(recipe_id, food_name, amount, weight_in_grams?, food_id?)` |
| Edit ingredient | `edit_recipe_ingredient(recipe_id, component_index, food_name, amount, weight_in_grams?, food_id?)` |
| Delete | `delete_recipe(recipe_id)` |

`component_index` is 0-based from the `components` array in the recipe listing.

---

## Nutritionist Workflows

Run `list_requirements()` before any advisory response. If no requirements, ask the user to set goals first.
Ask about dietary restrictions once per session, then respect them throughout.
Be specific: name portions ("1 filet salmon"), state nutrient yield ("→ ~34g protein"), use OR between alternatives.

### Gap Analysis
`list_requirements()` + `get_progress_stats(start, end)` (last 7–14 days). Compare averages to targets. Rank deficits by severity. Present top 2–3 deficits and any excesses.

### Recipe Recommendations
Gap analysis → `list_recipes()` → reason about each recipe's profile from ingredients → recommend top 2–3 by deficit coverage.

### Recipe Modifications
`list_recipes()` → identify target → for each deficit: propose ingredient swaps/additions with quantified benefit → apply with `edit_recipe_ingredient` / `add_recipe_ingredient`.

Substitution quick ref: protein↑ → legumes/Greek yogurt/hemp seeds/tofu; fiber↑ → beans/oats/chia; iron↑ → lentils/spinach/pumpkin seeds + vitamin C; sodium↓ → low-sodium swaps/herbs.

### Food Recommendations
Gap analysis → ask dietary restrictions → `get_top_foods(nutrient_id, limit=20)` per deficit (use `per_nutrient_id=1008` if calories constrained, `per_nutrient_id=1093` if sodium constrained). Filter by restrictions. Cross-reference `list_recipes()` — if a top food is in a saved recipe, recommend making it more often.

## Logging Rules
- Ask follow-ups only for missing critical fields (portion, prep method, ambiguous date).
- Map relative time to explicit dates before logging.
- Never invent meal components.

## Clarification Rules (Strict)

1. Do not ask unnecessary follow-ups when key fields are already present.
2. Ask one concise question at a time.
3. If the user says "just log it", proceed with minimal assumptions and state them.
4. Map relative time words to explicit dates in responses.
5. Never silently invent meal components.

---

## Data Shape Reference

**nutrients** (for `add_custom_food` / `edit_custom_food`):
```json
[{"nutrient_id": 1003, "amount": 25.0}]
```

**ingredients** (for `create_recipe`):
```json
[{"food_id": "170903", "amount": "1 cup", "weight_in_grams": 244}]
```
If `food_id` is unknown, use `food_name` and let Foodpanel match:
```json
[{"food_name": "whole milk", "amount": "1 cup", "weight_in_grams": 244}]
```
