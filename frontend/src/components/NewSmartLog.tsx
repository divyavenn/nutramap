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
  const [feedback, setFeedback] = useState('');
  const refreshLogs = useRefreshLogs();

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMealDescription(e.target.value);
    setFeedback('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!mealDescription.trim()) return;
    
    setIsSubmitting(true);
    setFeedback('Processing your meal...');
    
    try {
      const response = await request(
        '/match/log-meal',
        'POST',
        {
          meal_description: mealDescription,
        }
      );
      
      setMealDescription('');
      refreshLogs();
    } catch (error) {
      console.error('Error logging meal:', error);
      setFeedback('Failed to log meal. Please try again.');
    } finally {
      setIsSubmitting(false);
      // Clear feedback after 5 seconds
      setTimeout(() => setFeedback(''), 5000);
    }
  };

  return (
<form
      id="login-form" className = {`form-elements-wrapper`} onSubmit={handleSubmit}>
        <div className="entry-form-bubble">
            <textarea
              className="input-journal"
              placeholder="a bowl of steel-cut oats with blueberries and a cup of coffee with whole milk for breakfast"
              value={mealDescription}
              onChange={handleTyping}
              disabled={isSubmitting}
              required
            />
            <div className = 'new-smart-log-button-container'>
      {mealDescription &&
      <HoverButton
              type="submit"
              className="new-log-button"
              childrenOn={<Ok/>}
              childrenOff={<Arrow/>}>
      </HoverButton>}
      </div> 

        </div>
      </form>
  );
}

export default NewSmartLog;