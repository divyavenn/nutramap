import React, { useState, useRef, useEffect } from 'react';
import { request } from './endpoints';
import Arrow from '../assets/images/arrow.svg?react';
import { useRefreshLogs, pendingFoodsAtom, PendingFood } from './dashboard_states';
import IsOk from '../assets/images/checkmark.svg?react'
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { tutorialEvent } from './TryTutorial';
import { FormElementsWrapper, EntryFormBubble, NewLogInputJournal, NewLogButton } from './LogNew.styled';

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
  const [isSubmitHovered, setIsSubmitHovered] = useState(false);
  // Use the global state for pending foods
  const setPendingFoods = useSetRecoilState(pendingFoodsAtom);
  const pendingFoods = useRecoilValue(pendingFoodsAtom);
  const refreshLogs = useRefreshLogs();
  const formRef = useRef<HTMLFormElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);
  const knownLogCountRef = useRef<number | null>(null);

  // Poll for log updates while there are pending foods.
  useEffect(() => {
    if (pendingFoods.length === 0) {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
      knownLogCountRef.current = null;
      return;
    }

    // Already polling — don't start a second interval
    if (pollIntervalRef.current !== null) return;

    pollCountRef.current = 0;
    knownLogCountRef.current = null;

    pollIntervalRef.current = setInterval(async () => {
      pollCountRef.current++;
      const latestLogs = await refreshLogs({ force: true });
      if (Array.isArray(latestLogs)) {
        if (knownLogCountRef.current === null) {
          knownLogCountRef.current = latestLogs.length;
        } else if (latestLogs.length > knownLogCountRef.current) {
          const added = latestLogs.length - knownLogCountRef.current;
          knownLogCountRef.current = latestLogs.length;
          setPendingFoods(prev => prev.slice(added));
        }
      }
      requestAnimationFrame(() => {
        if (document.querySelector('.recipe-bubble')) {
          tutorialEvent('tutorial:log-ready');
        }
      });
      if (pollCountRef.current >= 8) {
        clearInterval(pollIntervalRef.current!);
        pollIntervalRef.current = null;
        if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
        setPendingFoods([]);
      }
    }, 1500);

    pollTimeoutRef.current = setTimeout(() => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      setPendingFoods([]);
      pollTimeoutRef.current = null;
    }, 15000);

    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFoods.length]);

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
    tutorialEvent('tutorial:log-created');

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

      // Invalidate recipes cache since parse-meal can create new recipes
      try { localStorage.removeItem('recipes_cache'); } catch (e) {}
    } catch (error) {
      console.error('Error parsing meal:', error);
      setIsJiggling(false);
      setIsSubmitting(false);

      // Remove from pending on error
      setPendingFoods(prev => prev.filter(p => p.timestamp !== pendingMeal.timestamp));
      // Still refresh to show any partial results
      refreshLogs({ force: true });
    }
  };


  return (
    <>
      <FormElementsWrapper
        ref={formRef}
        id="login-form"
        className="form-elements-wrapper"
        onSubmit={handleSubmit}
      >
         <EntryFormBubble className="entry-form-bubble">
          <NewLogInputJournal
            placeholder="a bowl of steel-cut oats with blueberries with a 12oz latte"
            value={mealDescription}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            $jiggling={isJiggling}
            required
          />
          <div className='new-smart-log-button-container'>
            {!isSubmitting && mealDescription && (
              <NewLogButton
                type="submit"
                disabled={isSubmitting}
                onMouseEnter={() => setIsSubmitHovered(true)}
                onMouseLeave={() => setIsSubmitHovered(false)}
              >
                {isSubmitHovered ? <IsOk/> : <Arrow/>}
              </NewLogButton>
            )}
          </div>
          </EntryFormBubble>
      </FormElementsWrapper>
    </>
  );
}

export default NewSmartLog;
