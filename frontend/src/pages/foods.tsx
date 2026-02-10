import React, { useState, useEffect } from 'react';
import { Header } from '../components/Sections';
import { Heading } from '../components/Title';
import AccountIcon from '../assets/images/account.svg?react';
import DashboardIcon from '../assets/images/dashboard.svg?react';
import Utensils from '../assets/images/utensils-solid.svg?react'
import { request } from '../components/endpoints';
import { useNavigate } from 'react-router-dom';
import { isLoginExpired } from '../components/utlis';
import { firstNameAtom, useRefreshAccountInfo, nutrientDetailsByIDAtom} from '../components/account_states';
import { useRecoilValue, useRecoilValueLoadable } from 'recoil';
import '../assets/css/foods.css';
import NewFood from '../components/NewFood';
import FoodBowl from '../assets/images/food_bowl.svg?react'
import {RecoilRoot} from 'recoil';
import { NutrientPanel } from '../components/NutrientPanel';
import { AnimatedText } from '../components/AnimatedText';

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



function Foods() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<string | null>(null);
  const [nutrientsDetails, setNutrientsDetails] = useState<NutrientInfo[]>([]);
  const [pendingFoodName, setPendingFoodName] = useState<string | null>(null);
  const refreshAccountInfo = useRefreshAccountInfo();
  const navigate = useNavigate();
  const name = useRecoilValue(firstNameAtom);
  const nutrientDetailsByIdLoadable = useRecoilValueLoadable(nutrientDetailsByIDAtom);
  const nutrientDetailsById = nutrientDetailsByIdLoadable.state === 'hasValue'
    ? nutrientDetailsByIdLoadable.contents
    : {} 

  // Fetch user's custom foods
  useEffect(() => {
    if (isLoginExpired()) {
      navigate('/login');
      return;
    }
    refreshAccountInfo()
    fetchFoods();
  }, []);

  // Listen for food processing and food added events
  useEffect(() => {
    const handleFoodProcessing = (e: Event) => {
      const customEvent = e as CustomEvent<{ name: string }>;
      setPendingFoodName(customEvent.detail?.name || 'new food');
    };

    const handleFoodAdded = (e: Event) => {
      const customEvent = e as CustomEvent<{ foodId: string }>;
      const foodId = customEvent.detail?.foodId;

      setPendingFoodName(null);

      try { localStorage.removeItem('custom_foods_cache'); } catch (e) {}
      fetchFoods(true);
    };

    const handleFoodProcessingDone = () => {
      setPendingFoodName(null);
    };

    window.addEventListener('food-processing', handleFoodProcessing);
    window.addEventListener('food-added', handleFoodAdded);
    window.addEventListener('food-processing-done', handleFoodProcessingDone);
    return () => {
      window.removeEventListener('food-processing', handleFoodProcessing);
      window.removeEventListener('food-added', handleFoodAdded);
      window.removeEventListener('food-processing-done', handleFoodProcessingDone);
    };
  }, []);

  const fetchFoods = async (forceRefresh = false) => {
    try {
      // Check cache first (unless forced refresh)
      if (!forceRefresh) {
        try {
          const cached = localStorage.getItem('custom_foods_cache');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              setFoods(parsed);
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
        const foods = response.body;
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

      // Update foods list using functional update to ensure we have latest state
      setFoods(prevFoods => prevFoods.map(f =>
        f._id === selectedFood ? updatedFood : f
      ));

      // Update nutrient details using cached data
      const details: NutrientInfo[] = Object.keys(updatedFood.nutrients || {})
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
            amount: updatedFood.nutrients[nutrientId],
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
    event.stopPropagation(); // Prevent triggering food selection

    try {
      await request(`/food/custom_foods/${foodId}`, 'DELETE');

      // Invalidate cache
      try { localStorage.removeItem('custom_foods_cache'); } catch (e) {}

      // Update local state
      setFoods(foods.filter(food => food._id !== foodId));

      // If the deleted food was selected, deselect it
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
      <Header linkIcons={[{to: "/dashboard", img: <DashboardIcon/>}, {to: '/account', img: <AccountIcon/>}, {to: '/myfoods', img: <Utensils/>}, {to: '/myrecipes', img: <FoodBowl/>}]}/>
      <Heading words={name ? `${name}'s Foods` : 'Your Foods'} />

      <div className="foods-container">
        <NewFood />

        {foods.length === 0 && !pendingFoodName ? (
          <div className="no-foods-message">
            You haven't created any custom foods yet.
          </div>
        ) : (
          <div className="foods-tags-container">
            {foods.map(food => (
              <div
                key={food._id}
                className={`food-tag ${selectedFood === food._id ? 'selected' : ''}`}
                onClick={() => handleFoodClick(food._id)}
              >
                <span className="food-tag-name">{food.name}</span>
                <button
                  className="food-tag-delete"
                  onClick={(e) => deleteFood(food._id, e)}
                  aria-label="Delete food"
                >
                  ×
                </button>
              </div>
            ))}
            {pendingFoodName && (
              <div className="food-tag pending">
                <AnimatedText text={pendingFoodName} />
              </div>
            )}
          </div>
        )}
      </div>

      {selectedFood && (
        <div className="food-modal-overlay" onClick={() => { setSelectedFood(null); setNutrientsDetails([]); }}>
          <div onClick={(e) => e.stopPropagation()}>
            <NutrientPanel
              itemId={selectedFood}
              itemType="food"
              itemName={foods.find(f => f._id === selectedFood)?.name || ''}
              nutrients={nutrientsDetails}
              onUpdate={refreshNutrients}
            />
          </div>
        </div>
      )}
    </>
  );
}

function FoodsPage(){
  return (
    <RecoilRoot>
      <Foods/>
    </RecoilRoot>
  )
}

export default FoodsPage;