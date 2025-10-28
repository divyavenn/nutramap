import React, { useState, useEffect } from 'react';
import { request } from './endpoints';
import { EditIngredientForm } from './IngredientEdit';
import type { Recipe, RecipeIngredient } from './RecipeBlurb';
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

  useEffect(() => {
    fetchRecipeNutrition();
  }, [editedIngredients]);

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

  const handleIngredientSave = () => {
    onUpdate();
    setEditingIndex(null);
  };

  const handleIngredientDelete = () => {
    onUpdate();
    setEditingIndex(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="recipe-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="modal-header">
          <h2>{recipe.description}</h2>
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
          </div>
          <EditIngredientForm
              food_name={''}
              amount={''}
              weight_in_grams={0}
              recipeId={recipe.recipe_id}
              onSave={handleIngredientSave}
              onDelete={handleIngredientDelete}
              onCancel={() => setEditingIndex(null)}
          />

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
    </div>
  );
}

export { RecipeCard };
