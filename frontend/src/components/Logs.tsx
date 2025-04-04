import '../assets/css/logs.css'
import 'react-date-range/dist/styles.css'; // main style file
import 'react-date-range/dist/theme/default.css'; 

import {useState, useRef, useEffect} from 'react'
import { EditLogForm } from './EditLogForm';
import { formatTime } from './utlis';
import { LogProps, DisplayLogProps } from './structures';
import {useRecoilValue, useSetRecoilState} from 'recoil'
import { logsAtom, currentDayAtom, useRefreshLogs, pendingFoodsAtom, PendingFood } from './dashboard_states';
import { motion } from 'framer-motion';

function LogList (){
  const logs = useRecoilValue(logsAtom) 
  const pendingFoods = useRecoilValue(pendingFoodsAtom)
  // Track which log is being hovered
  const [hoveredLogId, setHoveredLogId] = useState<string | null>(null);
  // Track if an animation is currently playing
  const [animationLock, setAnimationLock] = useState(false);

  
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

  // Handle mouse enter for a specific log - immediate response
  const handleLogMouseEnter = (logId: string) => {
    // Only change the hovered log if no animation is playing
    if (!animationLock) {
      setHoveredLogId(logId);
    }
  };

  // Handle mouse leave for a specific log - immediate response
  const handleLogMouseLeave = () => {
    // Only change the hovered log if no animation is playing
    if (!animationLock) {
      setHoveredLogId(null);
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
            
            {/* Then render regular logs */}
            {sortedLogs.map((log) => (
              <div 
                key={log._id} 
                className="log-wrapper"
                onMouseEnter={() => handleLogMouseEnter(log._id)}
                onMouseLeave={handleLogMouseLeave}
              >
                {hoveredLogId === log._id ? (
                  <EditLogForm
                    food_name={log.food_name}
                    date={new Date(log.date)}
                    amount_in_grams={log.amount_in_grams}
                    _id={log._id}
                    onAnimationStart={handleAnimationStart}
                    onAnimationEnd={handleAnimationEnd}
                  />
                ) : (
                  <DisplayLog
                    food_name={log.food_name}
                    date={new Date(log.date)}
                    amount_in_grams={log.amount_in_grams}
                  />
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function DisplayLog ({ food_name, date, amount_in_grams } : DisplayLogProps) {
   return (<div className = 'log-bubble'> 
    <div className = 'entry-food-name'> {food_name} </div>
    <div className='entry-food-amt'>{Math.round(amount_in_grams)}
    <div className="log-unit"> {'g'} </div>
    </div>
    <div className = 'entry-date'> {formatTime(date)} </div>
  </div>)
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