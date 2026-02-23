import '../assets/css/logs.css'
import 'react-date-range/dist/styles.css'; // main style file
import 'react-date-range/dist/theme/default.css';

import {useState, useRef, useEffect, useCallback} from 'react'
import { EditLogForm } from './LogEdit';
import { MealEdit } from './MealEdit';
import { MealDisplay } from './MealDisplay';
import { formatTime } from './utlis';
import { LogProps, DisplayLogProps, LogComponent } from './structures';
import {useRecoilValue, useSetRecoilState, useRecoilState} from 'recoil'
import { logsAtom, currentDayAtom, hoveredLogAtom, useRefreshLogs, pendingFoodsAtom, PendingFood } from './dashboard_states';
import { motion } from 'framer-motion';
import { MealLoading} from './MealLoading';
import { RecipeCard } from './RecipeCard';
import { request } from './endpoints';
import type { Recipe } from './RecipeBlurb';
import { tutorialEvent } from './TryTutorial';

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
  const pendingFoods = useRecoilValue(pendingFoodsAtom)
  console.log('LogList: pendingFoods =', pendingFoods);
  // Track which log is being hovered
  const [hoveredLog, setHoveredLog] = useRecoilState(hoveredLogAtom);
  // Track if an animation is currently playing
  const [animationLock, setAnimationLock] = useState(false);
  // Track which recipe log is being edited
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  // Track which component is being edited (format: "logId-componentIndex")
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  // Recipe card modal
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const refreshLogs = useRefreshLogs();
  // recipe_id → serving_size_label lookup from cache
  const [recipeServingMap, setRecipeServingMap] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const cached = localStorage.getItem('recipes_cache');
      if (cached) {
        const recipes: Recipe[] = JSON.parse(cached);
        const map: Record<string, string> = {};
        recipes.forEach(r => { if (r.serving_size_label) map[r.recipe_id] = r.serving_size_label; });
        setRecipeServingMap(map);
      }
    } catch (e) {}
  }, []);
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

  // Handle click outside to close edit mode
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside any edit form
      const target = event.target as HTMLElement;
      const editForm = target.closest('#edit-log-form');

      // If we're editing and the click is outside the edit form, cancel editing
      if ((editingLogId || editingComponentId) && !editForm) {
        setEditingLogId(null);
        setEditingComponentId(null);
      }
    };

    // Add event listener
    document.addEventListener('mousedown', handleClickOutside);

    // Cleanup
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editingLogId, editingComponentId]);

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

  // Function to handle animation start
  const handleAnimationStart = () => {
    setAnimationLock(true);
  };

  // Function to handle animation end
  const handleAnimationEnd = () => {
    setAnimationLock(false);
  };

  // Fetch recipes from cache or API, then find recipe by ID
  const handleRecipeClick = useCallback(async (recipeId: string) => {
    try {
      // Try localStorage cache first
      const cached = localStorage.getItem('recipes_cache');
      if (cached) {
        const recipes: Recipe[] = JSON.parse(cached);
        const recipe = recipes.find(r => r.recipe_id === recipeId);
        if (recipe) {
          setSelectedRecipe(recipe);
          tutorialEvent('tutorial:recipe-opened');

          return;
        }
      }

      // Cache miss — fetch from API
      const response = await request('/recipes/list', 'GET');
      if (response.body?.recipes && Array.isArray(response.body.recipes)) {
        const recipes: Recipe[] = response.body.recipes;
        try { localStorage.setItem('recipes_cache', JSON.stringify(recipes)); } catch (e) {}
        const recipe = recipes.find(r => r.recipe_id === recipeId);
        if (recipe) {
          setSelectedRecipe(recipe);
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
      refreshLogs();
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
        const map: Record<string, string> = {};
        recipes.forEach((r: Recipe) => { if (r.serving_size_label) map[r.recipe_id] = r.serving_size_label; });
        setRecipeServingMap(map);
      }
    } catch (e) {}
  };

  // Early return AFTER all hooks
  if (logs.length === 0 && pendingFoods.length === 0) {
    return <div className="log-list">
      <div className = 'no-logs-message'> no logs in this time.</div> </div>;
  }

  // Group logs and pending foods by day (newest day first)
  const groupedByDay = new Map<number, {logs: LogProps[], pending: PendingFood[]}>();

  // Add regular logs to groups
  logs.forEach(log => {
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

  return (
    <div className="log-list">
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
          <div key={dayStart} className="logs-wrapper">
            {/* Date divider for this group */}
            <DateDivider date={new Date(dayStart)} tutorialTarget={isTutorialDayTarget} />

            {/* Render pending foods for this date first */}
            {sortedPending.map((pendingFood, index) => (
              <div key={`pending-${index}`} className="log-wrapper">
                <motion.div
                  initial={{
                    opacity: 0.7,
                    filter: 'blur(4px)',
                    scale: 0.95,
                    backgroundColor: 'rgba(25, 5, 5, 0.52)'
                  }}
                  animate={{
                    opacity: 1,
                    filter: 'blur(4px)',
                    scale: 1,
                    backgroundColor: 'rgba(25, 5, 5, 0.52)',
                    transition: {
                      delay: index * 0.2,
                      duration: 0.8
                    }
                  }}
                >
                  <MealLoading/>
                </motion.div>
              </div>
            ))}
            {/* Render each log (each log is a recipe/meal entry) */}
            {sortedLogs.map((log) => {
              // Skip logs without components array (old format)
              if (!log.components || !Array.isArray(log.components)) {
                return null;
              }

              const isEditing = editingLogId === log._id;
              // Standalone food log: no recipe_id and single component
              const isStandaloneFood = !log.recipe_id && log.components.length === 1;

              return (
                <div key={log._id} >
                  {/* Meal header - only show for recipe logs, not standalone foods */}
                  {!isStandaloneFood && (
                    isEditing ? (
                      <div className="log-wrapper">
                        <MealEdit
                          meal_name={log.meal_name}
                          servings={log.servings}
                          date={new Date(log.date)}
                          _id={log._id}
                          totalWeightGrams={log.components.reduce((sum, c) => sum + c.weight_in_grams, 0)}
                          onCancel={() => setEditingLogId(null)}
                          onAnimationStart={handleAnimationStart}
                          onAnimationEnd={handleAnimationEnd}
                        />
                      </div>
                    ) : (
                      <MealDisplay
                        meal_name={log.meal_name}
                        servings={log.servings}
                        date={new Date(log.date)}
                        recipe_id={log.recipe_id}
                        recipe_exists={log.recipe_exists}
                        serving_size_label={log.recipe_id ? recipeServingMap[log.recipe_id] : undefined}
                        onNameClick={() => log.recipe_id ? handleRecipeClick(log.recipe_id) : setEditingLogId(log._id)}
                        onEditClick={() => setEditingLogId(log._id)}
                        onMouseEnter={() => !isEditing && handleLogMouseEnter(log._id, `${log.meal_name} (${Number.isInteger(log.servings) ? log.servings : log.servings.toFixed(1)} servings)`)}
                        onMouseLeave={handleLogMouseLeave}
                      />
                    )
                  )}

                  {/* Render each component */}
                  {log.components.map((component, idx) => {
                    const componentId = `${log._id}-${idx}`;
                    const isEditingComponent = editingComponentId === componentId;

                    return (
                      <div
                        key={componentId}
                        className="log-wrapper"
                        onMouseEnter={() => !isEditingComponent && handleLogMouseEnter(componentId, formatLogDescription([component]))}
                        onMouseLeave={handleLogMouseLeave}
                      >
                        {isEditingComponent ? (
                          <EditLogForm
                            food_name={component.food_name}
                            date={new Date(log.date)}
                            amount={component.amount}
                            weight_in_grams={component.weight_in_grams}
                            _id={log._id}
                            componentIndex={idx}
                            recipeId={log.recipe_id}
                            onAnimationStart={handleAnimationStart}
                            onAnimationEnd={handleAnimationEnd}
                            onCancel={() => setEditingComponentId(null)}
                          />
                        ) : (
                          <div onClick={() => setEditingComponentId(componentId)}>
                            <DisplayLog
                              food_name={component.food_name}
                              date={new Date(log.date)}
                              amount={component.amount}
                              weight_in_grams={component.weight_in_grams}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}

      {selectedRecipe && (
        <RecipeCard
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onDelete={handleDeleteRecipe}
          onUpdate={handleRecipeUpdate}
        />
      )}
    </div>
  );
}

function DisplayLog ({ food_name, date, amount, weight_in_grams } : DisplayLogProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className='log-bubble'
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className='food-name-space'> {food_name} </div>
      <div className='food-portion-space'>
          {amount || `${Math.round(weight_in_grams)}g`}
      </div>
      <div className='food-weight-space'>
      </div>
      <div className='food-date-space'></div>
      <div className='food-time-space'> </div>

    </div>
  );
}


function DateDivider({date, tutorialTarget = false} : {date : Date, tutorialTarget?: boolean}) {
  const setCurrentDay = useSetRecoilState(currentDayAtom)
  return (
    <div className = {`date-divider${tutorialTarget ? ' tutorial-day-divider-target' : ''}`}>
      <button className = {`day${tutorialTarget ? ' tutorial-day-button' : ''}`}
        onClick = {() => { setCurrentDay(date); tutorialEvent('tutorial:day-changed'); }}>
        {date.toLocaleDateString('en-US', 
        { weekday: 'long', 
          month: 'long', 
          day: 'numeric'} )}
      </button>
    </div>
  )
}

export {LogList}
