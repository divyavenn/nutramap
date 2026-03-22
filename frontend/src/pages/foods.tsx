import React, { useState, useEffect, useRef } from 'react';
import { Header } from '../components/Sections';
import { Heading } from '../components/Title';
import AccountIcon from '../assets/images/account.svg?react';
import DashboardIcon from '../assets/images/dashboard.svg?react';
import RecipesIcon from '../assets/images/recipes.svg?react'
import { request } from '../components/endpoints';
import { useNavigate } from 'react-router-dom';
import { isLoginExpired } from '../components/utlis';
import { firstNameAtom, useRefreshAccountInfo, nutrientDetailsByIDAtom, pendingCustomFoodsAtom } from '../components/account_states';
import { useRecoilValue, useRecoilValueLoadable } from 'recoil';
import NewFood from '../components/NewFood';
import FoodBowl from '../assets/images/food_bowl.svg?react'
import { NutrientPanel } from '../components/NutrientPanel';
import { AnimatedText } from '../components/AnimatedText';
import {
  FoodsGlobalStyles,
  FoodsContainer,
  FoodsPageSubtitle,
  NoFoodsMessage,
  FoodsTagsContainer,
  FoodTag,
  FoodTagName,
  FoodTagDelete,
  FoodModalOverlay,
  TutorialFoodDetailModal,
} from '../components/Foods.styled';
import { tutorialEvent } from '../components/TryTutorial';

interface NutrientInfo {
  nutrient_id: number;
  name: string;
  amount: number;
  unit: string;
}

interface Food {
  _id: string;
  name: string;
  nutrients: {
    [key: string]: number;
  };
}

function normalizeFoodNutrients(rawNutrients: unknown): Record<string, number> {
  if (Array.isArray(rawNutrients)) {
    return rawNutrients.reduce<Record<string, number>>((acc, nutrient) => {
      if (!nutrient || typeof nutrient !== 'object') return acc;
      const nutrientId = (nutrient as any).nutrient_id;
      const amount = Number((nutrient as any).amt ?? (nutrient as any).amount);
      if (nutrientId === undefined || !Number.isFinite(amount)) return acc;
      acc[String(nutrientId)] = amount;
      return acc;
    }, {});
  }

  if (rawNutrients && typeof rawNutrients === 'object') {
    return Object.entries(rawNutrients as Record<string, unknown>).reduce<Record<string, number>>((acc, [nutrientId, amount]) => {
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount)) return acc;
      acc[String(nutrientId)] = parsedAmount;
      return acc;
    }, {});
  }

  return {};
}



function Foods() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<string | null>(null);
  const [nutrientsDetails, setNutrientsDetails] = useState<NutrientInfo[]>([]);
  const pendingCustomFoods = useRecoilValue(pendingCustomFoodsAtom);
  const refreshAccountInfo = useRefreshAccountInfo();
  const navigate = useNavigate();
  const name = useRecoilValue(firstNameAtom);
  const nutrientDetailsByIdLoadable = useRecoilValueLoadable(nutrientDetailsByIDAtom);
  const nutrientDetailsById = nutrientDetailsByIdLoadable.state === 'hasValue'
    ? nutrientDetailsByIdLoadable.contents
    : {} 

  // Fetch user's custom foods — always force-refresh so navigating back shows latest data
  useEffect(() => {
    if (isLoginExpired()) {
      if (sessionStorage.getItem('isTrial') === 'true') {
        localStorage.removeItem('access_token');
        navigate('/try', { replace: true });
      } else {
        navigate('/login');
      }
      return;
    }
    refreshAccountInfo();
    fetchFoods(true);
  }, []);

  // Re-fetch when any pending food finishes (array shrinks).
  const prevPendingLengthRef = useRef(pendingCustomFoods.length);
  useEffect(() => {
    if (prevPendingLengthRef.current > pendingCustomFoods.length) {
      fetchFoods(true);
    }
    prevPendingLengthRef.current = pendingCustomFoods.length;
  }, [pendingCustomFoods.length]);

  const fetchFoods = async (forceRefresh = false) => {
    try {
      // Check cache first (unless forced refresh)
      if (!forceRefresh) {
        try {
          const cached = localStorage.getItem('custom_foods_cache');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              setFoods(parsed.map((food: any) => ({
                ...food,
                name: food.name ?? food.food_name ?? '',
                nutrients: normalizeFoodNutrients(food.nutrients)
              })));
              return;
            } else {
              localStorage.removeItem('custom_foods_cache');
            }
          }
        } catch (storageError) {
          // localStorage not available - continue to fetch from API
        }
      }

      // Cache miss - fetch from API
      const response = await request('/food/custom-foods', 'GET');
      if (response.body && Array.isArray(response.body)) {
        const foods = response.body.map((food: any) => ({
          ...food,
          name: food.name ?? food.food_name ?? '',
          nutrients: normalizeFoodNutrients(food.nutrients)
        }));
        setFoods(foods);
        try {
          localStorage.setItem('custom_foods_cache', JSON.stringify(foods));
        } catch (storageError) {
          // localStorage not available - skip caching
        }
      }
    } catch (error) {
      console.error('Error fetching custom foods:', error);
    }
  };

  const handleFoodClick = (foodId: string) => {
    if (selectedFood === foodId) {
      setSelectedFood(null);
      setNutrientsDetails([]);
      return;
    }

    setSelectedFood(foodId);
    tutorialEvent('tutorial:food-tag-clicked');

    // Get nutrient details for this food from cache
    const food = foods.find(f => f._id === foodId);
    if (!food) return;

    // Map nutrient IDs to their details using the cached data
    const details: NutrientInfo[] = Object.keys(food.nutrients)
      .map(nutrientId => {
        const nutrientIdNum = parseInt(nutrientId);
        const nutrientInfo = nutrientDetailsById[nutrientIdNum];

        if (!nutrientInfo) {
          console.warn(`Nutrient ${nutrientId} not found in cache`);
          return null;
        }

        return {
          nutrient_id: nutrientIdNum,
          name: nutrientInfo.name,
          amount: food.nutrients[nutrientId],
          unit: nutrientInfo.unit
        };
      })
      .filter((n): n is NutrientInfo => n !== null);

    setNutrientsDetails(details);
  };

  const refreshNutrients = async () => {
    if (!selectedFood) return;

    try {
      // Invalidate cache since we're updating nutrients
      try { localStorage.removeItem('custom_foods_cache'); } catch (e) {}

      const response = await request(`/food/custom_foods/${selectedFood}`, 'GET');
      const updatedFood = response.body;
      const normalizedFood = {
        ...updatedFood,
        name: updatedFood.name ?? updatedFood.food_name ?? '',
        nutrients: normalizeFoodNutrients(updatedFood.nutrients)
      };

      // Update foods list using functional update to ensure we have latest state
      setFoods(prevFoods => prevFoods.map(f =>
        f._id === selectedFood ? normalizedFood : f
      ));

      // Update nutrient details using cached data
      const details: NutrientInfo[] = Object.keys(normalizedFood.nutrients)
        .map(nutrientId => {
          const nutrientIdNum = parseInt(nutrientId);
          const nutrientInfo = nutrientDetailsById[nutrientIdNum];

          if (!nutrientInfo) {
            console.warn(`Nutrient ${nutrientId} not found in cache`);
            return null;
          }

          return {
            nutrient_id: nutrientIdNum,
            name: nutrientInfo.name,
            amount: normalizedFood.nutrients[nutrientId],
            unit: nutrientInfo.unit
          };
        })
        .filter((n): n is NutrientInfo => n !== null);

      setNutrientsDetails(details);
    } catch (error) {
      console.error('Error refreshing nutrients:', error);
    }
  };

  const deleteFood = async (foodId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    try {
      // Check if this food is used in any recipes
      const usageResponse = await request(`/food/custom_foods/${foodId}/used-in`, 'GET');
      const recipeNames: string[] = usageResponse.body?.recipe_names ?? [];

      if (recipeNames.length > 0) {
        const list = recipeNames.map(n => `"${n}"`).join(', ');
        const confirmed = window.confirm(
          `Are you sure? This food is used in the following recipes: ${list}.\n\nDeleting it will remove it from those recipes.`
        );
        if (!confirmed) return;
      }

      await request(`/food/custom_foods/${foodId}`, 'DELETE');

      try { localStorage.removeItem('custom_foods_cache'); } catch (e) {}
      setFoods(foods.filter(food => food._id !== foodId));
      if (selectedFood === foodId) {
        setSelectedFood(null);
        setNutrientsDetails([]);
      }
    } catch (error) {
      console.error('Error deleting food:', error);
    }
  };


  return (
    <>
      <FoodsGlobalStyles />
      <Header linkIcons={[{to: "/dashboard", img: <DashboardIcon/>}, {to: '/account', img: <AccountIcon/>}, {to: '/myfoods', img: <FoodBowl/>}, {to: '/myrecipes', img: <RecipesIcon/>}]}/>
      <Heading words={name ? `${name}'s Foods` : 'Foods'} />

      <FoodsContainer>
        <FoodsPageSubtitle>Track items you eat often, edit them, or add new ones.</FoodsPageSubtitle>
        <NewFood />

        {foods.length === 0 && pendingCustomFoods.length === 0 ? (
          <NoFoodsMessage>
            You haven't created any custom foods yet.
          </NoFoodsMessage>
        ) : (
          <FoodsTagsContainer>
            {foods.map(food => (
              <FoodTag
                key={food._id}
                className="food-tag"
                $selected={selectedFood === food._id}
                onClick={() => handleFoodClick(food._id)}
              >
                <FoodTagName>{food.name}</FoodTagName>
                <FoodTagDelete
                  onClick={(e) => deleteFood(food._id, e)}
                  aria-label="Delete food"
                >
                  ×
                </FoodTagDelete>
              </FoodTag>
            ))}
            {pendingCustomFoods.map(p => (
              <FoodTag key={p.timestamp} $pending>
                <AnimatedText text={p.name} />
              </FoodTag>
            ))}
          </FoodsTagsContainer>
        )}
      </FoodsContainer>

      {selectedFood && (
        <FoodModalOverlay onClick={() => { setSelectedFood(null); setNutrientsDetails([]); }}>
          <TutorialFoodDetailModal
            className="tutorial-food-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <NutrientPanel
              itemId={selectedFood}
              itemType="food"
              itemName={foods.find(f => f._id === selectedFood)?.name || ''}
              nutrients={nutrientsDetails}
              onUpdate={refreshNutrients}
            />
          </TutorialFoodDetailModal>
        </FoodModalOverlay>
      )}
    </>
  );
}

function FoodsPage(){
  return <Foods/>
}

export default FoodsPage;
