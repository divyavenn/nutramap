import React, { useState, useEffect } from 'react';
import { Header } from '../components/Sections';
import { Heading } from '../components/Title';
import Account from '../assets/images/account.svg?react';
import Utensils from '../assets/images/utensils-solid.svg?react';
import Trashcan from '../assets/images/trashcan.svg?react';
import { request } from '../components/endpoints';
import { useNavigate } from 'react-router-dom';
import { isLoginExpired } from '../components/utlis';
import { HoverButton } from '../components/Sections';
import YesOk from '../assets/images/check_circle.svg?react';

import '../assets/css/foods.css';

interface Food {
  _id: string;
  food_name: string;
  nutrients: {
    nutrient_id: string;
    amount: number;
  }[];
  source: string;
}

interface NutrientInfo {
  _id: string;
  name: string;
  unit: string;
}

function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [expandedFood, setExpandedFood] = useState<string | null>(null);
  const [editingFood, setEditingFood] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newFoodDescription, setNewFoodDescription] = useState('');
  const [newFoodImageUrl, setNewFoodImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nutrientInfo, setNutrientInfo] = useState<Record<string, NutrientInfo>>({});
  const navigate = useNavigate();

  // Fetch user's custom foods
  useEffect(() => {
    if (isLoginExpired()) {
      navigate('/login');
      return;
    }

    const fetchFoods = async () => {
      try {
        const response = await request('/foods/custom-foods', 'GET');
        if (response.body) {
          setFoods(response.body);
        }
      } catch (error) {
        console.error('Error fetching custom foods:', error);
      }
    };

    const fetchNutrientInfo = async () => {
      try {
        const response = await request('/nutrients/all', 'GET');
        if (response.body) {
          // Convert array to object with _id as key
          const nutrientMap: Record<string, NutrientInfo> = {};
          response.body.forEach((nutrient: NutrientInfo) => {
            nutrientMap[nutrient._id] = nutrient;
          });
          setNutrientInfo(nutrientMap);
        }
      } catch (error) {
        console.error('Error fetching nutrient info:', error);
      }
    };

    fetchFoods();
    fetchNutrientInfo();
  }, [navigate]);

  const toggleExpand = (foodId: string) => {
    setExpandedFood(expandedFood === foodId ? null : foodId);
  };

  const startEditing = (food: Food) => {
    setEditingFood(food._id);
    setEditedName(food.food_name);
  };

  const saveEditedName = async (foodId: string) => {
    try {
      await request(`/foods/${foodId}`, 'PUT', { name: editedName });
      
      // Update local state
      setFoods(foods.map(food => 
        food._id === foodId ? { ...food, food_name: editedName } : food
      ));
      
      setEditingFood(null);
    } catch (error) {
      console.error('Error updating food name:', error);
    }
  };

  const deleteFood = async (foodId: string) => {
    try {
      await request(`/foods/${foodId}`, 'DELETE');
      
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

  const handleAddFood = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newFoodDescription.trim()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Create form data for multipart/form-data request
      const formData = new FormData();
      formData.append('food_description', newFoodDescription);
      
      if (newFoodImageUrl.trim()) {
        formData.append('image_url', newFoodImageUrl);
      }
      
      const response = await fetch('/api/foods/add-custom-food', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Refresh the foods list
        const foodsResponse = await request('/foods/custom-foods', 'GET');
        if (foodsResponse.body) {
          setFoods(foodsResponse.body);
        }
        
        // Reset form
        setNewFoodDescription('');
        setNewFoodImageUrl('');
        setShowAddDialog(false);
      } else {
        console.error('Failed to add food:', await response.text());
      }
    } catch (error) {
      console.error('Error adding food:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getNutrientName = (nutrientId: string) => {
    return nutrientInfo[nutrientId]?.name || 'Unknown Nutrient';
  };

  const getNutrientUnit = (nutrientId: string) => {
    return nutrientInfo[nutrientId]?.unit || '';
  };

  return (
    <>
      <Header linkIcons={[{to: '/account', img: <Account/>}, {to: '/dashboard', img: <Utensils/>}]}/>
      <Heading words={'My Custom Foods'} />
      
      <div className="foods-container">
        <div className="foods-header">
          <button 
            className="add-food-button"
            onClick={() => setShowAddDialog(true)}
          >
            + Add Custom Food
          </button>
        </div>
        
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
                      {food.food_name}
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
                        {food.nutrients.map((nutrient) => (
                          <tr key={nutrient.nutrient_id}>
                            <td className="nutrient-name">{getNutrientName(nutrient.nutrient_id)}</td>
                            <td className="nutrient-value">
                              {nutrient.amount} {getNutrientUnit(nutrient.nutrient_id)}
                            </td>
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
      
      {/* Add Food Dialog */}
      {showAddDialog && (
        <div className="dialog-overlay">
          <div className="add-food-dialog">
            <h3>Add Custom Food</h3>
            <form onSubmit={handleAddFood}>
              <div className="form-group">
                <label htmlFor="food-description">Food Description:</label>
                <textarea
                  id="food-description"
                  value={newFoodDescription}
                  onChange={(e) => setNewFoodDescription(e.target.value)}
                  placeholder="Describe the food in detail (e.g., 'Homemade chocolate chip cookie with walnuts')"
                  rows={4}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="image-url">Image URL (optional):</label>
                <input
                  type="url"
                  id="image-url"
                  value={newFoodImageUrl}
                  onChange={(e) => setNewFoodImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
              </div>
              
              <div className="dialog-buttons">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => setShowAddDialog(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="submit-button"
                  disabled={isSubmitting || !newFoodDescription.trim()}
                >
                  <YesOk />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default FoodsPage;