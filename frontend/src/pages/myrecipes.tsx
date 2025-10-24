import React, { useState, useEffect } from 'react';
import { request } from '../components/endpoints';
import '../assets/css/myrecipes.css';

interface RecipeIngredient {
  food_id: number;
  amount: string;
  weight_in_grams: number;
  food_name?: string;  // Optional - populated when fetched
}

interface Recipe {
  recipe_id: string;
  description: string;
  ingredients: RecipeIngredient[];
  created_at: string;
  updated_at: string;
  usage_count: number;
}

interface NutrientData {
  nutrient_id: number;
  name: string;
  amount: number;
  unit: string;
}

function MyRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    initializeRecipes();
  }, []);

  const initializeRecipes = async () => {
    try {
      await fetchRecipes();
    } catch (error) {
      console.error('Error initializing recipes:', error);
    }
  };

  const fetchRecipes = async () => {
    try {
      const response = await request('/recipes/list', 'GET');
      if (response && response.body && response.body.recipes) {
        setRecipes(response.body.recipes);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching recipes:', error);
      setLoading(false);
    }
  };

  const handleRecipeClick = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
  };

  const handleCloseModal = () => {
    setSelectedRecipe(null);
  };

  const handleDeleteRecipe = async (recipeId: string) => {
    if (!confirm('Are you sure you want to delete this recipe?')) {
      return;
    }

    try {
      await request(`/recipes/delete?recipe_id=${recipeId}`, 'DELETE');
      // Remove from local state
      setRecipes(recipes.filter(r => r.recipe_id !== recipeId));
      setSelectedRecipe(null);
    } catch (error) {
      console.error('Error deleting recipe:', error);
    }
  };

  if (loading) {
    return (
      <div className="myrecipes-page">
        <div className="myrecipes-header">
          <h1>My Recipes</h1>
        </div>
        <div className="loading-message">Loading recipes...</div>
      </div>
    );
  }

  return (
    <div className="myrecipes-page">
      <div className="myrecipes-header">
        <h1>My Recipes</h1>
        <button
          className="create-recipe-button"
          onClick={() => setShowCreateModal(true)}
        >
          + Create New Recipe
        </button>
      </div>

      {recipes.length === 0 ? (
        <div className="no-recipes-message">
          <p>You haven't created any recipes yet.</p>
          <p>Start by logging a meal or creating a new recipe manually!</p>
        </div>
      ) : (
        <div className="recipes-grid">
          {recipes.map(recipe => (
            <div
              key={recipe.recipe_id}
              className="recipe-card"
              onClick={() => handleRecipeClick(recipe)}
            >
              <div className="recipe-card-header">
                <h3 className="recipe-title">{recipe.description}</h3>
                <div className="recipe-usage-count">
                  Used {recipe.usage_count} {recipe.usage_count === 1 ? 'time' : 'times'}
                </div>
              </div>
              <div className="recipe-ingredients-preview">
                {recipe.ingredients.slice(0, 3).map((ing, idx) => (
                  <div key={idx} className="ingredient-preview-item">
                    • {ing.amount}
                  </div>
                ))}
                {recipe.ingredients.length > 3 && (
                  <div className="more-ingredients">
                    +{recipe.ingredients.length - 3} more
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedRecipe && (
        <RecipeDetailModal
          recipe={selectedRecipe}
          onClose={handleCloseModal}
          onDelete={handleDeleteRecipe}
          onUpdate={fetchRecipes}
        />
      )}

      {showCreateModal && (
        <CreateRecipeModal
          onClose={() => setShowCreateModal(false)}
          onCreate={fetchRecipes}
        />
      )}
    </div>
  );
}

interface RecipeDetailModalProps {
  recipe: Recipe;
  onClose: () => void;
  onDelete: (recipeId: string) => void;
  onUpdate: () => void;
}

function RecipeDetailModal({ recipe, onClose, onDelete, onUpdate }: RecipeDetailModalProps) {
  const [editedIngredients, setEditedIngredients] = useState(recipe.ingredients);
  const [isSaving, setIsSaving] = useState(false);
  const [nutritionData, setNutritionData] = useState<NutrientData[]>([]);
  const [loadingNutrition, setLoadingNutrition] = useState(true);

  useEffect(() => {
    fetchRecipeNutrition();
  }, [editedIngredients]);

  const fetchRecipeNutrition = async () => {
    try {
      setLoadingNutrition(true);
      // Fetch nutrition for all ingredients that have valid food_id
      const nutritionPromises = editedIngredients
        .filter(ingredient => ingredient.food_id && ingredient.food_id !== 'undefined')
        .map(async (ingredient) => {
          try {
            const response = await request(
              `/foods/nutrients?food_id=${ingredient.food_id}&amount_in_grams=${ingredient.weight_in_grams}`,
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

  const handleIngredientChange = (index: number, field: 'amount' | 'weight_in_grams' | 'food_name', value: string) => {
    const updated = [...editedIngredients];
    if (field === 'weight_in_grams') {
      updated[index][field] = parseFloat(value);
    } else {
      updated[index][field] = value;
    }
    setEditedIngredients(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const data = {
        recipe_id: recipe.recipe_id,
        ingredients: JSON.stringify(editedIngredients)
      };

      await request('/recipes/update-ingredients', 'POST', data, 'URLencode');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating recipe:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="recipe-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{recipe.description}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          <div className="ingredients-section">
            <h3>Ingredients</h3>
            {editedIngredients.length === 0 ? (
              <p className="nutrition-note">No ingredients found. This recipe may have been created before ingredients could be matched.</p>
            ) : (
              <div className="ingredients-list">
                {editedIngredients.map((ingredient, index) => (
                  <div key={index} className="ingredient-edit-row">
                    <div className="ingredient-name-display">
                      <label>Food</label>
                      {!ingredient.food_id || ingredient.food_id === 'undefined' ? (
                        <input
                          type="text"
                          placeholder="Enter food name to match..."
                          value={ingredient.food_name || ''}
                          onChange={(e) => handleIngredientChange(index, 'food_name', e.target.value)}
                          style={{
                            width: '100%',
                            borderColor: 'rgba(255, 100, 100, 0.5)',
                            backgroundColor: 'rgba(255, 100, 100, 0.1)'
                          }}
                        />
                      ) : (
                        <div className="ingredient-food-name">
                          {ingredient.food_name || 'Unknown Food'}
                        </div>
                      )}
                    </div>
                    <div className="ingredient-amount">
                      <label>Amount</label>
                      <input
                        type="text"
                        value={ingredient.amount}
                        onChange={(e) => handleIngredientChange(index, 'amount', e.target.value)}
                      />
                    </div>
                    <div className="ingredient-weight">
                      <label>Weight (g)</label>
                      <input
                        type="number"
                        value={ingredient.weight_in_grams}
                        onChange={(e) => handleIngredientChange(index, 'weight_in_grams', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                    <span className="nutrition-name" style={{fontStyle: 'italic', opacity: 0.7}}>
                      +{nutritionData.length - 11} more nutrients
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="delete-button" onClick={() => onDelete(recipe.recipe_id)}>
            Delete Recipe
          </button>
          <div className="action-buttons">
            <button className="cancel-button" onClick={onClose}>Cancel</button>
            <button className="save-button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CreateRecipeModalProps {
  onClose: () => void;
  onCreate: () => void;
}

function CreateRecipeModal({ onClose, onCreate }: CreateRecipeModalProps) {
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState<Array<{ food_name: string; amount: string; weight_in_grams: string }>>([
    { food_name: '', amount: '', weight_in_grams: '' }
  ]);
  const [isCreating, setIsCreating] = useState(false);

  const handleAddIngredient = () => {
    setIngredients([...ingredients, { food_name: '', amount: '', weight_in_grams: '' }]);
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index: number, field: string, value: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const handleCreate = async () => {
    if (!description.trim()) {
      alert('Please enter a recipe description');
      return;
    }

    if (ingredients.length === 0 || !ingredients[0].food_name) {
      alert('Please add at least one ingredient');
      return;
    }

    setIsCreating(true);
    try {
      const data = {
        description: description,
        ingredients: JSON.stringify(
          ingredients
            .filter(ing => ing.food_name.trim())
            .map(ing => ({
              food_name: ing.food_name,
              amount: ing.amount,
              weight_in_grams: ing.weight_in_grams ? parseFloat(ing.weight_in_grams) : undefined
            }))
        )
      };

      await request('/recipes/create', 'POST', data, 'URLencode');
      onCreate();
      onClose();
    } catch (error) {
      console.error('Error creating recipe:', error);
      alert('Error creating recipe. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="recipe-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Recipe</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          <div className="recipe-description-input">
            <label>Recipe Name</label>
            <input
              type="text"
              placeholder="e.g., My Special Smoothie"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="ingredients-section">
            <h3>Ingredients</h3>
            <div className="ingredients-list">
              {ingredients.map((ingredient, index) => (
                <div key={index} className="ingredient-create-row">
                  <div className="ingredient-name">
                    <label>Food Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Banana, raw"
                      value={ingredient.food_name}
                      onChange={(e) => handleIngredientChange(index, 'food_name', e.target.value)}
                    />
                  </div>
                  <div className="ingredient-amount">
                    <label>Amount</label>
                    <input
                      type="text"
                      placeholder="e.g., 1 cup"
                      value={ingredient.amount}
                      onChange={(e) => handleIngredientChange(index, 'amount', e.target.value)}
                    />
                  </div>
                  <div className="ingredient-weight">
                    <label>Weight (g)</label>
                    <input
                      type="number"
                      placeholder="Optional"
                      value={ingredient.weight_in_grams}
                      onChange={(e) => handleIngredientChange(index, 'weight_in_grams', e.target.value)}
                    />
                  </div>
                  {ingredients.length > 1 && (
                    <button
                      className="remove-ingredient-button"
                      onClick={() => handleRemoveIngredient(index)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="add-ingredient-button" onClick={handleAddIngredient}>
              + Add Ingredient
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <div className="action-buttons">
            <button className="cancel-button" onClick={onClose}>Cancel</button>
            <button className="save-button" onClick={handleCreate} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Recipe'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MyRecipes;
