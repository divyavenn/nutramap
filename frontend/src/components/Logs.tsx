import '../assets/css/logs.css'
import 'react-date-range/dist/styles.css'; // main style file
import 'react-date-range/dist/theme/default.css'; 

import {useState} from 'react'
import { EditLogForm } from './EditLogForm';
import { formatTime } from './utlis';


interface LogbookProps {
  logs : LogProps[]
  callAfterSubmitting: () => void;
}

function LogList ({logs, callAfterSubmitting} : LogbookProps){
  if (logs.length == 0) {
    return <div className="log-list">
      <div className = 'no-logs-message'> no logs in this time.</div> </div>;  // Display this when logs array is empty
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
              <DateDivider date={currentDate} />
            )}

            <Log
              key={log._id}  // Using index as a key. Ideally, use a unique id if available.
              food_name={log.food_name}
              date={new Date(log.date)}
              amount_in_grams={log.amount_in_grams}
              _id = {log._id}
              callAfterSubmitting={callAfterSubmitting}
            /> 
          </div>
        );
      })}
    </div>
  );
}

interface DisplayLogProps {
  food_name: string;
  date: Date;
  amount_in_grams : number;
}

interface LogProps {
  food_name: string;
  date: Date;
  amount_in_grams : number;
  _id : string;
  callAfterSubmitting: () => void;
}

function DisplayLog ({ food_name, date, amount_in_grams } : DisplayLogProps) {
   return (<div className = 'log-bubble'> 
    <div className = 'entry-food-name'> {food_name} </div>
    <div className = 'entry-food-amt'> {amount_in_grams + ' g '}</div>
    <div className = 'entry-date'> {formatTime(date)} </div>
  </div>)
}

function Log({ food_name, date, amount_in_grams, _id, callAfterSubmitting} : LogProps) { 
  const [mouseOn, setMouseOn] = useState(false);
  return (
    <div
    onMouseEnter={() => setMouseOn(true)}
    onMouseLeave={() => setMouseOn(false)}
    >
      {mouseOn ? (
          <EditLogForm
          food_name={food_name}
          date={date}
          amount_in_grams={amount_in_grams}
          _id = {_id}
          callAfterSubmitting={callAfterSubmitting}

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
  return (
    <div className = 'date-divider'>
      <div className = 'day'>
        {date.toLocaleDateString('en-US', 
        { weekday: 'long', 
          month: 'long', 
          day: 'numeric'} )}</div>
    </div>
  )
}



export {Log, LogList, LogProps}