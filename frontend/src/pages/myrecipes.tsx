import { useState, useEffect } from 'react';
import { request } from '../components/endpoints';
import { Header } from '../components/Sections';
import { Heading } from '../components/Title';
import AccountIcon from '../assets/images/account.svg?react';
import DashboardIcon from '../assets/images/dashboard.svg?react';
import FoodBowl from '../assets/images/food_bowl.svg?react';
import RecipesIcon from '../assets/images/recipes.svg?react';
import { useRecoilValue } from 'recoil';
import { firstNameAtom } from '../components/account_states';
import { RecipeBlurb } from '../components/RecipeBlurb';
import { RecipeCard } from '../components/RecipeCard';
import type { Recipe } from '../components/RecipeBlurb';
import { tutorialEvent } from '../components/TryTutorial';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  MyRecipesPage,
  MyRecipesContainer,
  MyRecipesHeader,
  CreateRecipeButton,
  LoadingMessage,
  NoRecipesMessage,
  RecipesGrid,
} from '../components/RecipeCard.styled';

function MyRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [creating, setCreating] = useState(false);
  const name = useRecoilValue(firstNameAtom);
  const navigate = useNavigate();
  const overlayTransition = { duration: 0.2, ease: 'easeOut' } as const;
  const modalTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

  const clearRecipeCaches = () => {
    localStorage.removeItem('recipes_cache');
  };

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
    let usedCachedRecipes = false;

    try {
      // Hydrate from cache first for fast paint, but always revalidate from API.
      if (!forceRefresh) {
        try {
          const cached = localStorage.getItem('recipes_cache');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              setRecipes(parsed);
              usedCachedRecipes = true;
            } else {
              clearRecipeCaches();
            }
          }
        } catch (storageError) {
          // localStorage not available - continue to fetch from API
        }
      }

      const response = await request('/recipes/list', 'GET');
      if (response.status === 200 && response.body && Array.isArray(response.body.recipes)) {
        const apiRecipes = response.body.recipes;
        setRecipes(apiRecipes);
        try {
          localStorage.setItem('recipes_cache', JSON.stringify(apiRecipes));
        } catch (storageError) {
          // localStorage not available - skip caching
        }
      } else if (response.status === 401) {
        clearRecipeCaches();
        if (sessionStorage.getItem('isTrial') === 'true') {
          localStorage.removeItem('access_token');
          navigate('/try', { replace: true });
        } else {
          navigate('/login', { replace: true, state: { loginError: 'Please log in to view recipes.' } });
        }
      } else if (!usedCachedRecipes) {
        setRecipes([]);
        console.warn('Unexpected /recipes/list response', response.status, response.body);
      }
    } catch (error) {
      console.error('Error fetching recipes:', error);
      if (!usedCachedRecipes) {
        setRecipes([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRecipeClick = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
  };

  const handleCloseModal = () => {
    setSelectedRecipe(null);
  };

  const handleCreateRecipe = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const formData = new FormData();
      formData.append('description', 'New Recipe');
      formData.append('ingredients', '[]');
      const response = await request('/recipes/create', 'POST', formData);

      if (response.status === 200 && response.body?.recipe) {
        clearRecipeCaches();
        await fetchRecipes(true);
        setSelectedRecipe(response.body.recipe);
      }
    } catch (error) {
      console.error('Error creating recipe:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRecipe = async (recipeId: string) => {
    if (!confirm('Are you sure you want to delete this recipe?')) {
      return;
    }

    try {
      const response = await request(`/recipes/delete?recipe_id=${recipeId}`, 'DELETE');

      // Invalidate cache regardless of result to sync with backend
      clearRecipeCaches();

      if (response.status !== 200) {
        console.error('Delete failed with status:', response.status, response.body);
        alert(`Failed to delete recipe: ${response.body?.detail || 'Unknown error'}`);
        // Force refresh to sync with backend state
        await fetchRecipes(true);
        return;
      }

      // Remove from local state
      setRecipes(recipes.filter(r => r.recipe_id !== recipeId));
      setSelectedRecipe(null);
    } catch (error) {
      console.error('Error deleting recipe:', error);
      alert('Failed to delete recipe. Please try again.');
      // Force refresh to sync with backend state
      clearRecipeCaches();
      await fetchRecipes(true);
    }
  };

  return (
    <MyRecipesPage>
      <Header linkIcons={[{to: "/dashboard", img: <DashboardIcon/>}, {to: '/account', img: <AccountIcon/>}, {to: '/myfoods', img: <FoodBowl/>}, {to: '/myrecipes', img: <RecipesIcon/>}]}/>
      <Heading words={name ? `${name}'s Recipes` : 'Your Recipes'} />

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <LoadingMessage>Loading recipes...</LoadingMessage>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <MyRecipesContainer>
              <MyRecipesHeader>
                <CreateRecipeButton
                  onClick={handleCreateRecipe}
                  disabled={creating}
                >
                  {creating ? 'Creating...' : '+ New Recipe'}
                </CreateRecipeButton>
              </MyRecipesHeader>

              {recipes.length === 0 ? (
                <NoRecipesMessage>
                  <p>You haven't created any recipes yet.</p>
                  <p>Start by logging a meal or creating a new recipe manually!</p>
                </NoRecipesMessage>
              ) : (
                <LayoutGroup id="recipes-grid">
                  <RecipesGrid>
                    {recipes.map((recipe, index) => (
                      <RecipeBlurb
                        key={recipe.recipe_id}
                        recipe={recipe}
                        index={index}
                        onClick={() => handleRecipeClick(recipe)}
                      />
                    ))}
                  </RecipesGrid>
                </LayoutGroup>
              )}

              <AnimatePresence>
                {selectedRecipe && (
                  <RecipeCard
                    recipe={selectedRecipe}
                    onClose={handleCloseModal}
                    onDelete={handleDeleteRecipe}
                    onUpdate={() => {
                      clearRecipeCaches();
                      fetchRecipes(true);
                    }}
                  />
                )}
              </AnimatePresence>
            </MyRecipesContainer>
          </motion.div>
        )}
      </AnimatePresence>
    </MyRecipesPage>
  );
}

export default MyRecipes;
