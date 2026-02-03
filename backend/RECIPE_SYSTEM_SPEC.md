# Recipe System Product Specification

## Overview
A recipe system that automatically identifies recipes from meal descriptions, breaks them down into ingredients, and groups ingredient logs under recipe headers in the UI. The system uses semantic similarity to match new meal descriptions to existing user recipes.

---

## Data Model

### User Schema Addition
Add a `recipes` field to the users collection:

```json
{
  "_id": ObjectId,
  "email": string,
  "name": string,
  // ... existing fields ...
  "recipes": [
    {
      "recipe_id": string (UUID),
      "description": string,  // e.g., "homemade daal"
      "embedding": array<float>,  // OpenAI embedding for semantic matching
      "ingredients": [
        {
          "portion": string,     // e.g., "1 cup"
          "food_id": int         // MongoDB food ID
        }
      ],
      "created_at": datetime,
      "updated_at": datetime
    }
  ]
}
```

### Log Schema Addition
Update to log schema to match this. Update all endpoints and frontend API calls to reflect the new naming convention and schema.

```json
{
  "_id": ObjectId,
  "user_id": ObjectId,
  "food_id": int,
  "amount": string, // estimation of amount in natural portions (pinch, cup, spoon, quart)
  "weight_in_grams": float, // gram weight of measurement
  "date": datetime,
  "recipe_servings" : string | null,
  "recipe_id": string | null,  // Links log to a recipe, null if standalone
  // ... existing fields ...
}
```

---

## Backend Implementation

### 1. Create `/backend/src/routers/recipes.py`

#### Endpoints:

##### `POST /recipes/parse-meal`
**Purpose**: Parse a meal description into recipes and their ingredients

**Input**:
```json
{
  "meal_description": "homemade daal and hot chocolate with collagen peptides",
  "date": "2024-10-23T11:36:00"  // timestamp for the meal
}
```

**Process**:
1. normalize  + segment the query. Run hybrid vector search on the recipe list (names uploaded to typsense, embeddings kept in faiss) and get the top 30 most likely matches along with their recipe_ids
2. Pass the descriptions + ids to openAI in context
   - Prompt should ask: "Break this meal into separate recipes/dishes. If there is a high likelihood one of the recipes is already part of the list, tag the recipe id. Also deduce number of serving sizes the user ate from their description. if not, mark it as a new recipe and come up with a likely list of ingredients and the measurement of each 
   - Example query and output:
   query: "Today i ate half of a pot of daal I made at home, 1 mug hot chocolate and collagen peptides, and 2 slices of veggie pizza from PiCo" 
   output: ["homemade daal: recipe_id ", "hot chocolate with collagen peptides" : hot chocolate 2 squares, 1 cup milk, 2 spoons sugar, 1 scoops collagen powder] 

   **Output**:
    ```json
    {
      "recipes": [
        {
          "recipe_id": "uuid-1",
          "description": "homemade daal",
          "recipe_servings" : .5,
        }
        {
          "recipe_id": "uuid-2",
          "description": "PiCo veggie pizza",
          "recipe_servings" : .3,
        }
        {
          "recipe_id": None,
          "description": "hot chocolate with collagen peptides",
          "recipe_servings" : 1,
          "ingredients": [
            {
              "food_name": "whole milk",
              "amount": "1 cup",
              "weight_in_grams" : 258
            }
            {
              "food_name": "dark chocolate",
              "amount": "2 squares",
              "weight_in_grams" : 30
            }
                        {
              "food_name": "brown sugar",
              "amount": "2 spoons",
              "weight_in_grams" : 25
            }
            {
              "food_name": "collagen powder",
              "amount": "1 scoop",
              "weight_in_grams" : 5
            }
          ]
        }
      ]
    }
   
   come up with several examples like this for the LLM's call's context.


3. Find food_ids for new recipes
   - Use existing infrastrucutre to find food_id of each ingredient in every new recipe

4. Add each new recipe to user's recipes. Add the new recipes (with ids) to our cache of the user's recipes.

   ```json
        {
          "recipe_id": "uuid-3",
          "description": "hot chocolate with collagen peptides
        }
  ```

5. Create logs for everything eaten in the meal. The amount of each ingredient should be the amount in the recipe * the number of recipe servings. The weight_in_grams of each ingredient should be the weight_in_grams in the recipe * the number of recipe servings. For example, if the PiCo pizza is made with 1 cup shredded cheese weighing 100g, the log would have 1 * .3g = .3 cup shredded cheese weighing 30 grams. The weight should be retrieved from the recipe to avoid having to use an openAI API call to unnecessairly estimate the weight of commonly eaten ingredient portions. 
```

##### `POST /recipes/match`
**Purpose**: Find semantically similar recipes in user's recipe list

**Input**:
```json
{
  "recipe_description": "homemade daal"
}
```

**Process**:
1. Generate embedding for input description
2. Compare with all user recipe embeddings using cosine similarity
3. Return matches above threshold (0.85)

**Output**:
```json
{
  "matches": [
    {
      "recipe_id": "uuid-1",
      "description": "daal tadka",
      "similarity_score": 0.89,
      "ingredients": [...]
    }
  ]
}
```

##### `GET /recipes/list`
**Purpose**: Get all user recipes

**Output**:
```json
{
  "recipes": [
    {
      "recipe_id": "uuid-1",
      "description": "homemade daal",
      "ingredients": [...],
      "created_at": "2024-10-23T11:36:00",
      "updated_at": "2024-10-23T11:36:00",
      "usage_count": 5
    }
  ]
}
```

##### `POST /recipes/create`
**Purpose**: Manually create a new recipe (for MyRecipes page)

**Input**:
```json
{
  "description": "My Special Smoothie",
  "ingredients": [
    {
      "food_name": "Banana, raw",  // Optional if food_id provided
      "food_id": 12345,             // Optional if food_name provided
      "amount": "1 medium",
      "weight_in_grams": 118        // Optional, will be estimated if not provided
    },
    {
      "food_name": "Milk, whole, 3.25%",
      "amount": "1 cup",
      "weight_in_grams": 244
    }
  ]
}
```

**Process**:
1. Validate ingredients structure
2. For each ingredient:
   - If food_id not provided, match food_name to database
   - If weight_in_grams not provided, estimate from amount using GPT
3. Generate recipe_id (UUID)
4. Generate embedding for description
5. Add recipe to user's recipes array

**Output**:
```json
{
  "status": "success",
  "recipe": {
    "recipe_id": "uuid-3",
    "description": "My Special Smoothie",
    "ingredients": [...],
    "created_at": "2024-10-23T11:36:00",
    "updated_at": "2024-10-23T11:36:00"
  }
}
```

##### `POST /recipes/update-ingredients`
**Purpose**: Update a recipe's ingredients when user edits a log

**Input**:
```json
{
  "recipe_id": "uuid-1",
  "ingredients": [
    {
      "food_id": 12345,
      "amount": "1.5 cups",
      "weight_in_grams": 297
    }
  ]
}
```

**Process**:
1. Find recipe in user's recipes array
2. Update ingredients array
3. Update updated_at timestamp



##### `DELETE /recipes/delete`
**Purpose**: Delete a recipe and unlink its logs


**Process**:
1. Remove recipe from user's recipes array
2. Set `recipe_id` to null for all logs associated with this recipe
3. Logs remain as standalone ingredient logs

**Output**:
```json
{
  "status": "success",
  "unlinked_logs": 12
}
```

---

### 2. Update `/backend/src/routers/logs.py`

#### Modify existing endpoints:

##### `GET /logs/get`
**Changes**:
- Add `recipe_id` to log output
- Group logs by `recipe_id` in response (optional - can be done frontend)

##### `POST /logs/update-portion`
**Changes**:
- After updating a log's portion, check if it has a `recipe_id`
- If yes, trigger recipe ingredient update
- Update the recipe's ingredient list to reflect the new portion
- Ask user: "Update all future instances of this recipe?" (frontend confirmation)

##### New endpoint: `POST /logs/unlink-from-recipe`
**Purpose**: Remove recipe_id from a log to make it standalone

**Input**:
```json
{
  "log_id": "log-uuid-1"
}
```

---

## Frontend Implementation

### 1. Create `/frontend/src/components/RecipeDivider.tsx`

**Component**: RecipeDivider
```typescript
interface RecipeDividerProps {
  recipeDescription: string;
  recipeId: string;
  onEdit?: (newDescription: string) => void;
  onDelete?: () => void;
}
```

**Design**:
```
─────────── homemade daal ───────────
```

**Features**:
- Thin horizontal line with recipe description in center
- Clicking on recipe takes you to user's recipe page 
- Styling to match date divider but distinguishable

**CSS** (in `/frontend/src/assets/css/recipe_divider.css`):
```css
.recipe-divider {
  width: calc(var(--modal-width) + 150px);
  margin-top: 30px;
  margin-bottom: 15px;
  border-bottom-style: dashed;  /* Different from date divider */
  border-bottom-width: 1px;
  border-bottom-color: rgba(255, 255, 255, 0.3);
  position: relative;
}

.recipe-description {
  font-family: 'Ubuntu';
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  font-weight: 400;
  font-style: italic;
  text-align: center;
  background-color: transparent;
  padding: 0 15px;
  display: inline-block;
}

.recipe-delete-button {
  /* Small X button that appears on hover */
}
```

---

### 2. Update `/frontend/src/components/Logs.tsx`

#### Modify `LogList` component:

**Data Structure**:
```typescript
interface RecipeGroup {
  recipeId: string | null;
  recipeDescription?: string;
  logs: LogProps[];
}

interface DateGroup {
  date: Date;
  recipes: RecipeGroup[];
}
```

**Grouping Logic**:
1. Group logs by date (existing)
2. Within each date, group by `recipe_id`
3. Logs with `recipe_id: null` are standalone (no recipe divider)
4. Order: Date → Recipe groups → Standalone logs

**Rendering**:
```tsx
{sortedDates.map(([dateKey, { logs: dateLogs }]) => {
  // Group logs by recipe_id
  const recipeGroups = groupLogsByRecipe(dateLogs);

  return (
    <div key={dateKey} className="logs-wrapper">
      <DateDivider date={new Date(dateKey)} />

      {recipeGroups.map((group, idx) => (
        <div key={group.recipeId || `standalone-${idx}`}>
          {group.recipeId && (
            <RecipeDivider
              recipeDescription={group.recipeDescription!}
              recipeId={group.recipeId}
              onEdit={(newDesc) => handleRecipeEdit(group.recipeId, newDesc)}
              onDelete={() => handleRecipeDelete(group.recipeId)}
            />
          )}

          {group.logs.map((log) => (
            <div key={log._id} className="log-wrapper">
              {/* Existing log rendering */}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
})}
```

**New Functions**:
```typescript
function groupLogsByRecipe(logs: LogProps[]): RecipeGroup[] {
  // Group logs by recipe_id
  // Standalone logs (recipe_id: null) go in separate group
}

async function handleRecipeEdit(recipeId: string, newDescription: string) {
  // Call API to update recipe description
}

async function handleRecipeDelete(recipeId: string) {
  // Confirm with user
  // Call API to delete recipe
  // Refresh logs
}
```

---

### 3. Update `/frontend/src/components/structures.ts`

Add `recipe_id` to LogProps:
```typescript
export interface LogProps {
  food_name: string;
  date: Date;
  portion?: string;
  amount_in_grams: number;
  _id: string;
  recipe_id?: string | null;
  recipe_description?: string;
}
```

---

Also, we should be able to see all the user's recipes (sorted alphabetically) listed on the /my-recipes page, accessible using the food icon on the top left of the dashboard. Each recipe should have a recipe description. When you click on a recipe description, the rest of the page dims and you see the list of the ingredietns + a dashboard that looks exactly like the nutriton dashbaord, excepts it displays the nutritional panel of the recipe. You can alter the ingredients + their amounts. whenver you do, the nutrition panel updates. You can also edit the weight_in_grams. This does not update the portion (though updating the portion updates the weight in grams via the "estimate gram weight" LLM API call) This allows users to indepedently verify and adjust the gram weights of protion sizes of ingredients.