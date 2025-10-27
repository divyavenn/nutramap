import { useState, useEffect, useRef } from 'react';
import { request } from '../components/endpoints';
import '../assets/css/myrecipes.css';
import { Header } from '../components/Sections';
import { Heading } from '../components/Title';
import AccountIcon from '../assets/images/account.svg?react';
import Utensils from '../assets/images/utensils-solid.svg?react'
import DashboardIcon from '../assets/images/dashboard.svg?react';
import FoodBowl from '../assets/images/food_bowl.svg?react';
import { useRecoilValue } from 'recoil';
import { firstNameAtom } from '../components/account_states';

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
  const name = useRecoilValue(firstNameAtom);

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

  return (
    <div className="myrecipes-page">
      <Header linkIcons={[{to: "/dashboard", img: <DashboardIcon/>}, {to: '/account', img: <AccountIcon/>}, {to: '/myfoods', img: <Utensils/>}, {to: '/myrecipes', img: <FoodBowl/>}]}/>
      <Heading words={`${name}'s Recipes`} />

      { loading ?
      (<div className="loading-message">Loading recipes...</div>)
      :
      ( <div className="myrecipes-container">
          <div className="myrecipes-header">
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
                    {recipe.ingredients.slice(0, 5).map((ing, idx) => (
                      <div key={idx} className="ingredient-preview-item">
                        {ing.amount} {ing.food_name || 'Unknown'}
                      </div>
                    ))}
                    {recipe.ingredients.length > 5 && (
                      <div className="more-ingredients">
                        +{recipe.ingredients.length - 5} more
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
            <div/>
          )}
        </div> )
    }
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
  const [nutritionData, setNutritionData] = useState<NutrientData[]>([]);
  const [loadingNutrition, setLoadingNutrition] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);
  const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchRecipeNutrition();
  }, [editedIngredients]);

  // Reset selected suggestion index when suggestions change
  useEffect(() => {
    setSelectedSuggestionIndex(suggestions.length > 0 ? 0 : -1);
  }, [suggestions]);

  // Scroll selected suggestion into view
  useEffect(() => {
    if (selectedSuggestionIndex >= 0 && suggestionsRef.current) {
      const suggestionsContainer = suggestionsRef.current;
      const selectedElement = suggestionsContainer.querySelector(`.suggestion-item:nth-child(${selectedSuggestionIndex + 1})`) as HTMLElement;

      if (selectedElement) {
        const containerTop = suggestionsContainer.scrollTop;
        const containerBottom = containerTop + suggestionsContainer.clientHeight;
        const elementTop = selectedElement.offsetTop;
        const elementBottom = elementTop + selectedElement.offsetHeight;

        if (elementTop < containerTop) {
          suggestionsContainer.scrollTop = elementTop;
        } else if (elementBottom > containerBottom) {
          suggestionsContainer.scrollTop = elementBottom - suggestionsContainer.clientHeight;
        }
      }
    }
  }, [selectedSuggestionIndex]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const fetchRecipeNutrition = async () => {
    try {
      setLoadingNutrition(true);
      // Fetch nutrition for all ingredients that have valid food_id
      const nutritionPromises = editedIngredients
        .filter(ingredient => ingredient.food_id)
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

  const handleAutocomplete = async (value: string) => {
    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await request('/match/autocomplete?prompt=' + value, 'POST', {}, 'JSON');
      if (response.body) {
        setSuggestions(response.body);
        setShowSuggestions(value.length > 0 && response.body.length > 0);
      }
    } catch (error) {
      console.error('Error fetching autocomplete suggestions:', error);
      setSuggestions([]);
      setShowSuggestions(false);
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

    // Handle autocomplete for food_name changes
    if (field === 'food_name') {
      setActiveInputIndex(index);

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce the autocomplete request
      debounceTimerRef.current = setTimeout(() => {
        handleAutocomplete(value);
      }, 300);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (activeInputIndex !== null) {
      const updated = [...editedIngredients];
      updated[activeInputIndex].food_name = suggestion;
      setEditedIngredients(updated);
    }
    setShowSuggestions(false);
    setActiveInputIndex(null);
  };

  const handleSave = async () => {
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
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Handle suggestions keyboard navigation
    if (showSuggestions) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedSuggestionIndex(prev =>
            prev < suggestions.length - 1 ? prev + 1 : prev
          );
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedSuggestionIndex(prev =>
            prev > 0 ? prev - 1 : prev
          );
          return;
        case 'Tab':
          e.preventDefault();
          if (selectedSuggestionIndex >= 0) {
            handleSuggestionClick(suggestions[selectedSuggestionIndex]);
          }
          return;
        case 'Escape':
          e.preventDefault();
          setShowSuggestions(false);
          return;
        case 'Enter':
          if (selectedSuggestionIndex >= 0) {
            e.preventDefault();
            handleSuggestionClick(suggestions[selectedSuggestionIndex]);
            return;
          }
          break;
      }
    }

    // Save on Enter if no suggestions
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="recipe-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{recipe.description}</h2>
        </div>

        <div className="modal-content">
          <div className="ingredients-section">
            {editedIngredients.length === 0 ? (
              <p className="nutrition-note">No ingredients found. This recipe may have been created before ingredients could be matched.</p>
            ) : (
              <div className="ingredients-list">
                <div className="ingredient-edit-row">
                  <div className="ingredient-name-display"> <label>Food</label> </div>
                  <div className="ingredient-amount"> <label>Amount</label> </div>
                  <div className="ingredient-weight"> <label>Weight</label> </div>
                </div>
                {editedIngredients.map((ingredient, index) => (
                  <div key={index} className="ingredient-edit-row">
                    <div className="ingredient-name-display">
                      {!ingredient.food_id? (
                        <input
                          type="text"
                          className="ingredient-name-input"
                          placeholder="Enter food name to match..."
                          value={ingredient.food_name || ''}
                          onChange={(e) => handleIngredientChange(index, 'food_name', e.target.value)}
                          onKeyDown={handleKeyPress}
                        />
                      ) : (
                        <div className="ingredient-food-name">
                          {ingredient.food_name || 'Unknown Food'}
                        </div>
                      )}
                    </div>
                    <div className="ingredient-amount">
                      <input
                        type="text"
                        value={ingredient.amount}
                        onChange={(e) => handleIngredientChange(index, 'amount', e.target.value)}
                        onKeyDown={handleKeyPress}
                      />
                    </div>
                    <div className="ingredient-weight">
                      <input
                        type="number"
                        value={ingredient.weight_in_grams}
                        onChange={(e) => handleIngredientChange(index, 'weight_in_grams', e.target.value)}
                        onKeyDown={handleKeyPress}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showSuggestions && (
              <div className="suggestions-container" ref={suggestionsRef}>
                <ul className="suggestions-list">
                  {suggestions.map((suggestion, index) => (
                    <li
                      key={suggestion}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className={`suggestion-item ${index === selectedSuggestionIndex ? 'selected' : ''}`}
                      onMouseEnter={() => setSelectedSuggestionIndex(index)}
                    >
                      {suggestion}
                    </li>
                  ))}
                </ul>
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
          <button className="delete-recipe-button" onClick={() => onDelete(recipe.recipe_id)} title="Delete Recipe">
            Delete Recipe
          </button>
        </div>
      </div>
    </div>
  );
}


export default MyRecipes;
