import { useState, useEffect } from 'react';
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
import { RecipeBlurb } from '../components/RecipeBlurb';
import { RecipeCard } from '../components/RecipeCard';
import type { Recipe } from '../components/RecipeBlurb';

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

  const fetchRecipes = async (forceRefresh = false) => {
    try {
      // Check cache first (unless forced refresh)
      if (!forceRefresh) {
        try {
          const cached = localStorage.getItem('recipes_cache');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              setRecipes(parsed);
              setLoading(false);
              return;
            } else {
              localStorage.removeItem('recipes_cache');
            }
          }
        } catch (storageError) {
          // localStorage not available - continue to fetch from API
        }
      }

      // Cache miss - fetch from API
      const response = await request('/recipes/list', 'GET');
      if (response && response.body && Array.isArray(response.body.recipes)) {
        const recipes = response.body.recipes;
        setRecipes(recipes);
        try {
          localStorage.setItem('recipes_cache', JSON.stringify(recipes));
        } catch (storageError) {
          // localStorage not available - skip caching
        }
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
    console.log('handleDeleteRecipe called with recipeId:', recipeId);

    if (!confirm('Are you sure you want to delete this recipe?')) {
      console.log('Delete cancelled by user');
      return;
    }

    console.log('User confirmed delete, sending request...');

    try {
      const response = await request(`/recipes/delete?recipe_id=${recipeId}`, 'DELETE');
      console.log('Delete response:', response);

      // Invalidate cache regardless of result to sync with backend
      try { localStorage.removeItem('recipes_cache'); } catch (e) {}

      if (response.status !== 200) {
        console.error('Delete failed with status:', response.status, response.body);
        alert(`Failed to delete recipe: ${response.body?.detail || 'Unknown error'}`);
        // Force refresh to sync with backend state
        await fetchRecipes(true);
        return;
      }

      console.log('Delete successful, updating state');

      // Remove from local state
      setRecipes(recipes.filter(r => r.recipe_id !== recipeId));
      setSelectedRecipe(null);
    } catch (error) {
      console.error('Error deleting recipe:', error);
      alert('Failed to delete recipe. Please try again.');
      // Force refresh to sync with backend state
      try { localStorage.removeItem('recipes_cache'); } catch (e) {}
      await fetchRecipes(true);
    }
  };

  return (
    <div className="myrecipes-page">
      <Header linkIcons={[{to: "/dashboard", img: <DashboardIcon/>}, {to: '/account', img: <AccountIcon/>}, {to: '/myfoods', img: <Utensils/>}, {to: '/myrecipes', img: <FoodBowl/>}]}/>
      <Heading words={name ? `${name}'s Recipes` : 'Your Recipes'} />

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
                <RecipeBlurb
                  key={recipe.recipe_id}
                  recipe={recipe}
                  onClick={() => handleRecipeClick(recipe)}
                />
              ))}
            </div>
          )}

          {selectedRecipe && (
            <RecipeCard
              recipe={selectedRecipe}
              onClose={handleCloseModal}
              onDelete={handleDeleteRecipe}
              onUpdate={() => {
                // Invalidate cache and force refresh after recipe updates
                try { localStorage.removeItem('recipes_cache'); } catch (e) {}
                fetchRecipes(true);
              }}
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

export default MyRecipes;
