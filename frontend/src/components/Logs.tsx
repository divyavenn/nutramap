import '../assets/css/logs.css'
import 'react-date-range/dist/styles.css'; // main style file
import 'react-date-range/dist/theme/default.css';

import {useState, useRef, useEffect} from 'react'
import { EditLogForm } from './EditLogForm';
import { RecipeEdit } from './RecipeEdit';
import { RecipeDisplay } from './RecipeDisplay';
import { formatTime } from './utlis';
import { LogProps, DisplayLogProps, LogComponent } from './structures';
import {useRecoilValue, useSetRecoilState, useRecoilState} from 'recoil'
import { logsAtom, currentDayAtom, hoveredLogAtom, useRefreshLogs, pendingFoodsAtom, PendingFood } from './dashboard_states';
import { motion } from 'framer-motion';
import { RecipeDivider } from './RecipeDivider';

function LogList (){
  const logs = useRecoilValue(logsAtom)
  const pendingFoods = useRecoilValue(pendingFoodsAtom)
  // Track which log is being hovered
  const [hoveredLog, setHoveredLog] = useRecoilState(hoveredLogAtom);
  // Track if an animation is currently playing
  const [animationLock, setAnimationLock] = useState(false);
  // Track which recipe log is being edited
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  // Track which component is being edited (format: "logId-componentIndex")
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);

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


  if (logs.length === 0 && pendingFoods.length === 0) {
    return <div className="log-list">
      <div className = 'no-logs-message'> no logs in this time.</div> </div>;
      // Display this when logs array is empty
  }

  // Group logs and pending foods by date
  const groupedByDate = new Map<string, {logs: LogProps[], pending: PendingFood[]}>();
  
  // Add regular logs to groups
  logs.forEach(log => {
    const dateKey = new Date(log.date).toDateString();
    if (!groupedByDate.has(dateKey)) {
      groupedByDate.set(dateKey, {logs: [], pending: []});
    }
    groupedByDate.get(dateKey)!.logs.push(log);
  });
  
  // Add pending foods to groups
  pendingFoods.forEach(food => {
    const dateKey = new Date(food.timestamp).toDateString();
    if (!groupedByDate.has(dateKey)) {
      groupedByDate.set(dateKey, {logs: [], pending: []});
    }
    groupedByDate.get(dateKey)!.pending.push(food);
  });
  
  // Convert to array and sort by date (newest first)
  const sortedDates = Array.from(groupedByDate.entries())
    .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());

  
  const formatLogDescription = (components: LogComponent[]): string => {
    if (components.length === 0) return 'No components';
    if (components.length === 1) {
      const comp = components[0];
      return `${Math.round(comp.weight_in_grams)} g of ${comp.food_name.split(',')[0]}`;
    }
    return `${components.length} components`;
  };

  // Handle mouse enter for a specific log - immediate response
  const handleLogMouseEnter = (logId: string, blurb: string) => {
    // Only change the hovered log if no animation is playing
    if (!animationLock) {
      setHoveredLog([logId, blurb]);
    }
  };

  // Handle mouse leave for a specific log - immediate response
  const handleLogMouseLeave = () => {
    // Only change the hovered log if no animation is playing
    if (!animationLock) {
      setHoveredLog(null);
    }
  };

  // Function to handle animation start
  const handleAnimationStart = () => {
    setAnimationLock(true);
  };

  // Function to handle animation end
  const handleAnimationEnd = () => {
    setAnimationLock(false);
  };

  return (
    <div className="log-list">
      {sortedDates.map(([dateKey, { logs: dateLogs, pending: datePending }]) => {
        // Sort logs by time (newest first)
        const sortedLogs = [...dateLogs].sort((a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        return (
          <div key={dateKey} className="logs-wrapper">
            {/* Date divider for this group */}
            <DateDivider date={new Date(dateKey)} />

            {/* Render pending foods for this date first */}
            {datePending.map((pendingFood, index) => (
              <div key={`pending-${index}`} className="log-wrapper">
                <motion.div
                  className="log-bubble pending-food-item"
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
                  <div className="entry-food-name">{pendingFood.name}</div>
                  <div className="entry-food-amt">
                    -- <div className="log-unit">g</div>
                  </div>
                  <div className="entry-date">{formatTime(new Date(pendingFood.timestamp))}</div>
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

              return (
                <div key={log._id} >
                  {/* Recipe header - show edit form if editing, otherwise show normal header */}
                  {isEditing ? (
                    <div className="log-wrapper">
                      <RecipeEdit
                        recipe_name={log.recipe_name}
                        servings={log.servings}
                        date={new Date(log.date)}
                        _id={log._id}
                        onCancel={() => setEditingLogId(null)}
                        onAnimationStart={handleAnimationStart}
                        onAnimationEnd={handleAnimationEnd}
                      />
                    </div>
                  ) : (
                    <RecipeDisplay
                      recipe_name={log.recipe_name}
                      servings={log.servings}
                      date={new Date(log.date)}
                      recipe_id={log.recipe_id}
                      recipe_exists={log.recipe_exists}
                      onClick={() => setEditingLogId(log._id)}
                      onMouseEnter={() => !isEditing && handleLogMouseEnter(log._id, `${log.recipe_name} (${log.servings} servings)`)}
                      onMouseLeave={handleLogMouseLeave}
                    />
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


function DateDivider({date} : {date : Date}) {
  const setCurrentDay = useSetRecoilState(currentDayAtom)
  return (
    <div className = 'date-divider'>
      <button className = 'day' 
        onClick = {() => setCurrentDay(date)}>
        {date.toLocaleDateString('en-US', 
        { weekday: 'long', 
          month: 'long', 
          day: 'numeric'} )}
      </button>
    </div>
  )
}

export {LogList}