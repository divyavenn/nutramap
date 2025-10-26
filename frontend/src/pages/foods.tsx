import React, { useState, useEffect, useRef } from 'react';
import { Header } from '../components/Sections';
import { Heading } from '../components/Title';
import Account from '../assets/images/account.svg?react';
import Dashboard from '../assets/images/dashboard.svg?react'
import { request } from '../components/endpoints';
import { useNavigate } from 'react-router-dom';
import { isLoginExpired } from '../components/utlis';
import { firstNameAtom, useRefreshAccountInfo} from '../components/account_states';
import { useRecoilValue } from 'recoil';
import '../assets/css/foods.css';
import '../assets/css/NutrientStats.css';
import NewFood from '../components/NewFood';
import {RecoilRoot} from 'recoil';
import { EditFoodNutrientForm } from '../components/NutrientPanel';
import AddLogButton from '../assets/images/plus.svg?react'
import { ImageButton } from '../components/Sections';

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
  const [editing, setEditing] = useState<boolean>(false);
  const editFormRef = useRef<HTMLDivElement>(null);
  const refreshAccountInfo = useRefreshAccountInfo();
  const navigate = useNavigate();
  const name = useRecoilValue(firstNameAtom) 

  // Fetch user's custom foods
  useEffect(() => {
    if (isLoginExpired()) {
      navigate('/login');
      return;
    }
    refreshAccountInfo()
    fetchFoods();
  }, []);

  // Listen for food added event
  useEffect(() => {
    const handleFoodAdded = () => {
      fetchFoods();
    };

    document.addEventListener('food-added', handleFoodAdded);
    return () => {
      document.removeEventListener('food-added', handleFoodAdded);
    };
  }, []);

  // Handle clicks outside edit form
  useEffect(() => {
    if (editFormRef.current && editing) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editFormRef, editing]);

  const handleClickOutside = (event: MouseEvent) => {
    if (editFormRef.current && !editFormRef.current.contains(event.target as Node)) {
      setEditing(false);
    }
  };

  const fetchFoods = async () => {
    try {
      const response = await request('/food/custom-foods', 'GET');
      if (response.body) {
        setFoods(response.body);
      }
    } catch (error) {
      console.error('Error fetching custom foods:', error);
    }
  };

  const handleFoodClick = async (foodId: string) => {
    if (selectedFood === foodId) {
      setSelectedFood(null);
      setNutrientsDetails([]);
      setEditing(false);
      return;
    }

    setSelectedFood(foodId);
    setEditing(false);

    // Fetch nutrient details for this food
    const food = foods.find(f => f._id === foodId);
    if (!food) return;

    try {
      // Get nutrient names and units from backend
      const nutrientPromises = Object.keys(food.nutrients).map(async (nutrientId) => {
        const response = await request(`/nutrients/${nutrientId}`, 'GET');
        return {
          nutrient_id: parseInt(nutrientId),
          name: response.body.name,
          amount: food.nutrients[nutrientId],
          unit: response.body.unit
        };
      });

      const details = await Promise.all(nutrientPromises);
      setNutrientsDetails(details);
    } catch (error) {
      console.error('Error fetching nutrient details:', error);
    }
  };

  const refreshNutrients = async () => {
    if (!selectedFood) return;

    // Refresh the nutrients for the selected food
    const food = foods.find(f => f._id === selectedFood);
    if (!food) return;

    try {
      const response = await request(`/food/custom_foods/${selectedFood}`, 'GET');
      const updatedFood = response.body;

      // Update foods list
      setFoods(foods.map(f => f._id === selectedFood ? updatedFood : f));

      // Update nutrient details
      const nutrientPromises = Object.keys(updatedFood.nutrients).map(async (nutrientId) => {
        const response = await request(`/nutrients/${nutrientId}`, 'GET');
        return {
          nutrient_id: parseInt(nutrientId),
          name: response.body.name,
          amount: updatedFood.nutrients[nutrientId],
          unit: response.body.unit
        };
      });

      const details = await Promise.all(nutrientPromises);
      setNutrientsDetails(details);
    } catch (error) {
      console.error('Error refreshing nutrients:', error);
    }
  };

  const toggleEditing = () => {
    setEditing(!editing);
  };

  const deleteFood = async (foodId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering food selection

    if (!confirm('Are you sure you want to delete this food?')) {
      return;
    }

    try {
      await request(`/food/custom_foods/${foodId}`, 'DELETE');

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
      <Header linkIcons={[{to: '/account', img: <Account/>}, {to: '/dashboard', img: <Dashboard/>}]}/>
      <Heading words={`${name}'s Foods`} />

      <div className="foods-container">
        <NewFood />

        {foods.length === 0 ? (
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
          </div>
        )}
      </div>

      {selectedFood && (
        <div className="food-modal-overlay" onClick={() => { setSelectedFood(null); setNutrientsDetails([]); setEditing(false); }}>
          <div className="food-nutrient-dashboard" onClick={(e) => e.stopPropagation()}>
            <div className="food-dashboard-title">
              {foods.find(f => f._id === selectedFood)?.name}
            </div>

            <div className="requirement-edit-wrapper" ref={editFormRef}>
              {!editing ? (
                nutrientsDetails.length === 0 ? (
                  <div className="no-req-message">no nutrients</div>
                ) : (
                  <div className="nutrient-list-wrapper">
                    {nutrientsDetails.map(nutrient => (
                      <div key={nutrient.nutrient_id} className="dashboard-row">
                        <div className="nutrient-name-wrapper">
                          <div className="nutrient-name">{nutrient.name}</div>
                        </div>
                        <div className="today-stats-wrapper">
                          <div className="daily-intake">
                            {nutrient.amount} {nutrient.unit}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="nutrient-edit-list-wrapper">
                  {nutrientsDetails.map(nutrient => (
                    <EditFoodNutrientForm
                      key={nutrient.nutrient_id}
                      original={nutrient}
                      foodId={selectedFood}
                      onUpdate={refreshNutrients}
                    />
                  ))}
                  <EditFoodNutrientForm
                    foodId={selectedFood}
                    onUpdate={refreshNutrients}
                  />
                </div>
              )}
            </div>

            {!editing && (
              <ImageButton onClick={toggleEditing}>
                <AddLogButton />
              </ImageButton>
            )}
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