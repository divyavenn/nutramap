import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { request } from './endpoints';
import { EditIngredientForm } from './IngredientEdit';
import { Confirm } from './Confirm';
import SaveIcon from '../assets/images/save.svg?react';
import TrashcanIcon from '../assets/images/trashcan.svg?react';
import type { Recipe, RecipeIngredient } from './RecipeBlurb';
import { tutorialEvent } from './TryTutorial';
import '../assets/css/myrecipes.css';

interface RecipeCardProps {
  recipe: Recipe;
  onClose: () => void;
  onDelete: (recipeId: string) => void;
  onUpdate: () => void;
}

function RecipeCard({ recipe, onClose, onDelete, onUpdate }: RecipeCardProps) {
  const [editedIngredients, setEditedIngredients] = useState<RecipeIngredient[]>(recipe.ingredients);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [recipeName, setRecipeName] = useState(recipe.description);
  const [isEditingName, setIsEditingName] = useState(false);
  const [hasEdits, setHasEdits] = useState(false);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    tutorialEvent('tutorial:recipe-opened');
  }, []);

  const refreshRecipeData = async () => {
    try {
      // Fetch updated recipe data from the backend
      const response = await request('/recipes/list', 'GET');
      if (response.body && response.body.recipes) {
        const updatedRecipe = response.body.recipes.find((r: Recipe) => r.recipe_id === recipe.recipe_id);
        if (updatedRecipe) {
          setEditedIngredients(updatedRecipe.ingredients);
        }
      }
    } catch (error) {
      console.error('Error refreshing recipe data:', error);
    }
  };

  const handleNameBlur = async () => {
    setIsEditingName(false);
    const trimmed = recipeName.trim();
    if (!trimmed || trimmed === recipe.description) {
      setRecipeName(recipe.description);
      return;
    }
    try {
      const formData = new FormData();
      formData.append('recipe_id', recipe.recipe_id);
      formData.append('description', trimmed);
      const response = await request('/recipes/rename', 'POST', formData);
      if (response.status === 200) {
        onUpdate();
      } else {
        setRecipeName(recipe.description);
      }
    } catch (error) {
      console.error('Error renaming recipe:', error);
      setRecipeName(recipe.description);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameInputRef.current?.blur();
    }
    if (e.key === 'Escape') {
      setRecipeName(recipe.description);
      setIsEditingName(false);
    }
  };

  const handleIngredientSave = async () => {
    await refreshRecipeData();
    setHasEdits(true);
    setEditingIndex(null);
    tutorialEvent('tutorial:ingredient-edited');
  };

  const handleIngredientDelete = async () => {
    await refreshRecipeData();
    setHasEdits(true);
    setEditingIndex(null);
    tutorialEvent('tutorial:ingredient-edited');
  };

  const handleClose = () => {
    if (hasEdits) {
      setShowSyncConfirm(true);
      tutorialEvent('tutorial:sync-shown');
    } else {
      onClose();
    }
  };

  const handleOverlayClick = () => {
    handleClose();
  };

  const handleSyncLogs = async () => {
    try {
      const formData = new FormData();
      formData.append('recipe_id', recipe.recipe_id);
      await request('/recipes/sync-logs', 'POST', formData);
    } catch (error) {
      console.error('Error syncing logs:', error);
    }
    setShowSyncConfirm(false);
    onUpdate();
    onClose();
    tutorialEvent('tutorial:recipe-synced');
  };

  const handleUnlinkLogs = async () => {
    try {
      const formData = new FormData();
      formData.append('recipe_id', recipe.recipe_id);
      await request('/recipes/unlink-all-logs', 'POST', formData);
    } catch (error) {
      console.error('Error unlinking logs:', error);
    }
    setShowSyncConfirm(false);
    onUpdate();
    tutorialEvent('tutorial:recipe-synced');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="recipe-detail-modal" onClick={(e) => e.stopPropagation()}>
        <motion.button
          className="modal-close-x"
          onClick={handleClose}
          aria-label="Close"
          whileHover={{
            rotate: -12,
            scale: 1.05,
            y: -1,
          }}
          whileTap={{ scale: 0.92, rotate: -2, y: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 20, mass: 0.6 }}
        >
          <SaveIcon className="modal-close-icon" aria-hidden="true" focusable="false" />
        </motion.button>
        <div className="modal-header">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              className="recipe-name-display"
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              autoFocus
            />
          ) : (
            <h2 onClick={() => setIsEditingName(true)} className="recipe-name-display">
              {recipeName}
            </h2>
          )}
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
              <EditIngredientForm
                food_name={''}
                amount={''}
                weight_in_grams={0}
                recipeId={recipe.recipe_id}
                onSave={handleIngredientSave}
                onDelete={handleIngredientDelete}
                onCancel={() => setEditingIndex(null)}
              />
          </div>
        </div>

        <div className="modal-footer">
          <motion.button
            className="delete-recipe-icon-button"
            onClick={() => onDelete(recipe.recipe_id)}
            title="Delete Recipe"
            aria-label="Delete Recipe"
            whileHover={{ scale: 1.08, y: -1 }}
            whileTap={{ scale: 0.92, y: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 20, mass: 0.6 }}
          >
            <TrashcanIcon className="delete-recipe-icon" aria-hidden="true" focusable="false" />
          </motion.button>
        </div>
      </div>

      {showSyncConfirm && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <Confirm
            message="update all previous meals using this recipe?"
            ifYesDo={handleSyncLogs}
            ifNoDo={handleUnlinkLogs}
          />
        </div>
      )}
    </div>
  );
}

export { RecipeCard };
