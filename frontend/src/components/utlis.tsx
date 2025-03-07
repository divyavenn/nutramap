import { TimePeriod } from "./structures";
import { useState, useEffect } from "react";
import '../assets/css/variables.css'
import { foodsAtom, nutrientDetailsByNameAtom} from "./account_states";
import { useRecoilValue } from "recoil";
// Function to interpolate between red and blue based on intake vs. target
const calculateColor = (percentage: number, shouldExceed: boolean) => {
  // If shouldExceed is true, red (when less) to blue (when exceeded)
  // If shouldExceed is false, blue (when less) to red (when exceeded)

  // Define RGB values for the two endpoints
  const red = [209, 99, 0]; // RGB for red
  const blue = [60, 181, 57]; // RGB for blue

  // Calculate the ratio (how far along we are towards the target)
  const ratio = Math.min(percentage / 100, 1);

  // Interpolate between red and blue
  const [r, g, b] = shouldExceed
    ? [
        Math.floor((1 - ratio) * red[0] + ratio * blue[0]),
        Math.floor((1 - ratio) * red[1] + ratio * blue[1]),
        Math.floor((1 - ratio) * red[2] + ratio * blue[2]),
      ]
    : [
        Math.floor((1 - ratio) * blue[0] + ratio * red[0]),
        Math.floor((1 - ratio) * blue[1] + ratio * red[1]),
        Math.floor((1 - ratio) * blue[2] + ratio * red[2]),
      ];

  // Return the color as a CSS-compatible string
  return `rgb(${r}, ${g}, ${b})`;
};

const getFoodID = (food_name : string, foodList : Record<string, number>) => {
  // Mock food data for autocomplete
  try {
    return foodList[food_name]
  }
  catch {
    console.log("No such food on list")
    throw Error("No such food on list")
  }
}


const getNutrientInfo = (nutrient_name : string, get_units = false, nutrientList : Record<string, { unit: string, id: number}>) => {
  // Mock food data for autocomplete
  try {
    const nutrient = nutrientList[nutrient_name]
    if (get_units) return nutrient.unit
    else return nutrient.id
  }
  catch {
    throw Error("No such nutrients on list")
  }
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

function isLoginExpired() {
  try {
    let token = localStorage.getItem('access_token')
    if (!token){
      return true;
    }
    // Split the token to access its payload
    const [, payloadBase64] = token.split('.');
    const payload = JSON.parse(atob(payloadBase64));

    // Get the current time in seconds
    const currentTime = Math.floor(Date.now() / 1000);

    // Compare the expiration time (`exp`) to the current time
    return payload.exp < currentTime;
  } catch (error) {
    return true;
  }
}

function formatDayForFrontend(day : Date){
  const today = new Date();
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayDateOnly = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  
  // Check if the date is today
  if (dayDateOnly.getTime() === todayDateOnly.getTime()) 
    return "today";
  else return day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function tolocalDateString (date : Date) {
  return date.getFullYear() + '-' +
  String(date.getMonth() + 1).padStart(2, '0') + '-' +
  String(date.getDate()).padStart(2, '0') + 'T' +
  String(date.getHours()).padStart(2, '0') + ':' +
  String(date.getMinutes()).padStart(2, '0') + ':' +
  String(date.getSeconds()).padStart(2, '0');
}

const getCurrentPeriod = () => {
  let now = new Date()
  return new TimePeriod(
    (new Date(now.getFullYear(), now.getMonth(), 1)), 
    (new Date(now.getFullYear(), now.getMonth() + 1, 0))
  )
}


function Typewriter({ text, speed = 100, style } : {text : string, speed : number, style : React.CSSProperties}) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let index = 0;

    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayedText((prev) => prev + text[index]);
        index++;
      } else {
        clearInterval(interval); // Stop the interval once typing is complete
      }
    }, speed);

    return () => clearInterval(interval); // Cleanup interval on unmount
  }, [text, speed]);

  return (
    <div style={style}>
      {displayedText}
      <span className="blinking-cursor">|</span>
    </div>
  );
}

const cleanLocalStorage = () => {
  localStorage.getItem('access_token') ? localStorage.removeItem('access_token') : null;
  localStorage.getItem('foods') ? localStorage.removeItem('foods') : null;
  localStorage.getItem('nutrients') ? localStorage.removeItem('nutrients') : null;
}  

export {calculateColor, getFoodID, formatTime, getCurrentPeriod, formatDayForFrontend, 
  Typewriter, tolocalDateString, getNutrientInfo, isLoginExpired, cleanLocalStorage}