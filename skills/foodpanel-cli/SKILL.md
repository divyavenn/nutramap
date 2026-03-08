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
| Add a new requirement | `foodpanel --json req add --nutrient-id <ID> --target <N> --direction <min\|max>` |
| Edit an existing requirement | `foodpanel --json req edit --nutrient-id <ID> --target <N> --direction <min\|max>` |
| Change which nutrient a requirement tracks | `foodpanel --json req edit --nutrient-id <OLD_ID> --new-nutrient-id <NEW_ID> --target <N> --direction <min\|max>` |
| Remove a requirement | `foodpanel --json req remove --nutrient-id <ID>` |

`--direction min` = must meet or exceed target. `--direction max` = must stay below target.

Run `req list` first if you don't know the nutrient ID. The output includes `nutrient_id` for each requirement.

### Custom Foods

| When to use | Command |
|---|---|
| See all custom foods | `foodpanel --json food list` |
| Create a new custom food | `foodpanel --json food add --name "Name" --nutrients-json '<JSON>'` |
| Edit a custom food's name or nutrients | `foodpanel --json food edit --food-id "<ID>" --name "New Name" --nutrients-json '<JSON>'` |

Run `food list` first when the user doesn't provide an ID — get `_id` from the output.

### Recipes

| When to use | Command |
|---|---|
| See all recipes | `foodpanel --json recipe list` |
| Create a recipe | `foodpanel --json recipe add --name "Name" --ingredients-json '<JSON>'` |
| Rename or resize a recipe | `foodpanel --json recipe edit --recipe-id "<ID>" --name "New Name" --serving-size-label "1 bowl" --serving-size-grams 320` |
| Delete a recipe | `foodpanel --json recipe remove --recipe-id "<ID>"` |

Run `recipe list` first when the user doesn't provide an ID — get `_id` from the output.
For `recipe edit`, all fields except `--recipe-id` are optional — only pass what needs to change.

> **Note:** To add or edit individual ingredients within a recipe, switch to the MCP skill (`foodpanel-agent`) which has `add_recipe_ingredient` and `edit_recipe_ingredient` tools. There is no CLI equivalent.

---

## Nutritionist Workflows

These workflows turn the agent into a proactive nutritionist — reasoning over goals, trends, and the user's recipe library to make practical, personalized recommendations.

### Daily Gap Analysis

The full procedure is defined in **Viewing a Day's Logs** above. That procedure runs automatically after every day view — it is not a separate opt-in step.

---

### Ground Rules

- **Always pull goals before advising.** Run `foodpanel --json req list` first. If no requirements are set, ask the user about their health goals before proceeding.
- **Ask about dietary restrictions once per session.** At the start of any nutritionist workflow, ask: *"Do you have any dietary restrictions or preferences I should know about (e.g., vegetarian, gluten-free, no dairy)?"* Then respect these throughout all suggestions.
- **Rank gaps by severity.** A nutrient at 20% of target is more urgent than one at 80%. Prioritize the largest gaps.
- **Be specific and actionable.** Don't say "eat more protein." Say "Adding 2 tbsp of hemp seeds to your morning smoothie would add ~10g of protein."
- **You do the reasoning.** The CLI returns raw numbers. You interpret them, compare to goals, and form recommendations using your nutritional knowledge.

---

### Workflow 1: Nutritional Gap Analysis

Use when the user asks: *"How am I doing?"* / *"What am I missing?"* / *"What should I eat more of?"*

**Steps:**
1. `foodpanel --json req list` — get all requirements (targets + directions).
2. `foodpanel --json avg` — get 30-day averages, or use `stats progress --start ... --end ...` for a custom window. Last 7–14 days is usually most actionable.
3. For each requirement, compare average intake to target:
   - **Under `min` target**: gap = target − average. Flag as deficit.
   - **Over `max` target**: excess = average − target. Flag as excess.
4. Rank by severity (% off target).
5. Present a concise summary: top 2–3 deficits, any excesses, one-line context each.

**Example output framing:**
> Based on your last 7 days, your biggest gaps are:
> - **Iron**: averaging 8mg vs. your 18mg goal (44% of target)
> - **Fiber**: averaging 18g vs. your 25g goal (72% of target)
> Your sodium is above your 2300mg limit at ~2800mg/day.

---

### Workflow 2: Recipe Recommendations (Which to Make More)

Use when the user asks: *"Which of my recipes should I eat more of?"* / *"What should I cook this week to hit my goals?"*

**Steps:**
1. Run gap analysis (Workflow 1) to identify top nutrient deficits.
2. `foodpanel --json recipe list` — get all saved recipes and their ingredient lists.
3. For each recipe, reason about its nutritional profile from the ingredients using your nutritional knowledge. If you need measured data for a recent instance, run `foodpanel --json logs YYYY-MM-DD` to find when it was last logged, then `foodpanel --json nutrition <LOG_ID>`.
4. Score each recipe by how well it addresses the top deficits.
5. Recommend the top 2–3 recipes, explaining which deficit each addresses and how often to eat it.
6. If no existing recipe strongly covers a key deficit, say so and move to Workflow 4 (food recommendations).

**Example output framing:**
> To close your iron and fiber gaps, I'd prioritize:
> - **Lentil soup** (3×/week) — lentils are one of the best plant-based iron sources, and the recipe has ~9g fiber per serving.
> - **Spinach stir-fry** (2×/week) — adds meaningful iron; pair with something vitamin C-rich to boost absorption.

---

### Workflow 3: Recipe Modifications (How to Improve a Recipe)

Use when the user asks: *"How can I improve this recipe?"* / *"Can you make my chili higher in protein?"* / *"What would I change to hit my fiber goal?"*

**Steps:**
1. Identify the target recipe (ask if unclear).
2. `foodpanel --json recipe list` — find the recipe and note its ingredients.
3. Run gap analysis (Workflow 1) if not done, or focus on the specific nutrient mentioned.
4. For each deficient nutrient, identify:
   - Which existing ingredients contribute to it (and could be increased in quantity).
   - Which ingredients could be swapped for a denser alternative.
   - Which new ingredients could be added without disrupting the dish.
5. Propose 1–3 concrete changes, ordered by impact. For each, name the change, state the nutritional benefit, and note any taste/texture impact.
6. Ask if the user wants to apply the changes. If yes, recommend they switch to the MCP skill for `add_recipe_ingredient` / `edit_recipe_ingredient`, or offer to do it now if the MCP is available.

**Practical substitution patterns:**
- Low protein → add legumes, Greek yogurt, hemp seeds, tofu, or edamame; swap refined grains for quinoa or lentils
- Low fiber → add vegetables, beans, oats, chia/flax seeds; swap white grains for whole grains
- Low iron → add lentils, spinach, pumpkin seeds, tofu; pair with vitamin C for absorption
- Low calcium → add dairy, fortified plant milk, tahini, white beans, kale
- Low omega-3 → add walnuts, flax/chia seeds, fatty fish, hemp seeds
- High sodium → reduce added salt, swap canned goods for low-sodium versions, use herbs/acid instead
- High saturated fat → swap butter for olive oil, reduce cheese, use leaner proteins

**Example output framing:**
> Your chili averages 18g protein per serving. To hit your 30g target:
> 1. **Add 1 can of black beans** (+7g protein, +8g fiber, minimal flavor change)
> 2. **Swap ground beef for 90/10 lean beef or turkey** (+3g protein, −5g sat fat)
> Want me to update the recipe with these changes?

---

### Workflow 4: Food Recommendations (What to Add to Your Diet)

Use when the user asks: *"What foods should I eat more of?"* / *"What can I add to my diet?"* / *"I'm low on X, what should I eat?"*

**Steps:**
1. Run gap analysis (Workflow 1) if not already done.
2. If not yet asked this session: *"Any dietary restrictions or preferences I should keep in mind?"*
3. For each top deficit nutrient, run:
   ```bash
   foodpanel --json food top --nutrient-id <id> --limit 20
   ```
   If calories are a constraint, use the ratio form:
   ```bash
   foodpanel --json food top --nutrient-id <id> --per-nutrient-id 1008 --limit 20
   ```
   Filter results against dietary restrictions and practical serving sizes.
4. Group suggestions by meal context (breakfast additions, easy snacks, dinner staples) for actionability.
5. Cross-reference with the user's existing recipes (`foodpanel --json recipe list`): if a top food appears in one of their saved recipes, point that out and recommend making it more often.

**Example output framing:**
> You're low on calcium (averaging 600mg vs. your 1000mg goal). Since you're dairy-free, here are practical sources:
> - **Fortified oat milk** (300mg/cup) — easy swap in smoothies or cereal
> - **Tahini** (130mg/2 tbsp) — add to sauces, dressings, or hummus
> - **White beans** (130mg/½ cup) — works in soups, salads, or your existing minestrone recipe
> - **Kale** (100mg/cup cooked) — add to stir-fries or smoothies
>
> Your minestrone already uses white beans — making that 2–3×/week would meaningfully close the gap.

---

### Workflow 5: Daily Check-In

Use when the user asks: *"How did I do today?"* / *"What should I eat for dinner to round out the day?"*

This executes the same **Viewing a Day's Logs** procedure defined in the Command Map section. Since the user is explicitly asking, add a brief narrative intro before the progress table and weight suggestions toward dinner/snack options if it's late in the day.

---

## Meal Logging Clarification Rules

1. Ask follow-ups only when critical fields are missing (portion, key preparation method, or date/time when ambiguous).
2. Ask one concise question at a time.
3. If the user says "just log it", proceed with minimal assumptions and state them clearly.
4. Map relative time words to explicit dates before logging (`today` → current date, `yesterday` → prior date, etc.).
5. Never silently invent meal components.

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
