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
  const [showPixelation, setShowPixelation] = useState(false);
  const [pixelSize, setPixelSize] = useState(1);
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
    
    // Start pixelation animation immediately
    setShowPixelation(true);
    
    // Animate pixel size from 1 to 20 over 800ms
    const startTime = Date.now();
    const duration = 800;
    const animatePixels = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const newPixelSize = 1 + Math.floor(progress * 19); // 1 to 20
      setPixelSize(newPixelSize);
      
      if (progress < 1 && showPixelation) {
        requestAnimationFrame(animatePixels);
      }
    };
    
    requestAnimationFrame(animatePixels);
    
    try {
      const response = await request(
        '/match/log-meal',
        'POST',
        {
          meal_description: mealDescription,
        },
        'JSON'
      );
      
      // Stop pixelation animation immediately when response is received
      setShowPixelation(false);
      setPixelSize(1);
      
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
        
        // Clear the input field
        setMealDescription('');
        
        // Refresh logs after a delay to allow background processing to complete
        setTimeout(() => {
          refreshLogs();
          setPendingFoods([]);
        }, 3000);
      } else {
        // Handle the old response format if needed
        setMealDescription('');
        refreshLogs();
      }
    } catch (error) {
      console.error('Error logging meal:', error);
      // Stop pixelation animation on error
      setShowPixelation(false);
      setPixelSize(1);
    } finally {
      setIsSubmitting(false);
    }
  };

  // CSS for quivering effect
  const quiverStyle = showPixelation ? {
    transform: `translate(${Math.sin(Date.now() / 30) * 3}px, ${Math.cos(Date.now() / 30) * 2}px)`,
  } : {
    transform: 'translate(0, 0)',
    opacity: 1
  };

  return (
    <>
      <form
        ref={formRef}
        id="login-form" 
        className="form-elements-wrapper" 
        onSubmit={handleSubmit}
      >
        <motion.div 
          className="entry-form-bubble"
          style={quiverStyle}
          animate={showPixelation ? {
            x: [0, 3, -3, 2, -2, 1, -1, 0],
            y: [0, 2, -1, -2, 1, -1, 1, 0],
          } : {
            x: 0,
            y: 0,
            opacity: 1
          }}
          transition={{ 
            duration: 0.5,
            x: { repeat: showPixelation ? Infinity : 0, duration: 0.4 },
            y: { repeat: showPixelation ? Infinity : 0, duration: 0.4 }
          }}
        >
          <textarea
            className="input-journal"
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
              >
              </HoverButton>
            )}
          </div>
        </motion.div>
      </form>
    </>
  );
}

export default NewSmartLog;