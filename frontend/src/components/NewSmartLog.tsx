import React, { useState, useRef, useEffect } from 'react';
import { request } from './endpoints';
import { HoverButton } from './Sections';
import Arrow from '../assets/images/arrow.svg?react';
import { useRefreshLogs, pendingFoodsAtom, PendingFood } from './dashboard_states';
import IsOk from '../assets/images/checkmark.svg?react'
import '../assets/css/new_log.css';
import '../assets/css/edit_log.css'
import { motion, AnimatePresence } from 'framer-motion';
import { formatTime } from './utlis';
import { useSetRecoilState, useRecoilValue } from 'recoil';

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
  const pendingFoods = useRecoilValue(pendingFoodsAtom);
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
    
    // Start the API request immediately
    try {
      const response = await request(
        '/match/log-meal',
        'POST',
        {
          meal_description: mealDescription,
        },
        'JSON'
      );
      
      setMealDescription('');
      setIsJiggling(false);
      setIsSubmitting(false);

      // If we get the early response with food count
      if (response && 
          response.body && 
          typeof response.body === 'object' && 
          response.body.status === 'processing' && 
          Array.isArray(response.body.foods)) {
        
        // Convert the foods array with timestamps to our PendingFood format
        const foodsWithTimestamps: PendingFood[] = response.body.foods.map((foodObj: any) => {
          const foodName = Object.keys(foodObj)[0];
          const timestamp = foodObj[foodName];
          return { name: foodName, timestamp };
        });
        
        // Set the global state for pending foods
        setPendingFoods(foodsWithTimestamps);
        
        // Refresh logs after a delay to allow background processing to complete
        setTimeout(() => {
          refreshLogs();
          setPendingFoods([]);
        }, 3000);
      } else {
        // Handle the old response format if needed
        refreshLogs();
      }
    } catch (error) {
      console.error('Error logging meal:', error);
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
            className={`input-journal ${isJiggling ? 'jiggle-text' : ''}`}
            placeholder="a bowl of steel-cut oats with blueberries and a cup of coffee with whole milk for breakfast"
            value={mealDescription}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            required
          />
          <div className='new-smart-log-button-container'>
            {mealDescription && (
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