import React, { useState, useRef, useEffect } from 'react';
import { useNotify } from './StatusMessage';
import { request } from './endpoints';
import Arrow from '../assets/images/arrow.svg?react';
import { useRefreshLogs, pendingFoodsAtom, PendingFood, logsAtom } from './dashboard_states';
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

const normalizeName = (name: string) => name.trim().toLowerCase();

/** Drop the placeholder for each newly arrived log: same name first, else the oldest. */
function resolvePending(pending: PendingFood[], arrivedNames: string[]): PendingFood[] {
  const remaining = [...pending];
  for (const name of arrivedNames) {
    const sameName = remaining.findIndex(p => normalizeName(p.name) === normalizeName(name || ''));
    remaining.splice(sameName >= 0 ? sameName : 0, remaining.length > 0 ? 1 : 0);
  }
  return remaining;
}

function NewSmartLog() {
  const [mealDescription, setMealDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Use the global state for pending foods
  const setPendingFoods = useSetRecoilState(pendingFoodsAtom);
  const pendingFoods = useRecoilValue(pendingFoodsAtom);
  const logs = useRecoilValue(logsAtom);
  const refreshLogs = useRefreshLogs();
  const notify = useNotify();
  const formRef = useRef<HTMLFormElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);
  const knownLogIdsRef = useRef<Set<string> | null>(null);

  // We stop polling before slow meals finish; say so instead of silently dropping them
  const notifyStillWorking = () => {
    if (pendingFoods.length === 0) return;
    const names = pendingFoods.map(p => `"${p.name}"`).join(', ');
    notify(`still working on ${names}. refresh in a minute to see it.`);
  };

  // Poll for log updates while there are pending foods.
  useEffect(() => {
    if (pendingFoods.length === 0) {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
      knownLogIdsRef.current = null;
      return;
    }

    // Already polling — don't start a second interval
    if (pollIntervalRef.current !== null) return;

    pollCountRef.current = 0;
    // Baseline = logs shown before the submission. Taking it from the first poll instead
    // would miss logs the background task already created, leaving the placeholder stuck.
    knownLogIdsRef.current = new Set(logs.map(l => l._id));

    pollIntervalRef.current = setInterval(async () => {
      pollCountRef.current++;
      const latestLogs = await refreshLogs({ force: true });
      if (Array.isArray(latestLogs) && knownLogIdsRef.current) {
        const known = knownLogIdsRef.current;
        const arrived = latestLogs.filter(l => !known.has(l._id));
        if (arrived.length > 0) {
          arrived.forEach(l => known.add(l._id));
          setPendingFoods(prev => resolvePending(prev, arrived.map(l => l.meal_name)));
        }
      }
      requestAnimationFrame(() => {
        if (document.querySelector('.recipe-bubble')) {
          tutorialEvent('tutorial:log-ready');
        }
      });
      if (pollCountRef.current >= 20) {
        clearInterval(pollIntervalRef.current!);
        pollIntervalRef.current = null;
        if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
        notifyStillWorking();
        setPendingFoods([]);
      }
    }, 1500);

    pollTimeoutRef.current = setTimeout(() => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      notifyStillWorking();
      setPendingFoods([]);
      pollTimeoutRef.current = null;
    }, 31000);

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
    tutorialEvent('tutorial:log-created');

    // Add to pending foods immediately
    const pendingMeal: PendingFood = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: mealDescription,
      timestamp: new Date().toISOString()
    };
    setPendingFoods(prev => [...prev, pendingMeal]);

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
      if (response.status !== 200) {
        throw new Error(`parse-meal failed (${response.status})`);
      }

      // The parse returns each item right away; show those while ingredients resolve
      const items: { description?: string; servings?: number }[] = Array.isArray(response.body?.recipes)
        ? response.body.recipes
        : [];
      if (items.length > 0) {
        setPendingFoods(prev => prev.flatMap(p => p.id !== pendingMeal.id ? [p] : items.map((item, i) => ({
          id: `${pendingMeal.id}-${i}`,
          name: item.description || pendingMeal.name,
          servings: Number(item.servings) > 0 ? Number(item.servings) : undefined,
          timestamp: pendingMeal.timestamp,
        }))));
      }

      setMealDescription('');
      setIsSubmitting(false);

      // Invalidate recipes cache since parse-meal can create new recipes
      try { localStorage.removeItem('recipes_cache'); } catch (e) {}
    } catch (error) {
      console.error('Error parsing meal:', error);
      notify("couldn't log that meal. check your connection and try again.");
      setIsSubmitting(false);

      // Remove from pending on error
      setPendingFoods(prev => prev.filter(p => p.id !== pendingMeal.id));
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
            aria-label="describe what you ate"
            placeholder="a bowl of steel-cut oats with blueberries with a 12oz latte"
            value={mealDescription}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            readOnly={isSubmitting}
            aria-disabled={isSubmitting}
            required
          />
          <div className='new-smart-log-button-container'>
            {!isSubmitting && mealDescription && (
              <NewLogButton
                type="submit"
                aria-label="log meal"
                disabled={isSubmitting}
              >
                <Arrow aria-hidden />
              </NewLogButton>
            )}
          </div>
          </EntryFormBubble>
      </FormElementsWrapper>
    </>
  );
}

export default NewSmartLog;
