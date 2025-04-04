import { TimePeriod } from "./structures";
import { useState, useEffect } from "react";
import '../assets/css/variables.css'
import { foodsAtom, nutrientDetailsByNameAtom} from "./account_states";
import { useRecoilValue } from "recoil";
// Function to interpolate between red and blue based on intake vs. target
const calculateColor = (percentage: number, shouldExceed: boolean) => {
  // If shouldExceed is true, red (when less) to green (when exceeded)
  // If shouldExceed is false, green (when less) to red (when exceeded)

  // Define RGB values for the two endpoints with higher saturation and brightness
  // Using more vibrant colors that will stand out against the gray/fog background
  const red = [0, 0, 0]; // Black
  const green = [255, 255, 255]; // White
  const yellow = [128, 0, 128]; // Purple
  
  // Calculate the ratio (how far along we are towards the target)
  const ratio = Math.min(percentage / 100, 1);
  
  let r, g, b;
  
  if (shouldExceed) {
    // For nutrients we want to exceed (like protein, vitamins)
    if (ratio < 0.5) {
      // Red to yellow (0% to 50%)
      const subRatio = ratio * 2; // Scale to 0-1 range
      r = Math.floor(red[0] * (1 - subRatio) + yellow[0] * subRatio);
      g = Math.floor(red[1] * (1 - subRatio) + yellow[1] * subRatio);
      b = Math.floor(red[2] * (1 - subRatio) + yellow[2] * subRatio);
    } else {
      // Yellow to green (50% to 100%)
      const subRatio = (ratio - 0.5) * 2; // Scale to 0-1 range
      r = Math.floor(yellow[0] * (1 - subRatio) + green[0] * subRatio);
      g = Math.floor(yellow[1] * (1 - subRatio) + green[1] * subRatio);
      b = Math.floor(yellow[2] * (1 - subRatio) + green[2] * subRatio);
    }
  } else {
    // For nutrients we don't want to exceed (like sodium, sugar)
    if (ratio < 0.5) {
      // Green to yellow (0% to 50%)
      const subRatio = ratio * 2; // Scale to 0-1 range
      r = Math.floor(green[0] * (1 - subRatio) + yellow[0] * subRatio);
      g = Math.floor(green[1] * (1 - subRatio) + yellow[1] * subRatio);
      b = Math.floor(green[2] * (1 - subRatio) + yellow[2] * subRatio);
    } else {
      // Yellow to red (50% to 100%)
      const subRatio = (ratio - 0.5) * 2; // Scale to 0-1 range
      r = Math.floor(yellow[0] * (1 - subRatio) + red[0] * subRatio);
      g = Math.floor(yellow[1] * (1 - subRatio) + red[1] * subRatio);
      b = Math.floor(yellow[2] * (1 - subRatio) + red[2] * subRatio);
    }
  }

  // Return the color as a CSS-compatible string with higher opacity
  return `rgba(${r}, ${g}, ${b}, 0.9)`;
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