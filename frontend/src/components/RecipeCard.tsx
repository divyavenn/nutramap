import React, { useState, useEffect, useRef } from 'react';
import { request } from './endpoints';
import { EditIngredientForm } from './IngredientEdit';
import { Confirm } from './Confirm';
import type { Recipe, RecipeIngredient } from './RecipeBlurb';
import { tutorialEvent } from './TryTutorial';
import '../assets/css/myrecipes.css';

interface NutrientData {
  nutrient_id: number;
  name: string;
  amount: number;
  unit: string;
}

interface RecipeCardProps {
  recipe: Recipe;
  onClose: () => void;
  onDelete: (recipeId: string) => void;
  onUpdate: () => void;
}

function RecipeCard({ recipe, onClose, onDelete, onUpdate }: RecipeCardProps) {
  const [editedIngredients, setEditedIngredients] = useState<RecipeIngredient[]>(recipe.ingredients);
  const [nutritionData, setNutritionData] = useState<NutrientData[]>([]);
  const [loadingNutrition, setLoadingNutrition] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [recipeName, setRecipeName] = useState(recipe.description);
  const [isEditingName, setIsEditingName] = useState(false);
  const [hasEdits, setHasEdits] = useState(false);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchRecipeNutrition();
  }, [editedIngredients]);

  const refreshRecipeData = async () => {
    try {
      // Fetch updated recipe data from the backend
      const response = await request('/recipes/list', 'GET');
      if (response.body && response.body.recipes) {
        const updatedRecipe = response.body.recipes.find((r: Recipe) => r.recipe_id === recipe.recipe_id);
        if (updatedRecipe) {
          setEditedIngredients(updatedRecipe.ingredients);
        }
      }
    } catch (error) {
      console.error('Error refreshing recipe data:', error);
    }
  };

  const handleNameBlur = async () => {
    setIsEditingName(false);
    const trimmed = recipeName.trim();
    if (!trimmed || trimmed === recipe.description) {
      setRecipeName(recipe.description);
      return;
    }
    try {
      const formData = new FormData();
      formData.append('recipe_id', recipe.recipe_id);
      formData.append('description', trimmed);
      const response = await request('/recipes/rename', 'POST', formData);
      if (response.status === 200) {
        onUpdate();
      } else {
        setRecipeName(recipe.description);
      }
    } catch (error) {
      console.error('Error renaming recipe:', error);
      setRecipeName(recipe.description);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameInputRef.current?.blur();
    }
    if (e.key === 'Escape') {
      setRecipeName(recipe.description);
      setIsEditingName(false);
    }
  };

  const fetchRecipeNutrition = async () => {
    try {
      setLoadingNutrition(true);
      const nutritionPromises = editedIngredients
        .filter(ingredient => ingredient.food_id)
        .map(async (ingredient) => {
          try {
            const response = await request(
              `/food/nutrients?food_id=${ingredient.food_id}&amount_in_grams=${ingredient.weight_in_grams}`,
              'GET'
            );
            return response.body || [];
          } catch (error) {
            console.error(`Error fetching nutrition for food ${ingredient.food_id}:`, error);
            return [];
          }
        });

      const allNutrients = await Promise.all(nutritionPromises);

      // Aggregate nutrients across all ingredients
      const aggregated = new Map<number, NutrientData>();

      allNutrients.flat().forEach((nutrient: any) => {
        if (!nutrient || !nutrient.nutrient_id) return;

        const existing = aggregated.get(nutrient.nutrient_id);
        if (existing) {
          existing.amount += nutrient.amount || 0;
        } else {
          aggregated.set(nutrient.nutrient_id, {
            nutrient_id: nutrient.nutrient_id,
            name: nutrient.name || 'Unknown',
            amount: nutrient.amount || 0,
            unit: nutrient.unit || 'g'
          });
        }
      });

      setNutritionData(Array.from(aggregated.values()));
      setLoadingNutrition(false);
    } catch (error) {
      console.error('Error fetching recipe nutrition:', error);
      setLoadingNutrition(false);
    }
  };

  const handleIngredientSave = async () => {
    await refreshRecipeData();
    setHasEdits(true);
    setEditingIndex(null);
    tutorialEvent('tutorial:ingredient-edited');
  };

  const handleIngredientDelete = async () => {
    await refreshRecipeData();
    setHasEdits(true);
    setEditingIndex(null);
  };

  const handleClose = () => {
    if (hasEdits) {
      setShowSyncConfirm(true);
      tutorialEvent('tutorial:sync-shown');
    } else {
      onClose();
    }
  };

  const handleSyncLogs = async () => {
    try {
      const formData = new FormData();
      formData.append('recipe_id', recipe.recipe_id);
      await request('/recipes/sync-logs', 'POST', formData);
    } catch (error) {
      console.error('Error syncing logs:', error);
    }
    setShowSyncConfirm(false);
    onUpdate();
    onClose();
    tutorialEvent('tutorial:recipe-synced');
  };

  const handleUnlinkLogs = async () => {
    try {
      const formData = new FormData();
      formData.append('recipe_id', recipe.recipe_id);
      await request('/recipes/unlink-all-logs', 'POST', formData);
    } catch (error) {
      console.error('Error unlinking logs:', error);
    }
    setShowSyncConfirm(false);
    onUpdate();
    tutorialEvent('tutorial:recipe-synced');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="recipe-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-x" onClick={handleClose} aria-label="Close">
          ×
        </button>
        <div className="modal-header">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              className="recipe-name-display"
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              autoFocus
            />
          ) : (
            <h2 onClick={() => setIsEditingName(true)} className="recipe-name-display">
              {recipeName}
            </h2>
          )}
        </div>

        <div className="modal-content">
          <div className="ingredients-section">
            {editedIngredients.map((ingredient, index) => (
                  <EditIngredientForm
                    key={index}
                    food_name={ingredient.food_name || ''}
                    amount={ingredient.amount}
                    weight_in_grams={ingredient.weight_in_grams}
                    food_id={ingredient.food_id}
                    componentIndex={index}
                    recipeId={recipe.recipe_id}
                    onSave={handleIngredientSave}
                    onDelete={handleIngredientDelete}
                    onCancel={() => setEditingIndex(null)}
                  />
                ))}
              <EditIngredientForm
                food_name={''}
                amount={''}
                weight_in_grams={0}
                recipeId={recipe.recipe_id}
                onSave={handleIngredientSave}
                onDelete={handleIngredientDelete}
                onCancel={() => setEditingIndex(null)}
              />
          </div>

          <div className="nutrition-section">
            <h3>Nutrition Facts (Per Recipe)</h3>
            {loadingNutrition ? (
              <p className="nutrition-note">Loading nutrition data...</p>
            ) : nutritionData.length === 0 ? (
              <p className="nutrition-note">No nutrition data available</p>
            ) : (
              <div className="nutrition-grid">
                {nutritionData
                  .filter(n => ['Energy', 'Protein', 'Total lipid (fat)', 'Carbohydrate, by difference', 'Fiber, total dietary', 'Sugars, total including NLEA', 'Calcium, Ca', 'Iron, Fe', 'Sodium, Na', 'Vitamin C, total ascorbic acid', 'Vitamin A, RAE'].includes(n.name))
                  .sort((a, b) => {
                    const order = ['Energy', 'Protein', 'Total lipid (fat)', 'Carbohydrate, by difference', 'Fiber, total dietary', 'Sugars, total including NLEA'];
                    const aIndex = order.indexOf(a.name);
                    const bIndex = order.indexOf(b.name);
                    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                    if (aIndex !== -1) return -1;
                    if (bIndex !== -1) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map(nutrient => (
                    <div key={nutrient.nutrient_id} className="nutrition-item">
                      <span className="nutrition-name">{nutrient.name}</span>
                      <span className="nutrition-value">
                        {nutrient.amount.toFixed(1)} {nutrient.unit}
                      </span>
                    </div>
                  ))}
                {nutritionData.length > 11 && (
                  <div className="nutrition-item">
                    <span className="nutrition-name" style={{ fontStyle: 'italic', opacity: 0.7 }}>
                      +{nutritionData.length - 11} more nutrients
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="delete-recipe-button" onClick={() => onDelete(recipe.recipe_id)} title="Delete Recipe">
            Delete Recipe
          </button>
        </div>
      </div>

      {showSyncConfirm && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <Confirm
            message="update all previous meals using this recipe?"
            ifYesDo={handleSyncLogs}
            ifNoDo={handleUnlinkLogs}
          />
        </div>
      )}
    </div>
  );
}

export { RecipeCard };
