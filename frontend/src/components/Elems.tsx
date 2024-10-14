import {Link} from 'react-router-dom';
import '../assets/css/logs.css'

interface ListElemProps {
  nutrients: string[]
}
function ListElems({ nutrients} : ListElemProps) { 
  console.log("Rendering:" + nutrients[0]); // Debug log
  const nutrientList = nutrients.map((n) => <li key={n}>{n}</li>);
  return <ul className='custom-list'>{nutrientList}</ul>;
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
        <div className = "logs-wrapper">

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

interface LinkProps{
  url : string
  text : string
  className? : string
  href? : false
}


function HREFLink({url, text, className = "link-text"} : LinkProps) {
  return (
  <div className={className}>
    <a href={url}>{text}</a>
  </div>)
}

function PageLink({url, text, className = "link-text"} : LinkProps) {
  return (
  <div className={className}>
    <Link to={url}>{text}</Link>
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

export {ListElems, Log, LogList, LogProps, HREFLink, PageLink};
