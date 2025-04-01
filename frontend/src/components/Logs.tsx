import '../assets/css/logs.css'
import 'react-date-range/dist/styles.css'; // main style file
import 'react-date-range/dist/theme/default.css'; 

import {useState, useRef, useEffect} from 'react'
import { EditLogForm } from './EditLogForm';
import { formatTime } from './utlis';
import { LogProps, DisplayLogProps } from './structures';
import {useRecoilValue, useSetRecoilState} from 'recoil'
import { logsAtom, currentDayAtom, useRefreshLogs } from './dashboard_states';

function LogList (){
  const logs = useRecoilValue(logsAtom) 
  // Track which log is being hovered
  const [hoveredLogId, setHoveredLogId] = useState<string | null>(null);
  // Refs to store dimensions of display logs
  const logDimensionsRef = useRef<{[key: string]: DOMRect | null}>({});
  
  if (logs.length == 0) {
    return <div className="log-list">
      <div className = 'no-logs-message'> no logs in this time.</div> </div>;
      // Display this when logs array is empty
  }

  const sortedLogs = [...logs].sort((a, b) => 
    (new Date(b.date).getTime()) - (new Date(a.date).getTime()));

  // Handle mouse enter for a specific log - immediate response
  const handleLogMouseEnter = (logId: string) => {
    setHoveredLogId(logId);
  };

  // Handle mouse leave for a specific log - immediate response
  const handleLogMouseLeave = () => {
    setHoveredLogId(null);
  };

  // Function to store the dimensions of a display log
  const storeLogDimensions = (logId: string, element: HTMLDivElement | null) => {
    if (element) {
      logDimensionsRef.current[logId] = element.getBoundingClientRect();
    }
  };

  return (
    <div className="log-list">
      {sortedLogs.map((log, index) => {
        const currentDate = new Date(log.date);
        const previousDate = index > 0 ? new Date(sortedLogs[index - 1].date) : null;

        return (
          <div key={index} className="logs-wrapper">
            {(currentDate.getDate() !== previousDate?.getDate()) && (
              <DateDivider date={currentDate}/>
            )}

            <div 
              className="log-wrapper"
              onMouseEnter={() => handleLogMouseEnter(log._id)}
              onMouseLeave={handleLogMouseLeave}
            >
              <div className={`log-content ${hoveredLogId === log._id ? 'edit-mode' : ''}`}>
                {hoveredLogId === log._id ? (
                    <EditLogForm
                      food_name={log.food_name}
                      date={new Date(log.date)}
                      amount_in_grams={log.amount_in_grams}
                      _id={log._id}
                    />
                ) : (
                    <DisplayLog
                      food_name={log.food_name}
                      date={new Date(log.date)}
                      amount_in_grams={log.amount_in_grams}
                    />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DisplayLog ({ food_name, date, amount_in_grams } : DisplayLogProps) {
   return (<div className = 'log-wrapper'> 
    <div className = 'entry-food-name'> {food_name} </div>
    <div className = 'entry-food-amt'> {amount_in_grams}
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

export {Log, LogList}