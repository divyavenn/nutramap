import React, { useState, useRef, useEffect } from 'react';
import { request } from './endpoints';
import { HoverButton } from './Sections';
import Arrow from '../assets/images/arrow.svg?react';
import { useRefreshLogs, pendingFoodsAtom, PendingFood } from './dashboard_states';
import IsOk from '../assets/images/checkmark.svg?react'
import '../assets/css/new_log.css';
import { useSetRecoilState } from 'recoil';
import { tutorialEvent } from './TryTutorial';

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

    // Add to pending foods immediately
    const pendingMeal: PendingFood = {
      name: mealDescription,
      timestamp: new Date().toISOString()
    };
    console.log('Adding pending meal:', pendingMeal);
    setPendingFoods(prev => {
      const updated = [...prev, pendingMeal];
      console.log('Updated pending foods:', updated);
      return updated;
    });

    // Use the new recipe parsing endpoint
    try {
      const data = {
        meal_description: mealDescription,
        date: (() => {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      })()
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
      tutorialEvent('tutorial:log-created');

      // Invalidate recipes cache since parse-meal can create new recipes
      try { localStorage.removeItem('recipes_cache'); } catch (e) {}

      // Background processing takes time - poll for new logs
      // The endpoint returns immediately but logs are created asynchronously
      const maxPolls = 8;
      let pollCount = 0;

      const pollInterval = setInterval(async () => {
        pollCount++;
        await refreshLogs();
        // Wait a tick for React to render, then check if recipe bubble exists
        requestAnimationFrame(() => {
          if (document.querySelector('.recipe-bubble')) {
            tutorialEvent('tutorial:log-ready');
          }
        });

        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          // Remove pending food after max attempts
          setPendingFoods(prev => prev.filter(p => p.timestamp !== pendingMeal.timestamp));
        }
      }, 1500);

      // Also remove pending food after timeout as fallback
      setTimeout(() => {
        clearInterval(pollInterval);
        setPendingFoods(prev => prev.filter(p => p.timestamp !== pendingMeal.timestamp));
      }, 15000);
    } catch (error) {
      console.error('Error parsing meal:', error);
      setIsJiggling(false);
      setIsSubmitting(false);

      // Remove from pending on error
      setPendingFoods(prev => prev.filter(p => p.timestamp !== pendingMeal.timestamp));
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