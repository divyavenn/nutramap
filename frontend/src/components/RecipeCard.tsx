import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { request } from './endpoints';
import { EditIngredientForm } from './IngredientEdit';
import { Confirm } from './Confirm';
import { AnimatedText } from './AnimatedText';
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
  const [hasEdits, setHasEdits] = useState(false);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);

  // Unified title state
  const [recipeName, setRecipeName] = useState(recipe.description);
  const [servingLabel, setServingLabel] = useState(recipe.serving_size_label ?? '');
  const [servingGrams, setServingGrams] = useState(recipe.serving_size_grams?.toString() ?? '');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const titleRowRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    tutorialEvent('tutorial:recipe-opened');
  }, []);

  const titleDisplayText = () => {
    const base = recipeName || recipe.description;
    if (servingLabel && servingGrams) {
      return `${base} - ${servingLabel} (${servingGrams} grams)`;
    }
    return base;
  };

  const saveTitle = async () => {
    setIsEditingTitle(false);

    const trimmedName = recipeName.trim() || recipe.description;
    const trimmedLabel = servingLabel.trim();
    const gramsNum = parseFloat(servingGrams);
    const validServing = trimmedLabel.length > 0 && !isNaN(gramsNum) && gramsNum > 0;

    // Revert to originals if invalid
    if (!trimmedName) {
      setRecipeName(recipe.description);
    }
    if (!validServing) {
      setServingLabel(recipe.serving_size_label ?? '');
      setServingGrams(recipe.serving_size_grams?.toString() ?? '');
    }

    const nameChanged = trimmedName && trimmedName !== recipe.description;
    const servingChanged = validServing && (
      trimmedLabel !== (recipe.serving_size_label ?? '') ||
      gramsNum !== (recipe.serving_size_grams ?? 0)
    );

    if (!nameChanged && !servingChanged) return;

    // Show animated text while saving
    setIsSavingTitle(true);

    const saves: Promise<any>[] = [];

    if (nameChanged) {
      const fd = new FormData();
      fd.append('recipe_id', recipe.recipe_id);
      fd.append('description', trimmedName);
      saves.push(request('/recipes/rename', 'POST', fd));
    }

    if (servingChanged) {
      const fd = new FormData();
      fd.append('recipe_id', recipe.recipe_id);
      fd.append('serving_size_label', trimmedLabel);
      fd.append('serving_size_grams', String(gramsNum));
      saves.push(request('/recipes/update-serving-size', 'POST', fd));
    }

    try {
      await Promise.all(saves);
      onUpdate();
    } catch (error) {
      console.error('Error saving title:', error);
      setRecipeName(recipe.description);
      setServingLabel(recipe.serving_size_label ?? '');
      setServingGrams(recipe.serving_size_grams?.toString() ?? '');
    }

    setTimeout(() => setIsSavingTitle(false), 1500);
  };

  const handleTitleBlur = (e: React.FocusEvent) => {
    // Don't save if focus is moving to another input within the title row
    if (titleRowRef.current?.contains(e.relatedTarget as Node)) return;
    saveTitle();
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      setRecipeName(recipe.description);
      setServingLabel(recipe.serving_size_label ?? '');
      setServingGrams(recipe.serving_size_grams?.toString() ?? '');
      setIsEditingTitle(false);
    }
  };

  const refreshRecipeData = async () => {
    try {
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
    <div className="modal-overlay" onClick={handleClose}>
      <div className="recipe-detail-modal" onClick={(e) => e.stopPropagation()}>
        <motion.button
          className="modal-close-x"
          onClick={handleClose}
          aria-label="Close"
          whileHover={{ rotate: -12, scale: 1.05, y: -1 }}
          whileTap={{ scale: 0.92, rotate: -2, y: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 20, mass: 0.6 }}
        >
          <SaveIcon className="modal-close-icon" aria-hidden="true" focusable="false" />
        </motion.button>

        <div className="modal-header">
          {isSavingTitle ? (
            <div className="recipe-name-display recipe-title-saving">
              <AnimatedText text={titleDisplayText()} />
            </div>
          ) : isEditingTitle ? (
            <div
              ref={titleRowRef}
              className="recipe-title-edit-row"
              onBlur={handleTitleBlur}
            >
              <input
                ref={nameInputRef}
                className="recipe-title-input recipe-title-name-input"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                placeholder="recipe name"
                style={{ width: `${Math.max(recipeName.length, 11) + 1}ch` }}
                autoFocus
              />
              <span className="recipe-title-sep"> - </span>
              <input
                className="recipe-title-input recipe-title-label-input"
                value={servingLabel}
                onChange={(e) => setServingLabel(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                placeholder="1 bowl"
                style={{ width: `${Math.max(servingLabel.length, 6) + 1}ch` }}
              />
              <span className="recipe-title-sep"> (</span>
              <input
                className="recipe-title-input recipe-title-grams-input"
                value={servingGrams}
                onChange={(e) => setServingGrams(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                placeholder="350"
                type="number"
                min="0"
                style={{ width: `${Math.max(servingGrams.length, 3) + 1}ch` }}
              />
              <span className="recipe-title-sep"> grams)</span>
            </div>
          ) : (
            <h2
              className="recipe-name-display"
              onClick={() => {
                setIsEditingTitle(true);
                setTimeout(() => nameInputRef.current?.focus(), 0);
              }}
            >
              {recipeName}
              {servingLabel && servingGrams && (
                <span className="recipe-serving-suffix">{servingLabel} ({servingGrams} grams)</span>
              )}
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
