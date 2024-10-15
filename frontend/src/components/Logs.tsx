import '../assets/css/logs.css'
import {Button} from '../components/Sections'
import RightArrow from '../assets/images/caret-right.svg?react'
import LeftArrow from '../assets/images/caret-left.svg?react'

interface LogbookProps {
  logs : LogProps[]
}

function LogList ({logs} : LogbookProps){
  console.log(logs)
  const sortedLogs = [...logs].sort((a, b) => (new Date(b.date).getTime()) - (new Date(a.date).getTime()));

  return (
    <div className = "log-list" >
      {sortedLogs.map((log, index) => {
        const currentDate = new Date(log.date);
        const previousDate = index > 0 ? new Date(sortedLogs[index - 1].date) : null;

        return (
        <div key={index} className = "logs-wrapper">

            {index>0 && currentDate.getDate() !== previousDate?.getDate() && (
                <DateDivider date = {currentDate}/>
            )}

            <Log
              key={index} // Using index as a key. Ideally, use a unique id if available.
              food_name={log.food_name}
              date={new Date(log.date)}
              amount_in_grams={log.amount_in_grams}
            /> 

        </div>)
        })}
    </div>
  );
};

interface LogProps {
  food_name: string;
  date: Date;
  amount_in_grams : number;
}

function Log({ food_name, date, amount_in_grams} : LogProps) { 
  return (<div className = 'log-bubble'> 
    <div className = 'entry-food-name'> {food_name} </div>
    <div className = 'entry-food-amt'> {amount_in_grams + ' g '}</div>
    <div className = 'entry-date'> {formatTime(date)} </div>
  </div>)
}

function formatTime(date : Date) {
  let hours: number = date.getHours(); // Get the current hour (0-23)
  let minutes: number | string = date.getMinutes(); // Get the current minute (0-59)
  
  const ampm = hours >= 12 ? 'PM' : 'AM'; // Determine AM/PM
  
  // Convert 24-hour format to 12-hour format
  hours = hours % 12;
  hours = hours ? hours : 12; // The hour '0' should be '12'
  
  // Ensure minutes are always two digits (e.g., "3:05 PM")
  minutes = minutes < 10 ? '0' + minutes : minutes;
  
  const timeString = `${hours}:${minutes} ${ampm}`;
  return timeString;
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


function formatDateRange(startDate: Date, endDate: Date) {
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  if (startYear === endYear) {
    const startMonth = startDate.toLocaleString('en-US', { month: 'long' });
    const endMonth = endDate.toLocaleString('en-US', { month: 'long' });
    if (startMonth === endMonth) return `${startMonth}`;
    else return `${startMonth} to ${endMonth}`;
  } 
  // If different years
  else {
    const startMonthShort = startDate.toLocaleString('en-US', { month: 'short' });
    const endMonthShort = endDate.toLocaleString('en-US', { month: 'short' });
    return `${startMonthShort} ${startYear} to ${endMonthShort} ${endYear}`;
  }
}

function DateSelector({startDate, endDate} : {startDate: Date, endDate: Date}){
  return (
    <div className="dashboard-menu w-clearfix">
    <div className="date-selector">
      <Button className="month-arrow left"> <LeftArrow/> </Button>
      <div className="range-text">{formatDateRange(startDate, endDate)}</div>
      <Button className="month-arrow"> <RightArrow/> </Button>
    </div>
    </div>
  )
}

export {Log, LogList, LogProps, DateSelector}