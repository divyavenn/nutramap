import React, { useState, useEffect } from 'react';
import { Header } from '../components/Sections';
import { Heading } from '../components/Title';
import Account from '../assets/images/account.svg?react';
import Dashboard from '../assets/images/dashboard.svg?react'
import Trashcan from '../assets/images/trashcan.svg?react';
import { request } from '../components/endpoints';
import { useNavigate } from 'react-router-dom';
import { isLoginExpired } from '../components/utlis';
import { firstNameAtom } from '../components/account_states'; 
import { useRecoilValue } from 'recoil';
import '../assets/css/foods.css';
import NewFood from '../components/NewFood';

interface Food {
  _id: string;
  name: string;
  nutrients: {
    [key: string]: number;
  };
}

function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [expandedFood, setExpandedFood] = useState<string | null>(null);
  const [editingFood, setEditingFood] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [showNewFood, setShowNewFood] = useState(false);
  const navigate = useNavigate();

  // Fetch user's custom foods
  useEffect(() => {
    if (isLoginExpired()) {
      navigate('/login');
      return;
    }

    fetchFoods();
  }, [navigate]);

  // Listen for food added event
  useEffect(() => {
    const handleFoodAdded = () => {
      fetchFoods();
    };

    document.addEventListener('foodAdded', handleFoodAdded);
    return () => {
      document.removeEventListener('foodAdded', handleFoodAdded);
    };
  }, []);

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

  const toggleExpand = (foodId: string) => {
    setExpandedFood(expandedFood === foodId ? null : foodId);
  };

  const startEditing = (food: Food) => {
    setEditingFood(food._id);
    setEditedName(food.name);
  };

  const saveEditedName = async (foodId: string) => {
    try {
      await request(`/food/update-custom-food/${foodId}`, 'PUT', { name: editedName });
      
      // Update local state
      setFoods(foods.map(food => 
        food._id === foodId ? { ...food, name: editedName } : food
      ));
      
      setEditingFood(null);
    } catch (error) {
      console.error('Error updating food name:', error);
    }
  };

  const deleteFood = async (foodId: string) => {
    try {
      await request(`/food/delete-custom-food/${foodId}`, 'DELETE');
      
      // Update local state
      setFoods(foods.filter(food => food._id !== foodId));
      
      // If the deleted food was expanded, collapse it
      if (expandedFood === foodId) {
        setExpandedFood(null);
      }
    } catch (error) {
      console.error('Error deleting food:', error);
    }
  };

  const toggleNewFood = () => {
    setShowNewFood(!showNewFood);
  };

  return (
    <>
      <Header linkIcons={[{to: '/account', img: <Account/>}, {to: '/dashboard', img: <Dashboard/>}]}/>
      <Heading words={`${useRecoilValue(firstNameAtom)}'s Foods`} />
      
      <div className="foods-container">
        <div className="foods-actions">
          <button 
            className="add-food-button" 
            onClick={toggleNewFood}
            aria-label={showNewFood ? "Hide add food form" : "Show add food form"}
          >
            {showNewFood ? "Cancel" : "Add Custom Food"}
          </button>
        </div>
        
        {showNewFood && <NewFood />}
        
        {foods.length === 0 ? (
          <div className="no-foods-message">
            You haven't created any custom foods yet.
          </div>
        ) : (
          <ul className="foods-list">
            {foods.map(food => (
              <li key={food._id} className="food-item">
                <div className="food-header">
                  {editingFood === food._id ? (
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onBlur={() => saveEditedName(food._id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEditedName(food._id);
                        if (e.key === 'Escape') setEditingFood(null);
                      }}
                      autoFocus
                      className="food-name-input"
                    />
                  ) : (
                    <div 
                      className="food-name" 
                      onClick={() => toggleExpand(food._id)}
                      onDoubleClick={() => startEditing(food)}
                    >
                      {food.name}
                    </div>
                  )}
                  
                  <button 
                    className="delete-food-button" 
                    onClick={() => deleteFood(food._id)}
                    aria-label="Delete food"
                  >
                    <Trashcan />
                  </button>
                </div>
                
                {expandedFood === food._id && (
                  <div className="food-details">
                    <h4>Nutritional Information</h4>
                    <table className="nutrients-table">
                      <tbody>
                        {Object.entries(food.nutrients).map(([nutrient, value]) => (
                          <tr key={nutrient}>
                            <td className="nutrient-name">{nutrient}</td>
                            <td className="nutrient-value">{value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default FoodsPage;