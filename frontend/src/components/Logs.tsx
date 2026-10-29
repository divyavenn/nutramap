import 'react-date-range/dist/styles.css'; // main style file
import { useNotify } from './StatusMessage';
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
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { MealLoading} from './MealLoading';
import { RecipeCard } from './RecipeCard';
import { request } from './endpoints';
import type { Recipe } from './RecipeBlurb';
import { tutorialEvent } from './TryTutorial';
import { GlobalEditStyles } from './EditLogStyles';
import { formatQuantity } from './utlis';
import { pluralize } from './pluralize';
import {
  LogListContainer, LogsWrapper, LogWrapper,
  NoLogsMessage, NoLogsHint, DateDividerEl, DayButton,
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
  // Track which log is being hovered
  const [hoveredLog, setHoveredLog] = useRecoilState(hoveredLogAtom);
  // Track if an animation is currently playing
  const [animationLock] = useState(false);
  // Track which log group is animating out on delete
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  // Track recipe IDs currently being synced to all logs
  const [syncingRecipeIds, setSyncingRecipeIds] = useState<Set<string>>(new Set());
  // Track log IDs currently being unlinked from their recipe
  const [unlinkingLogIds, setUnlinkingLogIds] = useState<Set<string>>(new Set());
  // Track which meal log has its components expanded
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  // Recipe card modal — store recipe + the log it was opened from (for unlink button)
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedRecipeLogId, setSelectedRecipeLogId] = useState<string | null>(null);
  // Create recipe modal — log ID of the meal to convert
  const [createRecipeLogId, setCreateRecipeLogId] = useState<string | null>(null);
  const refreshLogs = useRefreshLogs();
  const notify = useNotify();
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
      if (response.status !== 200) throw new Error(`recipes/list failed (${response.status})`);
      if (response.body?.recipes && Array.isArray(response.body.recipes)) {
        const recipes: Recipe[] = response.body.recipes;
        try { localStorage.setItem('recipes_cache', JSON.stringify(recipes)); } catch (e) {}
        const recipe = recipes.find(r => String(r.recipe_id).trim() === recipeIdKey);
        if (recipe) {
          setSelectedRecipe(recipe);
          setSelectedRecipeLogId(logId ?? null);
          tutorialEvent('tutorial:recipe-opened');
        } else {
          notify("couldn't find this recipe. it may have been deleted.");
        }
      }
    } catch (error) {
      console.error('Error fetching recipe:', error);
      notify("couldn't open this recipe. try again.");
    }
  }, [notify]);

  const handleDeleteRecipe = async (recipeId: string) => {
    if (!confirm("delete this recipe? you can't undo this. meals you've logged stay, but they won't be linked to it anymore.")) return;
    try {
      const response = await request(`/recipes/delete?recipe_id=${encodeURIComponent(recipeId)}`, 'DELETE');
      if (response.status !== 200) throw new Error(`recipes/delete failed (${response.status})`);
      try { localStorage.removeItem('recipes_cache'); } catch (e) {}
      setSelectedRecipe(null);
      refreshLogs({ force: true });
    } catch (error) {
      console.error('Error deleting recipe:', error);
      notify("couldn't delete this recipe. try again.");
    }
  };

  const handleRecipeUpdate = async () => {
    try { localStorage.removeItem('recipes_cache'); } catch (e) {}
    refreshLogs({ force: true });
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
    notify('updating past meals with this recipe…');
    try {
      const formData = new FormData();
      formData.append('recipe_id', recipeId);
      const response = await request('/recipes/sync-logs', 'POST', formData);
      if (response.status !== 200) throw new Error(`sync-logs failed (${response.status})`);
    } catch (error) {
      console.error('Error syncing logs:', error);
      notify('past meals not updated. try again.');
    }
    await refreshLogs({ force: true });
    setSyncingRecipeIds(prev => {
      const next = new Set(prev);
      next.delete(recipeId);
      return next;
    });
  }, [refreshLogs, notify]);

  const handleUnlinkLog = useCallback(async (logId: string) => {
    setSelectedRecipe(null);
    setSelectedRecipeLogId(null);
    setUnlinkingLogIds(prev => new Set(prev).add(logId));
    notify('unlinking this meal from its recipe…');
    try {
      const fd = new FormData();
      fd.append('log_id', logId);
      const response = await request('/recipes/unlink-log', 'POST', fd);
      if (response.status !== 200) throw new Error(`unlink-log failed (${response.status})`);
    } catch (error) {
      console.error('Error unlinking log from recipe:', error);
      notify("couldn't unlink this meal. try again.");
    }
    await refreshLogs({ force: true });
    setUnlinkingLogIds(prev => {
      const next = new Set(prev);
      next.delete(logId);
      return next;
    });
  }, [refreshLogs, notify]);

  // Early return AFTER all hooks
  if (logsLoading && logs.length === 0 && pendingFoods.length === 0) {
    return (
      <LogListContainer className="log-list" aria-busy={logsLoading || pendingFoods.length > 0}>
        <GlobalEditStyles />
        {[1].map((idx) => (
          <LogWrapper key={`loading-${idx}`}>
            <MealLoading />
          </LogWrapper>
        ))}
      </LogListContainer>
    );
  }

  // Early return AFTER all hooks
  if (logs.length === 0 && pendingFoods.length === 0) {
    return (
      <LogListContainer className="log-list" aria-busy={logsLoading || pendingFoods.length > 0}>
        <GlobalEditStyles />
        <NoLogsMessage>
          nothing logged in this range
          <NoLogsHint>describe what you ate to log it, or pick another date range.</NoLogsHint>
        </NoLogsMessage>
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
      return `${Math.round(comp.weight_in_grams)}g of ${comp.food_name.split(',')[0]}`;
    }
    return `${components.length} components`;
  };
  // Rows only animate their position (layout="position"): animating size would scale-distort
  // their text. Fades are short tweens; moving rows use the spring.
  const rowTransition = {
    duration: 0.18,
    ease: [0.23, 1, 0.32, 1],
    layout: { type: 'spring', stiffness: 360, damping: 32, mass: 0.6 },
  } as const;
  // Placeholder and arriving log crossfade in the same spot, so it reads as one row resolving
  const rowEnter = { opacity: 0, filter: 'blur(2px)' };
  const rowShown = { opacity: 1, filter: 'blur(0px)' };
  const rowExit = { opacity: 0, scale: 0.98, filter: 'blur(2px)' };

  return (
    <LogListContainer className="log-list" aria-busy={logsLoading || pendingFoods.length > 0}>
      <GlobalEditStyles />
      <LayoutGroup>
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
          <LogsWrapper key={dayStart}>
            {/* Date divider for this group */}
            <DateDivider date={new Date(dayStart)} tutorialTarget={isTutorialDayTarget} />

            {/* Render pending foods for this date first */}
            <AnimatePresence initial={false} mode="popLayout">
              {sortedPending.map((pendingFood) => (
                <motion.div
                  key={`pending-${pendingFood.id}`}
                  layout="position"
                  initial={rowEnter}
                  animate={rowShown}
                  exit={{ opacity: 0, filter: 'blur(2px)' }}
                  transition={rowTransition}
                  style={{ width: '100%' }}
                >
                  <LogWrapper>
                    {/* The whole description until the parse returns, then each item's name */}
                    <MealLoading
                      name={pendingFood.name}
                      servings={pendingFood.servings}
                    />
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
                // Components hold the absolute grams eaten (and are what nutrients are
                // computed from). logged_weight_grams is not updated by component
                // add/edit/delete, so prefer the live component sum.
                const componentsWeight = log.components.reduce(
                  (sum, c) => sum + (Number.isFinite(Number(c.weight_in_grams)) ? Number(c.weight_in_grams) : 0),
                  0
                );
                const totalWeight = componentsWeight > 0
                  ? componentsWeight
                  : (Number.isFinite(Number(log.logged_weight_grams)) ? Number(log.logged_weight_grams) : 0);
                const isExpanded = expandedLogId === log._id;
                const isSyncing = syncingRecipeIds.has(log.recipe_id ?? '') || unlinkingLogIds.has(log._id);

                const handleMealNameClick = () => {
                  if (log.recipe_id) {
                    handleRecipeClick(log.recipe_id, log._id);
                  } else {
                    setCreateRecipeLogId(log._id);
                  }
                };

                const servingsValue = Number(log.servings);
                const safeServings = Number.isFinite(servingsValue) && servingsValue > 0 ? servingsValue : 1;
                const servingsText = formatQuantity(safeServings, 2);

                return (
                  <motion.div
                    key={log._id}
                    layout="position"
                    initial={rowEnter}
                    aria-busy={isSyncing}
                    animate={isSyncing ? { opacity: 0.5, filter: 'blur(0px)' } : rowShown}
                    exit={rowExit}
                    transition={rowTransition}
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
                            onMouseEnter={() => handleLogMouseEnter(log._id, `${log.meal_name} (${servingsText} ${pluralize('serving', safeServings)})`)}
                            onMouseLeave={handleLogMouseLeave}
                          />
                        </LogWrapper>
                      )}

                      {/* Standalone food: always visible. Meal log: collapsible with spring */}
                      {isStandaloneFood ? (
                        <MealComponentsWrapper $standalone={true}>
                          {log.components.map((component, idx) => {
                            const componentId = `${log._id}-${idx}`;
                            return (
                              <LogWrapper key={componentId}>
                                <ComponentLog
                                  component={component}
                                  logId={log._id}
                                  componentIndex={idx}
                                  isStandalone={true}
                                  hasRecipe={false}
                                  logDate={new Date(log.date)}
                                  logServings={log.servings}
                                  onMouseEnter={() => handleLogMouseEnter(componentId, formatLogDescription([component]))}
                                  onMouseLeave={handleLogMouseLeave}
                                />
                              </LogWrapper>
                            );
                          })}
                        </MealComponentsWrapper>
                      ) : (
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              key="components"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                              style={{ overflow: 'hidden', width: '100%' }}
                            >
                              <MealComponentsWrapper
                                $standalone={false}
                                className={!log.recipe_id ? 'tutorial-meal-components' : undefined}
                              >
                                {log.components.map((component, idx) => {
                                  const componentId = `${log._id}-${idx}`;
                                  return (
                                    <LogWrapper key={componentId}>
                                      <ComponentLog
                                        component={component}
                                        logId={log._id}
                                        componentIndex={idx}
                                        isStandalone={false}
                                        hasRecipe={!!log.recipe_id}
                                        logDate={new Date(log.date)}
                                        logServings={log.servings}
                                        onMouseEnter={() => handleLogMouseEnter(componentId, formatLogDescription([component]))}
                                        onMouseLeave={handleLogMouseLeave}
                                      />
                                    </LogWrapper>
                                  );
                                })}
                                {!log.recipe_id && (
                                  <LogWrapper>
                                    <MealRowContainer>
                                      <AddComponentForm logId={log._id} onAdd={refreshLogs} />
                                    </MealRowContainer>
                                  </LogWrapper>
                                )}
                              </MealComponentsWrapper>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      )}
                    </DeletingWrapper>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </LogsWrapper>
        );
      })}
      </LayoutGroup>

      {createPortal(
        <AnimatePresence>
          {selectedRecipe && (
            <RecipeCard
              key={selectedRecipe.recipe_id}
              recipe={selectedRecipe}
              onClose={() => { setSelectedRecipe(null); setSelectedRecipeLogId(null); }}
              onDelete={handleDeleteRecipe}
              onUpdate={handleRecipeUpdate}
              logId={selectedRecipeLogId ?? undefined}
              onUnlink={selectedRecipeLogId ? () => handleUnlinkLog(selectedRecipeLogId) : undefined}
              onSyncLogs={handleSyncLogs}
            />
          )}
        </AnimatePresence>,
        document.body
      )}

      {createPortal(
        <AnimatePresence>
          {(() => {
            const log = createRecipeLogId ? logs.find(l => l._id === createRecipeLogId) : null;
            return log ? (
              <CreateRecipeModal
                key={log._id}
                logId={log._id}
                mealName={log.meal_name}
                onClose={() => setCreateRecipeLogId(null)}
                onSuccess={() => setCreateRecipeLogId(null)}
              />
            ) : null;
          })()}
        </AnimatePresence>,
        document.body
      )}
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
