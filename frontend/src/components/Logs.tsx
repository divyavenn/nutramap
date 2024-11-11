import '../assets/css/logs.css'
import 'react-date-range/dist/styles.css'; // main style file
import 'react-date-range/dist/theme/default.css'; 

import {useState, useEffect} from 'react'
import { EditLogForm } from './EditLogForm';
import { formatTime } from './utlis';
import { LogbookProps, LogProps, DisplayLogProps } from './structures';
import {useRecoilState, useRecoilValue, useSetRecoilState} from 'recoil'
import { logsAtom, currentDayAtom, useRefreshLogs } from './states';


function LogList (){
  const logs = useRecoilValue(logsAtom)

  if (logs.length == 0) {
    return <div className="log-list">
      <div className = 'no-logs-message'> no logs in this time.</div> </div>;
      // Display this when logs array is empty
  }

  const sortedLogs = [...logs].sort((a, b) => (new Date(b.date).getTime()) - (new Date(a.date).getTime()));

  return (
    <div className="log-list">
      {sortedLogs.map((log, index) => {
        const currentDate = new Date(log.date);
        const previousDate = index > 0 ? new Date(sortedLogs[index - 1].date) : null;

        return (
          <div key={index} className="logs-wrapper">
            {index > 0 && currentDate.getDate() !== previousDate?.getDate() && (
              <DateDivider date={currentDate}/>
            )}

            <Log
              key={log._id}  // Using index as a key. Ideally, use a unique id if available.
              food_name={log.food_name}
              date={new Date(log.date)}
              amount_in_grams={log.amount_in_grams}
              _id = {log._id}
            /> 
          </div>
        );
      })}
    </div>
  );
}


function DisplayLog ({ food_name, date, amount_in_grams } : DisplayLogProps) {
   return (<div className = 'log-bubble'> 
    <div className = 'entry-food-name'> {food_name} </div>
    <div className = 'entry-food-amt'> {amount_in_grams}
    <div className="log-unit"> {'g'} </div>
    </div>
    <div className = 'entry-date'> {formatTime(date)} </div>
  </div>)
}

function Log({ food_name, date, amount_in_grams, _id} : LogProps) { 
  const [mouseOn, setMouseOn] = useState(false);
  return (
    <div className = 'log-wrapper'
    onMouseEnter={() => setMouseOn(true)}
    onMouseLeave={() => setMouseOn(false)}
    >
      {mouseOn ? (
          <EditLogForm
          food_name={food_name}
          date={date}
          amount_in_grams={amount_in_grams}
          _id = {_id}

        />
      ) : (
          <DisplayLog
          food_name={food_name}
          date={date}
          amount_in_grams={amount_in_grams}
        />
      )}
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
          day: 'numeric'} )}</button>
    </div>
  )
}



export {Log, LogList}