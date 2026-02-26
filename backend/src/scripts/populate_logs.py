#!/usr/bin/env python3
"""
Populate realistic log data for January and February 2026.
Skips days that already have logs. Run from the backend/ directory:
  .venv/bin/python3 -m src.scripts.populate_logs
"""

import os
import random
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

USER_ID = ObjectId('690097204e02b96ce8148c77')

# ── Recipe/food entries ───────────────────────────────────────────────────────
MEALS = {
    'tea': {
        'recipe_id': '06f1189e-8041-4a85-96ff-46fabd7db67f',
        'meal_name': 'Tea',
        'serving_size_label': '1 mug',
        'servings': 1.0,
        'components': [{'food_id': 174120, 'amount': '1 pot', 'weight_in_grams': 500}],
    },
    'green_tea': {
        'recipe_id': '933b22ad-57b6-4076-8885-5af77226abc7',
        'meal_name': 'Green tea',
        'serving_size_label': '1 cup',
        'servings': 1.0,
        'components': [{'food_id': 171917, 'amount': '1 tsp', 'weight_in_grams': 2}],
    },
    'matcha': {
        'recipe_id': '29c76b0f-0b69-4a07-a9d4-4bbfc647d478',
        'meal_name': 'matcha',
        'serving_size_label': '1 cup',
        'servings': 1.0,
        'components': [
            {'food_id': 174122, 'amount': '1 teaspoon', 'weight_in_grams': 2},
            {'food_id': 174158, 'amount': '1 cup', 'weight_in_grams': 240},
        ],
    },
    'latte': {
        'recipe_id': '7c67e831-775a-4931-affe-f1a7fef3136f',
        'meal_name': 'latte',
        'serving_size_label': '1 cup',
        'servings': 1.0,
        'components': [{'food_id': 172217, 'amount': '1/2 cup', 'weight_in_grams': 120}],
    },
    'hot_choc': {
        'recipe_id': '6de56bc2-bc79-4947-9af2-5c569db9053b',
        'meal_name': 'Hot chocolate',
        'serving_size_label': '1 mug',
        'servings': 1.0,
        'components': [
            {'food_id': 173432, 'amount': '1 cup', 'weight_in_grams': 240},
            {'food_id': 169593, 'amount': '1 tbsp', 'weight_in_grams': 5.5},
            {'food_id': 170674, 'amount': '1 tbsp', 'weight_in_grams': 12.6},
            {'food_id': 173471, 'amount': '1/2 tsp', 'weight_in_grams': 2.5},
            {'food_id': 171255, 'amount': '1 spoon', 'weight_in_grams': 15.0},
        ],
    },
    'smoothie': {
        'recipe_id': '08d1f66e-6e04-41fe-9692-fb4e6e07def6',
        'meal_name': 'Smoothie',
        'serving_size_label': '1 glass',
        'servings': 1.0,
        'components': [
            {'food_id': 173432, 'amount': '1 cup', 'weight_in_grams': 240},
            {'food_id': 174158, 'amount': '1 cup', 'weight_in_grams': 240},
            {'food_id': 169640, 'amount': '1 tbsp', 'weight_in_grams': 21},
        ],
    },
    'scrambled_eggs': {
        'recipe_id': '2373fe8d-5a20-4fcc-9b4d-33e390a08fab',
        'meal_name': 'Scrambled eggs',
        'serving_size_label': '1 plate',
        'servings': 1.0,
        'components': [{'food_id': 169904, 'amount': '2 eggs', 'weight_in_grams': 100}],
    },
    'toast': {
        'recipe_id': '3bb0cd57-536e-4b60-8aa9-320d623dc4fe',
        'meal_name': 'Toast',
        'serving_size_label': '2 slices',
        'servings': 1.0,
        'components': [{'food_id': 172687, 'amount': '2 slices', 'weight_in_grams': 60}],
    },
    'soft_egg': {
        'recipe_id': '6444dea9-6eee-4c42-b6d5-e2474cc4f001',
        'meal_name': 'Soft boiled egg',
        'serving_size_label': '1 egg',
        'servings': 1.0,
        'components': [{'food_id': 172186, 'amount': '1 egg', 'weight_in_grams': 50}],
    },
    'banana': {
        'recipe_id': None,
        'meal_name': 'Bananas, raw',
        'serving_size_label': '1 banana',
        'servings': 1.0,
        'components': [{'food_id': 173944, 'amount': '1 medium', 'weight_in_grams': 118}],
    },
    'strawberries': {
        'recipe_id': '5f1ed152-9aae-4abd-b91c-8ffb4c8dfa86',
        'meal_name': 'Strawberries',
        'serving_size_label': '1 bowl',
        'servings': 1.0,
        'components': [{'food_id': 167762, 'amount': '1 cup', 'weight_in_grams': 152}],
    },
    'spiced_chickpeas': {
        'recipe_id': 'b93e3137-3ad0-4700-a2f7-a8f0aa1cd665',
        'meal_name': 'Spiced chickpeas',
        'serving_size_label': '1 bowl',
        'servings': 1.0,
        'components': [
            {'food_id': 173757, 'amount': '1/2 cup', 'weight_in_grams': 120},
            {'food_id': 171329, 'amount': '1 tsp', 'weight_in_grams': 3},
        ],
    },
    'boureka': {
        'recipe_id': '08869a9d-d8c5-43de-b522-5f328dbba2f5',
        'meal_name': 'Spiced chickpea boureka',
        'serving_size_label': '1 piece',
        'servings': 1.0,
        'components': [
            {'food_id': 173757, 'amount': '1/2 cup', 'weight_in_grams': 120},
            {'food_id': 172791, 'amount': '1 sheet', 'weight_in_grams': 15},
            {'food_id': 170934, 'amount': 'to taste', 'weight_in_grams': 5},
        ],
    },
    'pho': {
        'recipe_id': 'b351b37f-d275-42ad-8217-2c3d0a4d3d3b',
        'meal_name': 'Vegetarian pho',
        'serving_size_label': '1 bowl',
        'servings': 1.0,
        'components': [
            {'food_id': 169742, 'amount': '100 grams', 'weight_in_grams': 100},
            {'food_id': 171583, 'amount': '2 cups', 'weight_in_grams': 480},
            {'food_id': 169254, 'amount': '1 cup', 'weight_in_grams': 70},
            {'food_id': 169222, 'amount': '1 cup', 'weight_in_grams': 100},
            {'food_id': 172232, 'amount': '1/4 cup', 'weight_in_grams': 10},
            {'food_id': 170416, 'amount': '1/4 cup', 'weight_in_grams': 5},
            {'food_id': 168156, 'amount': '1 lime', 'weight_in_grams': 60},
            {'food_id': 168577, 'amount': '1 pepper', 'weight_in_grams': 20},
        ],
    },
    'chicken_curry': {
        'recipe_id': '3a5fcc18-0a46-484f-8f5a-d9ff3b7740b2',
        'meal_name': 'Chicken curry',
        'serving_size_label': '1 bowl',
        'servings': 1.0,
        'components': [
            {'food_id': 171078, 'amount': '4 oz', 'weight_in_grams': 113},
            {'food_id': 170000, 'amount': '1/4 cup', 'weight_in_grams': 40},
            {'food_id': 170456, 'amount': '1/4 cup', 'weight_in_grams': 45},
            {'food_id': 171422, 'amount': '1 tbsp', 'weight_in_grams': 14},
            {'food_id': 170173, 'amount': '1/4 cup', 'weight_in_grams': 60},
        ],
    },
    'rice': {
        'recipe_id': '0cff345a-d94c-4be4-888a-23193686a16a',
        'meal_name': 'Rice',
        'serving_size_label': '1 cup',
        'servings': 1.0,
        'components': [{'food_id': 168882, 'amount': '1 cup', 'weight_in_grams': 158}],
    },
    'pizza': {
        'recipe_id': '8abd8a0d-46b9-4088-89c8-0f4b61c57b42',
        'meal_name': 'Vegetarian pizza',
        'serving_size_label': '1 slice',
        'servings': 1.0,
        'components': [
            {'food_id': 172096, 'amount': '1 medium pizza', 'weight_in_grams': 250},
            {'food_id': 169074, 'amount': '1/2 cup', 'weight_in_grams': 120},
            {'food_id': 170845, 'amount': '1 cup', 'weight_in_grams': 120},
            {'food_id': 169395, 'amount': '1/4 cup', 'weight_in_grams': 30},
            {'food_id': 170000, 'amount': '1/4 cup', 'weight_in_grams': 30},
            {'food_id': 169095, 'amount': '1/4 cup', 'weight_in_grams': 30},
            {'food_id': 169254, 'amount': '1/4 cup', 'weight_in_grams': 20},
        ],
    },
    'samosa': {
        'recipe_id': 'df154f2d-f2cb-4425-8511-f25d141a3029',
        'meal_name': 'Samosa',
        'serving_size_label': '1 piece',
        'servings': 1.0,
        'components': [
            {'food_id': 170049, 'amount': '1 medium', 'weight_in_grams': 150},
            {'food_id': 170420, 'amount': '1/4 cup', 'weight_in_grams': 40},
            {'food_id': 170934, 'amount': '1 tsp', 'weight_in_grams': 3},
            {'food_id': 168944, 'amount': '1 cup', 'weight_in_grams': 120},
            {'food_id': 173576, 'amount': 'for frying', 'weight_in_grams': 100},
        ],
    },
    'beef_broth': {
        'recipe_id': '0aead66b-2299-4971-8bca-acb7e7747c17',
        'meal_name': 'Beef broth',
        'serving_size_label': '1 bowl',
        'servings': 1.0,
        'components': [
            {'food_id': 173383, 'amount': '500 grams', 'weight_in_grams': 500},
            {'food_id': 174158, 'amount': '8 cups', 'weight_in_grams': 1920},
            {'food_id': 169231, 'amount': '1 piece', 'weight_in_grams': 20},
            {'food_id': 170000, 'amount': '2 onions', 'weight_in_grams': 200},
            {'food_id': 169230, 'amount': '5 cloves', 'weight_in_grams': 15},
            {'food_id': 171316, 'amount': '2 pieces', 'weight_in_grams': 5},
            {'food_id': 171849, 'amount': '1 stick', 'weight_in_grams': 5},
            {'food_id': 173468, 'amount': 'to taste', 'weight_in_grams': 5},
        ],
    },
    'mushrooms': {
        'recipe_id': '8a1c8452-a865-4fcf-a070-43f86b2f9bce',
        'meal_name': 'Mushrooms',
        'serving_size_label': '1 side',
        'servings': 1.0,
        'components': [{'food_id': 170097, 'amount': '1/2 cup', 'weight_in_grams': 45}],
    },
    'bamboo': {
        'recipe_id': 'e335ae49-1c0a-4247-9ceb-4f4171497b28',
        'meal_name': 'Bamboo shoots',
        'serving_size_label': '1 side',
        'servings': 1.0,
        'components': [{'food_id': 168497, 'amount': '1/4 cup', 'weight_in_grams': 25}],
    },
}

# ── Day patterns: (hour, minute, meal_key) ────────────────────────────────────
DAY_PATTERNS = [
    # A – Light egg day
    [(8, 0, 'tea'), (8, 30, 'scrambled_eggs'), (9, 0, 'toast'),
     (13, 0, 'spiced_chickpeas'), (16, 0, 'green_tea'), (19, 0, 'pho')],
    # B – Smoothie & curry
    [(7, 30, 'matcha'), (8, 30, 'smoothie'),
     (13, 0, 'chicken_curry'), (13, 5, 'rice'),
     (15, 0, 'strawberries'), (19, 30, 'pizza')],
    # C – Warm/cozy
    [(8, 0, 'hot_choc'), (9, 0, 'soft_egg'), (9, 5, 'toast'),
     (13, 0, 'samosa'), (16, 0, 'tea'),
     (19, 0, 'beef_broth'), (19, 5, 'rice')],
    # D – Simple bowl
    [(8, 0, 'latte'), (8, 30, 'scrambled_eggs'),
     (12, 30, 'mushrooms'), (12, 35, 'rice'), (12, 40, 'bamboo'),
     (16, 0, 'matcha'), (19, 30, 'pho')],
    # E – Snack-y
    [(8, 30, 'tea'), (10, 0, 'banana'),
     (13, 0, 'chicken_curry'), (13, 5, 'rice'),
     (16, 0, 'boureka'), (19, 0, 'pizza')],
    # F – Egg-forward
    [(7, 30, 'latte'), (8, 0, 'scrambled_eggs'), (8, 5, 'toast'),
     (12, 0, 'spiced_chickpeas'),
     (15, 0, 'strawberries'), (15, 5, 'green_tea'), (19, 0, 'pho')],
    # G – Asian
    [(8, 0, 'matcha'), (9, 0, 'soft_egg'), (9, 5, 'rice'),
     (13, 0, 'pho'), (16, 0, 'green_tea'),
     (19, 30, 'mushrooms'), (19, 35, 'rice'), (19, 40, 'bamboo')],
    # H – Hot-drink heavy
    [(8, 0, 'hot_choc'), (9, 0, 'toast'), (9, 5, 'soft_egg'),
     (13, 0, 'samosa'), (16, 0, 'hot_choc'),
     (19, 0, 'chicken_curry'), (19, 5, 'rice')],
]


def main():
    mongo_uri = os.getenv('MONGO_URI')
    db_name = os.getenv('DB_NAME', 'nutramap')
    client = MongoClient(mongo_uri)
    db = client[db_name]

    # ── Find which days already have logs ─────────────────────────────────────
    start = datetime(2026, 1, 1)
    end = datetime(2026, 2, 28, 23, 59, 59)
    existing = db.logs.find(
        {'user_id': USER_ID, 'date': {'$gte': start, '$lte': end}},
        {'date': 1}
    )
    days_with_logs = {log['date'].strftime('%Y-%m-%d') for log in existing}
    print(f'Days already populated: {sorted(days_with_logs)}')

    # ── Build list of dates to fill ───────────────────────────────────────────
    today = datetime(2026, 2, 26)  # don't go beyond today
    dates_to_fill = []
    cursor = start
    while cursor <= today:
        if cursor.strftime('%Y-%m-%d') not in days_with_logs:
            dates_to_fill.append(cursor.date())
        cursor += timedelta(days=1)

    print(f'Days to populate: {len(dates_to_fill)}')

    # ── Insert logs ───────────────────────────────────────────────────────────
    rng = random.Random(42)  # deterministic
    docs = []

    for i, day in enumerate(dates_to_fill):
        pattern = DAY_PATTERNS[i % len(DAY_PATTERNS)]
        for (hour, minute, key) in pattern:
            meal = MEALS[key]
            docs.append({
                '_id': ObjectId(),
                'user_id': USER_ID,
                'recipe_id': meal['recipe_id'],
                'meal_name': meal['meal_name'],
                'servings': meal['servings'],
                'date': datetime(day.year, day.month, day.day, hour, minute, 0),
                'components': meal['components'],
            })

    if docs:
        db.logs.insert_many(docs)
        print(f'Inserted {len(docs)} log entries across {len(dates_to_fill)} days.')
    else:
        print('Nothing to insert — all days already have logs.')

    # ── Stamp serving_size_label onto recipes that are missing it ─────────────
    updated = 0
    for meal in MEALS.values():
        rid = meal.get('recipe_id')
        label = meal.get('serving_size_label')
        if not rid or not label:
            continue
        result = db.users.update_one(
            {"recipes": {"$elemMatch": {"recipe_id": rid, "serving_size_label": None}}},
            {"$set": {"recipes.$.serving_size_label": label}},
        )
        if result.modified_count:
            updated += 1
    print(f'Updated serving_size_label on {updated} recipes.')

    client.close()


if __name__ == '__main__':
    main()
