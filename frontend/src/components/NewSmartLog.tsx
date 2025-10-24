import React, { useState, useRef, useEffect } from 'react';
import { request } from './endpoints';
import { HoverButton } from './Sections';
import Arrow from '../assets/images/arrow.svg?react';
import { useRefreshLogs, pendingFoodsAtom, PendingFood } from './dashboard_states';
import IsOk from '../assets/images/checkmark.svg?react'
import '../assets/css/new_log.css';
import { useSetRecoilState } from 'recoil';

/**
 * NewSmartLog component for natural language meal logging
 * This component uses the /match/log-meal endpoint which leverages:
 * - Dense vector search for semantic matching
 * - Sparse vector search for keyword matching
 * - Reciprocal Rank Fusion to combine results
 */

function NewSmartLog() {
  const [mealDescription, setMealDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isJiggling, setIsJiggling] = useState(false);
  // Use the global state for pending foods
  const setPendingFoods = useSetRecoilState(pendingFoodsAtom); 
  const refreshLogs = useRefreshLogs();
  const formRef = useRef<HTMLFormElement>(null);

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMealDescription(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit form on Enter without Shift key
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent newline
      if (mealDescription.trim()) {
        handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!mealDescription.trim()) return;

    setIsSubmitting(true);
    setIsJiggling(true);

    // Use the new recipe parsing endpoint
    try {
      const data = {
        meal_description: mealDescription,
        date: new Date().toISOString()
      };

      const response = await request(
        '/recipes/parse-meal',
        'POST',
        data,
        'URLencode'
      );

      setMealDescription('');
      setIsJiggling(false);
      setIsSubmitting(false);

      if (response && response.body && response.body.recipes) {
        // Extract all recipe descriptions for pending state
        const pendingRecipes: PendingFood[] = response.body.recipes.flatMap((recipe: any) =>
          recipe.ingredients.map((ing: any) => ({
            name: recipe.description + ' - ' + (ing.food_name || 'ingredient'),
            timestamp: new Date().toISOString()
          }))
        );

        // Set pending foods to show blur effect
        setPendingFoods(pendingRecipes);

        // Refresh logs after a short delay to show the new recipe-grouped logs
        setTimeout(() => {
          setPendingFoods([]);
          refreshLogs();
        }, 1000);
      } else {
        // Fallback to immediate refresh
        refreshLogs();
      }
    } catch (error) {
      console.error('Error parsing meal:', error);
      setIsJiggling(false);
      setIsSubmitting(false);
      // Still refresh to show any partial results
      refreshLogs();
    }
  };


  return (
    <>
      <form
        ref={formRef}
        id="login-form" 
        className="form-elements-wrapper" 
        onSubmit={handleSubmit}
      >
         <div className = "entry-form-bubble">
          <textarea
            className={`new-log-input-journal ${isJiggling ? 'jiggle-text' : ''}`}
            placeholder="a bowl of steel-cut oats with blueberries with a 12oz latte"
            value={mealDescription}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            required
          />
          <div className='new-smart-log-button-container'>
            {!isSubmitting && mealDescription && (
              <HoverButton
                type="submit"
                className="new-log-button"
                childrenOn={<IsOk/>}
                childrenOff={<Arrow/>}
                disabled={isSubmitting}
              >
              </HoverButton>
            )}
          </div>
          </div>
      </form>
    </>
  );
}

export default NewSmartLog;