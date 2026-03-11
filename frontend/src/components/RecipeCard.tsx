import React, { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { request } from './endpoints';
import { EditIngredientForm } from './IngredientEdit';
import { Confirm } from './Confirm';
import { AnimatedText } from './AnimatedText';
import SaveIcon from '../assets/images/save.svg?react';
import TrashcanIcon from '../assets/images/trashcan.svg?react';
import type { Recipe, RecipeIngredient } from './RecipeBlurb';
import { tutorialEvent } from './TryTutorial';
import {
  RecipeCardGlobalStyles,
  ModalOverlay,
  RecipeDetailModal,
  ModalCloseX,
  ModalHeader,
  RecipeNameDisplay,
  RecipeTitleEditRow,
  RecipeTitleNameInput,
  RecipeTitleLabelInput,
  RecipeTitleGramsInput,
  RecipeServingSuffix,
  RecipeTitleSep,
  ModalContent,
  IngredientsSection,
  ModalFooter,
  DeleteRecipeIconButton,
} from './RecipeCard.styled';

interface RecipeCardProps {
  recipe: Recipe;
  onClose: () => void;
  onDelete: (recipeId: string) => void;
  onUpdate: () => void;
  logId?: string;
  onUnlink?: () => void;
  onSyncLogs?: (recipeId: string) => void;
}

function RecipeCard({ recipe, onClose, onDelete, onUpdate, logId, onUnlink, onSyncLogs }: RecipeCardProps) {
  const [editedIngredients, setEditedIngredients] = useState<RecipeIngredient[]>(recipe.ingredients);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [hasEdits, setHasEdits] = useState(false);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  // When opened from a meal log, start in read-only mode
  const [isEditMode, setIsEditMode] = useState(!logId);

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
    setShowSyncConfirm(false);
    onClose();
    tutorialEvent('tutorial:recipe-synced');
    if (onSyncLogs) {
      onSyncLogs(recipe.recipe_id);
    } else {
      try {
        const formData = new FormData();
        formData.append('recipe_id', recipe.recipe_id);
        await request('/recipes/sync-logs', 'POST', formData);
      } catch (error) {
        console.error('Error syncing logs:', error);
      }
      onUpdate();
    }
  };

  const handleUnlinkFromLog = async () => {
    if (!logId) return;
    try {
      const fd = new FormData();
      fd.append('log_id', logId);
      await request('/recipes/unlink-log', 'POST', fd);
    } catch (error) {
      console.error('Error unlinking log from recipe:', error);
    }
    tutorialEvent('tutorial:recipe-unlinked');
    onUnlink?.();
    onClose();
  };

  const handleUnlinkLogs = async () => {
    setShowSyncConfirm(false);
    onClose();
    tutorialEvent('tutorial:recipe-synced');
    try {
      const formData = new FormData();
      formData.append('recipe_id', recipe.recipe_id);
      await request('/recipes/unlink-all-logs', 'POST', formData);
    } catch (error) {
      console.error('Error unlinking logs:', error);
    }
    onUpdate();
  };

  const overlayTransition = { duration: 0.2, ease: 'easeOut' } as const;
  const modalTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={overlayTransition}
    >
      <ModalOverlay onClick={handleClose}>
        <RecipeCardGlobalStyles />
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={modalTransition}
        >
          <RecipeDetailModal className="recipe-detail-modal" onClick={(e) => e.stopPropagation()}>
            <ModalCloseX
              as={motion.button}
              className="modal-close-x"
              onClick={handleClose}
              aria-label="Close"
              whileHover={{ rotate: -12, scale: 1.05, y: -1 }}
              whileTap={{ scale: 0.92, rotate: -2, y: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 20, mass: 0.6 }}
            >
              <SaveIcon aria-hidden="true" />
            </ModalCloseX>

            <ModalHeader>
              {isSavingTitle ? (
                <RecipeNameDisplay as="div" $saving>
                  <AnimatedText text={titleDisplayText()} />
                </RecipeNameDisplay>
              ) : isEditingTitle && isEditMode ? (
                <RecipeTitleEditRow
                  ref={titleRowRef}
                  onBlur={handleTitleBlur}
                >
                  <RecipeTitleNameInput
                    ref={nameInputRef}
                    value={recipeName}
                    onChange={(e) => setRecipeName(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    placeholder="recipe name"
                    style={{ width: `${Math.max(recipeName.length, 11) + 1}ch` }}
                    autoFocus
                  />
                  <RecipeTitleSep> - </RecipeTitleSep>
                  <RecipeTitleLabelInput
                    value={servingLabel}
                    onChange={(e) => setServingLabel(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    placeholder="1 bowl"
                    style={{ width: `${Math.max(servingLabel.length, 6) + 1}ch` }}
                  />
                  <RecipeTitleSep> (</RecipeTitleSep>
                  <RecipeTitleGramsInput
                    value={servingGrams}
                    onChange={(e) => setServingGrams(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    placeholder="350"
                    type="number"
                    min="0"
                    style={{ width: `${Math.max(servingGrams.length, 3) + 1}ch` }}
                  />
                  <RecipeTitleSep> grams)</RecipeTitleSep>
                </RecipeTitleEditRow>
              ) : (
                <RecipeNameDisplay
                  onClick={isEditMode ? () => {
                    setIsEditingTitle(true);
                    setTimeout(() => nameInputRef.current?.focus(), 0);
                  } : undefined}
                  style={isEditMode ? undefined : { cursor: 'default' }}
                >
                  {recipeName}
                  {servingLabel && servingGrams && (
                    <RecipeServingSuffix>{servingLabel} ({servingGrams} grams)</RecipeServingSuffix>
                  )}
                </RecipeNameDisplay>
              )}
            </ModalHeader>

            <ModalContent>
              <IngredientsSection className="ingredients-section">
                {editedIngredients.map((ingredient, index) => (
                  isEditMode ? (
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
                  ) : (
                    <div key={index} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      padding: '6px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      fontFamily: 'Inconsolata, monospace',
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.75)',
                    }}>
                      <span>{ingredient.food_name || 'Unknown'}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 12 }}>
                        {ingredient.amount || `${Math.round(ingredient.weight_in_grams)}g`}
                      </span>
                    </div>
                  )
                ))}
                {isEditMode && (
                  <EditIngredientForm
                    food_name={''}
                    amount={''}
                    weight_in_grams={0}
                    recipeId={recipe.recipe_id}
                    onSave={handleIngredientSave}
                    onDelete={handleIngredientDelete}
                    onCancel={() => setEditingIndex(null)}
                  />
                )}
              </IngredientsSection>
            </ModalContent>

            {/* Bottom buttons: Edit+Unlink when opened from log (read-only), Delete when in edit mode */}
            {logId && !isEditMode && (
              <div style={{
                position: 'absolute',
                bottom: 24,
                left: 0,
                right: 0,
                display: 'flex',
                justifyContent: 'center',
                gap: 16,
              }}>
                <button
                  onClick={() => setIsEditMode(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    fontFamily: 'Inconsolata, monospace',
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: '6px 10px',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = 'rgba(255,255,255,0.85)'; }}
                  onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)'; }}
                >
                  edit
                </button>
                <button
                  className="tutorial-unlink-btn"
                  onClick={handleUnlinkFromLog}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    fontFamily: 'Inconsolata, monospace',
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: '6px 10px',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = 'rgba(255,255,255,0.85)'; }}
                  onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)'; }}
                >
                  unlink
                </button>
              </div>
            )}

            {isEditMode && (
              <ModalFooter>
                <DeleteRecipeIconButton
                  as={motion.button}
                  onClick={() => onDelete(recipe.recipe_id)}
                  title="Delete Recipe"
                  aria-label="Delete Recipe"
                  whileHover={{ scale: 1.08, y: -1 }}
                  whileTap={{ scale: 0.92, y: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 20, mass: 0.6 }}
                >
                  <TrashcanIcon aria-hidden="true" />
                </DeleteRecipeIconButton>
              </ModalFooter>
            )}
          </RecipeDetailModal>
        </motion.div>

        <AnimatePresence>
          {showSyncConfirm && (
            <motion.div
              style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
            >
              <Confirm
                message="update all previous meals using this recipe?"
                ifYesDo={handleSyncLogs}
                ifNoDo={handleUnlinkLogs}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </ModalOverlay>
    </motion.div>
  );
}

export { RecipeCard };
