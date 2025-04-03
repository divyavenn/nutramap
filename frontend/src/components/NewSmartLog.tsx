import React, { useState } from 'react';
import { request } from './endpoints';
import { HoverButton } from './Sections';
import Arrow from '../assets/images/arrow.svg?react';
import Ok from '../assets/images/checkmark.svg?react';
import '../assets/css/new_log.css';
import '../assets/css/buttons.css';
import { useRefreshLogs } from './dashboard_states';
import YesOk from '../assets/images/check_circle.svg?react'
import IsOk from '../assets/images/checkmark.svg?react'
import '../assets/css/edit_log.css'
import { motion, AnimatePresence } from 'framer-motion';

/**
 * NewSmartLog component for natural language meal logging
 * This component uses the /match/log-meal endpoint which leverages:
 * - Dense vector search with FAISS for semantic matching
 * - Sparse vector search for keyword matching
 * - Reciprocal Rank Fusion to combine results
 */
function NewSmartLog() {
  const [mealDescription, setMealDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSparkles, setShowSparkles] = useState(false);
  const [pendingFoods, setPendingFoods] = useState<string[]>([]);
  const refreshLogs = useRefreshLogs();

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

  // Generate random sparkles
  const generateSparkles = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 8 + 2,
      delay: Math.random() * 0.5
    }));
  };

  const sparkles = generateSparkles(20);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!mealDescription.trim()) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await request(
        '/match/log-meal',
        'POST',
        {
          meal_description: mealDescription,
        },
        'JSON'
      );
      
      // Show sparkle animation
      setShowSparkles(true);
      
      // If we get the early response with food count
      if (response && 
          response.body && 
          typeof response.body === 'object' && 
          response.body.status === 'processing' && 
          Array.isArray(response.body.foods)) {
        setPendingFoods(response.body.foods);
        
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
    } finally {
      // Hide sparkles after animation completes
      setTimeout(() => {
        setShowSparkles(false);
        setIsSubmitting(false);
      }, 1500);
    }
  };

  return (
    <>
      <AnimatePresence>
        {pendingFoods.length > 0 && (
          <motion.div className="pending-foods-container">
            {pendingFoods.map((food, index) => (
              <motion.div
                key={index}
                className="pending-food-item"
                initial={{ opacity: 0.3, filter: 'blur(4px)', scale: 0.8 }}
                animate={{ 
                  opacity: 1, 
                  filter: 'blur(0px)', 
                  scale: 1,
                  transition: { 
                    delay: index * 0.2,
                    duration: 0.8
                  }
                }}
                exit={{ 
                  opacity: 0,
                  y: -20,
                  transition: { duration: 0.3 } 
                }}
              >
                {food}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <form
        id="login-form" 
        className={`form-elements-wrapper ${showSparkles ? 'sparkle-container' : ''}`} 
        onSubmit={handleSubmit}
      >
        <div className="entry-form-bubble">
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
                childrenOn={<Ok/>}
                childrenOff={<Arrow/>}
              >
              </HoverButton>
            )}
          </div>
        </div>
        
        {/* Sparkle animation */}
        <AnimatePresence>
          {showSparkles && (
            <>
              {sparkles.map((sparkle) => (
                <motion.div
                  key={sparkle.id}
                  className="sparkle"
                  style={{
                    left: `${sparkle.x}%`,
                    top: `${sparkle.y}%`,
                    width: `${sparkle.size}px`,
                    height: `${sparkle.size}px`,
                  }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ 
                    opacity: [0, 1, 0],
                    scale: [0, 1, 0],
                    transition: { 
                      duration: 1,
                      delay: sparkle.delay,
                      times: [0, 0.4, 1]
                    }
                  }}
                  exit={{ opacity: 0 }}
                />
              ))}
            </>
          )}
        </AnimatePresence>
      </form>
    </>
  );
}

export default NewSmartLog;