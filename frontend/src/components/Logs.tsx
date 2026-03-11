import 'react-date-range/dist/styles.css'; // main style file
import 'react-date-range/dist/theme/default.css';

import {useState, useRef, useEffect, useCallback} from 'react'
import { createPortal } from 'react-dom';
import { MealHeader } from './MealHeader';
import { ComponentLog } from './ComponentLog';
import { AddComponentForm } from './AddComponentForm';
import { CreateRecipeModal } from './CreateRecipeModal';
import { LogProps, LogComponent } from './structures';
import {useRecoilValue, useSetRecoilState, useRecoilState} from 'recoil'
import { logsAtom, logsLoadingAtom, currentDayAtom, hoveredLogAtom, useRefreshLogs, pendingFoodsAtom, PendingFood } from './dashboard_states';
import { AnimatePresence, motion } from 'framer-motion';
import { MealLoading} from './MealLoading';
import { RecipeCard } from './RecipeCard';
import { request } from './endpoints';
import type { Recipe } from './RecipeBlurb';
import { tutorialEvent } from './TryTutorial';
import { GlobalEditStyles } from './EditLogStyles';
import {
  LogListContainer, LogsWrapper, LogWrapper,
  NoLogsMessage, DateDividerEl, DayButton,
  DeletingWrapper, MealComponentsWrapper, MealRowContainer,
} from './LogStyles';

const getTimestamp = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number.NEGATIVE_INFINITY;

  const normalized = value.includes(' ') && !value.includes('T')
    ? value.replace(' ', 'T')
    : value;

  let parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    parsed = Date.parse(normalized.replace(/(\.\d{3})\d+/, '$1'));
  }

  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
};

const getDayStart = (value: unknown): number => {
  const timestamp = getTimestamp(value);
  if (!Number.isFinite(timestamp)) return Number.NEGATIVE_INFINITY;
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

function LogList (){
  const logs = useRecoilValue(logsAtom)
  const logsLoading = useRecoilValue(logsLoadingAtom)
  const pendingFoods = useRecoilValue(pendingFoodsAtom)
  console.log('LogList: pendingFoods =', pendingFoods);
  // Track which log is being hovered
  const [hoveredLog, setHoveredLog] = useRecoilState(hoveredLogAtom);
  // Track if an animation is currently playing
  const [animationLock] = useState(false);
  // Track which log group is animating out on delete
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  // Track recipe IDs currently being synced to all logs
  const [syncingRecipeIds, setSyncingRecipeIds] = useState<Set<string>>(new Set());
  // Track which meal log has its components expanded
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  // Recipe card modal — store recipe + the log it was opened from (for unlink button)
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedRecipeLogId, setSelectedRecipeLogId] = useState<string | null>(null);
  // Create recipe modal — log ID of the meal to convert
  const [createRecipeLogId, setCreateRecipeLogId] = useState<string | null>(null);
  const refreshLogs = useRefreshLogs();
  // Debounce timer ref for hover
  const hoverDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (hoverDebounceRef.current) {
        clearTimeout(hoverDebounceRef.current);
      }
    };
  }, []);


  // Handle mouse enter for a specific log - debounced to prevent jitter
  // NOTE: These hooks MUST be before any conditional returns
  const handleLogMouseEnter = useCallback((logId: string, blurb: string) => {
    // Clear any pending leave timeout
    if (hoverDebounceRef.current) {
      clearTimeout(hoverDebounceRef.current);
      hoverDebounceRef.current = null;
    }

    // Only change the hovered log if no animation is playing AND it's a different log
    if (!animationLock && (!hoveredLog || hoveredLog[0] !== logId)) {
      setHoveredLog([logId, blurb]);
      tutorialEvent('tutorial:log-hovered');
    }
  }, [animationLock, hoveredLog, setHoveredLog]);

  // Handle mouse leave for a specific log - debounced to prevent jitter
  const handleLogMouseLeave = useCallback(() => {
    // Debounce the leave to prevent jitter when moving between elements
    if (hoverDebounceRef.current) {
      clearTimeout(hoverDebounceRef.current);
    }

    hoverDebounceRef.current = setTimeout(() => {
      if (!animationLock) {
        setHoveredLog(null);
      }
      hoverDebounceRef.current = null;
    }, 100); // 100ms debounce
  }, [animationLock, setHoveredLog]);

  // Fetch recipes from cache or API, then find recipe by ID
  const handleRecipeClick = useCallback(async (recipeId: string, logId?: string) => {
    const recipeIdKey = String(recipeId).trim();
    try {
      // Try localStorage cache first
      const cached = localStorage.getItem('recipes_cache');
      if (cached) {
        const recipes: Recipe[] = JSON.parse(cached);
        const recipe = recipes.find(r => String(r.recipe_id).trim() === recipeIdKey);
        if (recipe) {
          setSelectedRecipe(recipe);
          setSelectedRecipeLogId(logId ?? null);
          tutorialEvent('tutorial:recipe-opened');
          return;
        }
      }

      // Cache miss — fetch from API
      const response = await request('/recipes/list', 'GET');
      if (response.body?.recipes && Array.isArray(response.body.recipes)) {
        const recipes: Recipe[] = response.body.recipes;
        try { localStorage.setItem('recipes_cache', JSON.stringify(recipes)); } catch (e) {}
        const recipe = recipes.find(r => String(r.recipe_id).trim() === recipeIdKey);
        if (recipe) {
          setSelectedRecipe(recipe);
          setSelectedRecipeLogId(logId ?? null);
          tutorialEvent('tutorial:recipe-opened');
        }
      }
    } catch (error) {
      console.error('Error fetching recipe:', error);
    }
  }, []);

  const handleDeleteRecipe = async (recipeId: string) => {
    if (!confirm('Are you sure you want to delete this recipe?')) return;
    try {
      await request(`/recipes/delete?recipe_id=${recipeId}`, 'DELETE');
      try { localStorage.removeItem('recipes_cache'); } catch (e) {}
      setSelectedRecipe(null);
      refreshLogs({ force: true });
    } catch (error) {
      console.error('Error deleting recipe:', error);
    }
  };

  const handleRecipeUpdate = async () => {
    try { localStorage.removeItem('recipes_cache'); } catch (e) {}
    refreshLogs();
    try {
      const response = await request('/recipes/list', 'GET');
      if (response.body?.recipes) {
        const recipes: Recipe[] = response.body.recipes;
        try { localStorage.setItem('recipes_cache', JSON.stringify(recipes)); } catch (e) {}
      }
    } catch (e) {}
  };

  const handleSyncLogs = useCallback(async (recipeId: string) => {
    setSelectedRecipe(null);
    setSelectedRecipeLogId(null);
    setSyncingRecipeIds(prev => new Set(prev).add(recipeId));
    try {
      const formData = new FormData();
      formData.append('recipe_id', recipeId);
      await request('/recipes/sync-logs', 'POST', formData);
    } catch (error) {
      console.error('Error syncing logs:', error);
    }
    await refreshLogs({ force: true });
    setSyncingRecipeIds(prev => {
      const next = new Set(prev);
      next.delete(recipeId);
      return next;
    });
  }, [refreshLogs]);

  // Early return AFTER all hooks
  if (logsLoading && logs.length === 0 && pendingFoods.length === 0) {
    return (
      <LogListContainer className="log-list">
        <GlobalEditStyles />
        {[1].map((idx) => (
          <LogWrapper key={`loading-${idx}`}>
            <motion.div
              initial={{ opacity: 0.35 }}
              animate={{ opacity: [0.35, 0.9, 0.35] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: idx * 0.12 }}
              style={{ width: '100%' }}
            >
              <MealLoading />
            </motion.div>
          </LogWrapper>
        ))}
      </LogListContainer>
    );
  }

  // Early return AFTER all hooks
  if (logs.length === 0 && pendingFoods.length === 0) {
    return (
      <LogListContainer className="log-list">
        <GlobalEditStyles />
        <NoLogsMessage>no logs in this time.</NoLogsMessage>
      </LogListContainer>
    );
  }

  // Group logs and pending foods by day (newest day first)
  const groupedByDay = new Map<number, {logs: LogProps[], pending: PendingFood[]}>();

  // Add regular logs to groups — skip logs without components or with empty components
  logs.forEach(log => {
    if (!log.components || !Array.isArray(log.components) || log.components.length === 0) return;
    const dayStart = getDayStart(log.date);
    if (!Number.isFinite(dayStart)) return;
    if (!groupedByDay.has(dayStart)) {
      groupedByDay.set(dayStart, {logs: [], pending: []});
    }
    groupedByDay.get(dayStart)!.logs.push(log);
  });

  // Add pending foods to groups
  pendingFoods.forEach(food => {
    const dayStart = getDayStart(food.timestamp);
    if (!Number.isFinite(dayStart)) return;
    console.log('Adding pending food to date group:', new Date(dayStart).toDateString(), food);
    if (!groupedByDay.has(dayStart)) {
      groupedByDay.set(dayStart, {logs: [], pending: []});
    }
    groupedByDay.get(dayStart)!.pending.push(food);
  });

  const sortedDays = Array.from(groupedByDay.entries())
    .sort((a, b) => b[0] - a[0]);

  const formatLogDescription = (components: LogComponent[]): string => {
    if (components.length === 0) return 'No components';
    if (components.length === 1) {
      const comp = components[0];
      return `${Math.round(comp.weight_in_grams)} g of ${comp.food_name.split(',')[0]}`;
    }
    return `${components.length} components`;
  };
  const rowTransition = { type: 'spring', stiffness: 360, damping: 32, mass: 0.6 } as const;

  return (
    <LogListContainer className="log-list">
      <GlobalEditStyles />
      {sortedDays.map(([dayStart, { logs: dateLogs, pending: datePending }], dayIndex) => {
        // Sort logs by time (newest first); break ties by id for stable ordering.
        const sortedLogs = [...dateLogs].sort((a, b) => {
          const timeDelta = getTimestamp(b.date) - getTimestamp(a.date);
          if (timeDelta !== 0) return timeDelta;
          return b._id.localeCompare(a._id);
        });
        const sortedPending = [...datePending].sort(
          (a, b) => getTimestamp(b.timestamp) - getTimestamp(a.timestamp)
        );

        const isTutorialDayTarget = dayIndex === 1 || (dayIndex === 0 && sortedDays.length === 1);

        return (
          <LogsWrapper as={motion.div} layout key={dayStart}>
            {/* Date divider for this group */}
            <DateDivider date={new Date(dayStart)} tutorialTarget={isTutorialDayTarget} />

            {/* Render pending foods for this date first */}
            <AnimatePresence initial={false} mode="popLayout">
              {sortedPending.map((pendingFood, index) => (
                <motion.div
                  key={`pending-${pendingFood.timestamp}-${pendingFood.name}-${index}`}
                  layout
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={rowTransition}
                  style={{ width: '100%' }}
                >
                  <LogWrapper>
                    <motion.div
                      style={{ width: '100%', filter: 'blur(4px)' }}
                      initial={{ opacity: 0.5, scale: 0.98 }}
                      animate={{
                        opacity: [0.5, 0.9, 0.5],
                        scale: 1,
                        transition: { delay: index * 0.15, duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                      }}
                    >
                      <MealLoading/>
                    </motion.div>
                  </LogWrapper>
                </motion.div>
              ))}
            </AnimatePresence>
            {/* Render each log (each log is a recipe/meal entry) */}
            <AnimatePresence initial={false} mode="popLayout">
              {sortedLogs.map((log) => {
                // Skip logs without components array (old format)
                if (!log.components || !Array.isArray(log.components)) {
                  return null;
                }

                // Standalone food log: no recipe_id and single component
                const isStandaloneFood = !log.recipe_id && log.components.length === 1;
                const totalWeight = (
                  Number.isFinite(Number(log.logged_weight_grams)) && Number(log.logged_weight_grams) > 0
                    ? Number(log.logged_weight_grams)
                    : log.components.reduce((sum, c) => sum + c.weight_in_grams, 0)
                );
                const isExpanded = expandedLogId === log._id;
                const isSyncing = syncingRecipeIds.has(log.recipe_id ?? '');

                const handleMealNameClick = () => {
                  if (log.recipe_id) {
                    handleRecipeClick(log.recipe_id, log._id);
                  } else {
                    setCreateRecipeLogId(log._id);
                  }
                };

                const servingsValue = Number(log.servings);
                const safeServings = Number.isFinite(servingsValue) && servingsValue > 0 ? servingsValue : 1;
                const servingsText = Number.isInteger(safeServings)
                  ? String(safeServings)
                  : safeServings.toFixed(1).replace(/\.0$/, "");

                return (
                  <motion.div
                    key={log._id}
                    layout
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={isSyncing
                      ? { opacity: [1, 0.35, 1], y: 0, scale: 1 }
                      : { opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                    transition={isSyncing
                      ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }
                      : rowTransition}
                    style={{ width: '100%' }}
                  >
                    <DeletingWrapper $isDeleting={deletingLogId === log._id}>
                      {/* Meal header - only show for non-standalone meals */}
                      {!isStandaloneFood && (
                        <LogWrapper>
                          <MealHeader
                            meal_name={log.meal_name}
                            servings={log.servings}
                            date={new Date(log.date)}
                            log_id={log._id}
                            recipe_id={log.recipe_id}
                            recipe_exists={log.recipe_exists}
                            serving_size_label={log.serving_size_label || undefined}
                            total_weight_grams={totalWeight}
                            expanded={isExpanded}
                            onToggle={() => setExpandedLogId(isExpanded ? null : log._id)}
                            onNameClick={handleMealNameClick}
                            onDeleteStart={() => setDeletingLogId(log._id)}
                            onMouseEnter={() => handleLogMouseEnter(log._id, `${log.meal_name} (${servingsText} ${safeServings === 1 ? "serving" : "servings"})`)}
                            onMouseLeave={handleLogMouseLeave}
                          />
                        </LogWrapper>
                      )}

                      {/* Standalone food: always visible. Meal log: collapsible */}
                      <MealComponentsWrapper
                        $standalone={isStandaloneFood}
                        $expanded={isExpanded}
                        className={(!isStandaloneFood && !log.recipe_id && isExpanded) ? 'tutorial-meal-components' : undefined}
                      >
                        {log.components.map((component, idx) => {
                          const componentId = `${log._id}-${idx}`;
                          return (
                            <LogWrapper key={componentId}>
                              <ComponentLog
                                component={component}
                                logId={log._id}
                                componentIndex={idx}
                                isStandalone={isStandaloneFood}
                                hasRecipe={!!log.recipe_id}
                                logDate={new Date(log.date)}
                                logServings={log.servings}
                                onMouseEnter={() => handleLogMouseEnter(componentId, formatLogDescription([component]))}
                                onMouseLeave={handleLogMouseLeave}
                              />
                            </LogWrapper>
                          );
                        })}
                        {/* Add component form for expanded unlinked meals */}
                        {!isStandaloneFood && !log.recipe_id && isExpanded && (
                          <LogWrapper>
                            <MealRowContainer>
                              <AddComponentForm logId={log._id} onAdd={refreshLogs} />
                            </MealRowContainer>
                          </LogWrapper>
                        )}
                      </MealComponentsWrapper>
                    </DeletingWrapper>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </LogsWrapper>
        );
      })}

      {selectedRecipe && createPortal(
        <AnimatePresence>
          <RecipeCard
            key={selectedRecipe.recipe_id}
            recipe={selectedRecipe}
            onClose={() => { setSelectedRecipe(null); setSelectedRecipeLogId(null); }}
            onDelete={handleDeleteRecipe}
            onUpdate={handleRecipeUpdate}
            logId={selectedRecipeLogId ?? undefined}
            onUnlink={() => { setSelectedRecipe(null); setSelectedRecipeLogId(null); refreshLogs(); }}
            onSyncLogs={handleSyncLogs}
          />
        </AnimatePresence>,
        document.body
      )}

      {createRecipeLogId && (() => {
        const log = logs.find(l => l._id === createRecipeLogId);
        return log ? createPortal(
          <CreateRecipeModal
            logId={createRecipeLogId}
            mealName={log.meal_name}
            onClose={() => setCreateRecipeLogId(null)}
            onSuccess={() => setCreateRecipeLogId(null)}
          />,
          document.body
        ) : null;
      })()}
    </LogListContainer>
  );
}

function DateDivider({date, tutorialTarget = false} : {date : Date, tutorialTarget?: boolean}) {
  const setCurrentDay = useSetRecoilState(currentDayAtom)
  return (
    <DateDividerEl className={tutorialTarget ? 'tutorial-day-divider-target' : undefined}>
      <DayButton
        className={tutorialTarget ? 'tutorial-day-button' : undefined}
        onClick={() => { setCurrentDay(date); tutorialEvent('tutorial:day-changed'); }}
      >
        {date.toLocaleDateString('en-US',
        { weekday: 'long',
          month: 'long',
          day: 'numeric'} )}
      </DayButton>
    </DateDividerEl>
  )
}

export {LogList}
