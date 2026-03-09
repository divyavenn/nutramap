---
name: foodpanel-cli
description: Operate Foodpanel through CLI commands (not MCP). Use when the task is to log meals, read logs for a day, review progress stats, add/edit/list requirements, custom foods, and recipes, or act as a nutritionist — analyzing gaps, recommending recipes, suggesting modifications, and advising on foods given dietary restrictions.
---

# Foodpanel CLI Agent

Use this skill to complete Foodpanel workflows through CLI commands only.

## Execution Mode

1. Use `foodpanel`/`foodPanel` CLI as the primary and only execution path.
2. Do not call MCP tools in this skill.
3. Always pass `--json` so outputs are machine-readable.
4. Prefer non-interactive flags (`--name`, `--recipe-id`, etc.) over prompt-driven flows.
5. Return concise summaries with IDs after each write operation.

If `foodpanel` is not on `PATH`, run via project entrypoint:
- `uv run foodpanel ...`

## Startup — Single Chained Command

When this skill loads, run this **single bash command** (all four at once, before displaying anything):

```bash
foodpanel whoami; echo "=== REQUIREMENTS ==="; foodpanel --json req list; echo "=== TODAY ==="; foodpanel --json today; echo "=== RECIPES ==="; foodpanel --json recipe list
```

This is ONE bash call. Do not split it into separate calls. Do not display anything until this single command finishes.

Parse the four sections from the output:
- `whoami` result → auth state
- `=== REQUIREMENTS ===` section → nutrient targets (REQUIRED for progress computation)
- `=== TODAY ===` section → today's meals and raw amounts
- `=== RECIPES ===` section → saved recipes

After the command completes, immediately run the full **Viewing a Day's Logs** procedure (Steps 2–7 below). Do not ask what the user wants.

## Auth Flow

**Login:**
Tell the user to open a new Terminal and run:
```bash
foodpanel auth login
```
When they confirm it completed, run the startup check again.

**Logout:**
```bash
foodpanel --json auth logout
```

**whoami (two equivalent forms):**
```bash
foodpanel whoami
foodpanel auth whoami
```

---

## Command Map

### Identity

| When to use | Command |
|---|---|
| Check who is logged in, confirm auth state | `foodpanel whoami` |

### Meal Logging

| When to use | Command |
|---|---|
| User describes a meal to log (any date/time) | `foodpanel --json log "<description>"` |

The description can include date/time context naturally: `"2 eggs and toast yesterday morning"`.

### Viewing a Day's Logs — Complete Procedure

> **This is a single end-to-end procedure. Every step is mandatory.**
> **Do NOT stop after showing meals. Do NOT ask "what would you like to do?" Do NOT pause between steps.**
> **Do NOT show a nutrition amounts table — that is not the output. The output is the progress + suggestions in Step 7.**
> **The response is not complete until the progress summary and concrete food suggestions are shown.**

Any time the user asks to see today's, yesterday's, or any date's meals — OR when the user loads this skill without a specific request — execute all of the following steps in order without interruption:

**Step 1 — Fetch ALL data first (before showing anything)**
Run all three commands, then wait for all results before proceeding:
```bash
foodpanel --json today          # (or yesterday / logs YYYY-MM-DD)
foodpanel --json req list
foodpanel --json recipe list
```
Do NOT display anything until all three commands have returned. The `today`/`logs` output has meal list and raw nutrient amounts. `req list` has targets. `recipe list` has saved recipes. All three are required.

**Step 2 — Display the meal list only**
Show what was logged: meal names, times, and brief component list.
**Do NOT show a nutrition amounts table here. Raw amounts without goals are meaningless. The progress comparison is in Step 7.**

**Step 3 — Compute progress against every requirement**
For each requirement from `req list`, find the matching nutrient in the day's stats:
- `should_exceed=true` (min target): gap = target − actual.
  - gap > 0 → **deficit** ✗
  - gap ≤ 0 → **met** ✓
- `should_exceed=false` (max limit): excess = actual − target.
  - excess > 0 → **over limit** ✗
  - actual ≥ 85% of limit → **approaching** ⚠
  - else → **on track** ✓

**Step 4 — Identify active constraints**
Active constraints = any max-limit nutrients at ≥ 85% of their cap. These restrict what you can recommend.

**Step 5 — Fetch food suggestions for each deficit**
For each deficit nutrient, call:
```bash
foodpanel --json food top --nutrient-id <id> --limit 10
```
If calories are constrained (≥85% of max), use the ratio form instead:
```bash
foodpanel --json food top --nutrient-id <id> --per-nutrient-id 1008 --limit 10
```
If sodium is constrained, use `--per-nutrient-id 1093`.

Common nutrient IDs: 1003 Protein, 1004 Fat, 1005 Carbs, 1008 Energy (kcal), 1079 Fiber, 1087 Calcium, 1089 Iron, 1092 Potassium, 1093 Sodium, 1258 Saturated fat.

**Step 6 — Cross-reference saved recipes**
Scan the ingredient lists from `recipe list` for recipes rich in the deficient nutrient and compatible with active constraints. Saved recipes **always take priority** over generic food suggestions.

**Step 7 — Present the full response (do NOT ask first — just do it)**
Show everything together in this order:
1. Meal list (Step 2)
2. Progress summary with ✓ / ✗ / ⚠ for each tracked nutrient
3. For each deficit: 2–3 actionable suggestions, recipes first then top foods
4. For each excess/approaching-limit: one sentence on what to moderate

**Do NOT ask "Want suggestions?" or "Would you like recommendations?" — always include them automatically.**

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

For per-meal nutrition detail, use: `foodpanel --json nutrition <LOG_ID>` (get `_id` from the logs output).

### Progress / Stats

| When to use | Command |
|---|---|
| Quick 30-day average summary | `foodpanel --json avg` |
| Custom date range averages | `foodpanel --json stats progress --start YYYY-MM-DD --end YYYY-MM-DD` |

Use `avg` when the user asks about recent trends or "how am I doing". Use `stats progress` for specific ranges like "last week" or "this month".

### Nutrient Requirements

| When to use | Command |
|---|---|
| See all set requirements | `foodpanel --json req list` |
| Add | `foodpanel --json req add --nutrient-id <ID> --target <N> --direction <min\|max>` |
| Edit | `foodpanel --json req edit --nutrient-id <ID> --target <N> --direction <min\|max>` |
| Change nutrient | `foodpanel --json req edit --nutrient-id <OLD> --new-nutrient-id <NEW> --target <N> --direction <min\|max>` |
| Remove | `foodpanel --json req remove --nutrient-id <ID>` |

`--direction min` = meet/exceed. `--direction max` = stay below. Run `req list` first to get IDs.

### Custom Foods

| When to use | Command |
|---|---|
| List | `foodpanel --json food list` |
| Add | `foodpanel --json food add --name "Name" --nutrients-json '<JSON>'` |
| Edit | `foodpanel --json food edit --food-id "<ID>" --name "Name" --nutrients-json '<JSON>'` |
| Delete | `foodpanel --json food remove --food-id "<ID>"` |
| Top by nutrient | `foodpanel --json food top --nutrient-id <ID> --limit 20` |
| Top by ratio | `foodpanel --json food top --nutrient-id <ID> --per-nutrient-id <ID> --limit 20` |

Run `food list` first when the user doesn't provide an ID.

### Log Deletion

| When to use | Command |
|---|---|
| Delete a whole log entry | `foodpanel --json log-delete --log-id "<ID>"` |
| Delete one ingredient from a log | `foodpanel --json log-delete-component --log-id "<ID>" --component-index <N>` |

Run `foodpanel --json today` (or `logs YYYY-MM-DD`) first to get `_id` values and component indices.
`log-delete-component` deletes the whole log if it was the last component.

### Recipes

| When to use | Command |
|---|---|
| List | `foodpanel --json recipe list` |
| Add | `foodpanel --json recipe add --name "Name" --ingredients-json '<JSON>'` |
| Edit name/serving | `foodpanel --json recipe edit --recipe-id "<ID>" --name "Name" --serving-size-label "1 bowl" --serving-size-grams 320` |
| Delete | `foodpanel --json recipe remove --recipe-id "<ID>"` |

`recipe edit` fields other than `--recipe-id` are optional. To add/edit individual ingredients, use the MCP skill (`foodpanel-agent`).

---

## Nutritionist Workflows

Run `req list` before any advisory response. If no requirements, ask the user to set goals first.
Ask about dietary restrictions once per session, then respect them throughout.
Be specific: name portions ("1 filet salmon"), state nutrient yield ("→ ~34g protein"), use OR between alternatives.

### Gap Analysis
`req list` + `avg` (or `stats progress`). Compare averages to targets. Rank deficits by severity (% of target). Present top 2–3 deficits and any excesses.

### Recipe Recommendations
Gap analysis → `recipe list` → reason about each recipe's nutritional profile from ingredients → recommend top 2–3 by how well they address deficits.

### Recipe Modifications
`recipe list` → identify target recipe → for each deficit: propose ingredient swaps or additions with quantified benefit → ask if user wants changes applied (MCP skill for ingredient edits).

Substitution quick ref: protein↑ → legumes/Greek yogurt/hemp seeds/tofu; fiber↑ → beans/oats/chia; iron↑ → lentils/spinach/pumpkin seeds + vitamin C; sodium↓ → low-sodium swaps/herbs.

### Food Recommendations
Gap analysis → ask dietary restrictions → for each deficit:
```bash
foodpanel --json food top --nutrient-id <id> --limit 20          # absolute
foodpanel --json food top --nutrient-id <id> --per-nutrient-id 1008 --limit 20  # calorie-efficient
```
Filter by restrictions. Cross-reference `recipe list` — if a top food is in a saved recipe, recommend making it more often.

## Logging Rules
- Ask follow-ups only for missing critical fields (portion, prep method, ambiguous date).
- Map relative time to explicit dates before logging.
- Never invent meal components.

---

## Data Shape Reference

**Nutrients JSON** (for `food add` / `food edit`):
```json
[{"nutrient_id": 1003, "amount": 25.0}]
```

**Ingredients JSON** (for `recipe add`):
```json
[{"food_id": "170903", "amount": "1 cup", "weight_in_grams": 244}]
```
If `food_id` is unknown, omit it and use `food_name` instead — Foodpanel will match:
```json
[{"food_name": "whole milk", "amount": "1 cup", "weight_in_grams": 244}]
```
