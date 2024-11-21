import React, { useState } from 'react' 
import {request} from './endpoints';
import {HoverButton, ImageButton } from './Sections';
import YesOk from '../assets/images/check_circle.svg?react'
import IsOk from '../assets/images/checkmark.svg?react'
import Trashcan from '../assets/images/trashcan.svg?react'
import { CalendarDay} from './DateSelector';
import { getFoodID } from './utlis';
import { tolocalDateString } from '../components/utlis'

import '../assets/css/edit_log.css'
import { LogProps } from './structures';
import { useRefreshLogs } from './dashboard_states';



function EditLogForm({food_name, date, amount_in_grams, _id} : LogProps){

  // Mock food data for autocomplete
  const foodList : Record<string, string> = JSON.parse(localStorage.getItem('foods') || '{}');
  const [deleted, setDeleted] = useState(false)
  const [formData, setFormData] = useState({
    food_name : food_name,
    amount_in_grams : String(amount_in_grams), 
    date : date,
  })

  const refreshLogs = useRefreshLogs();

  const [suggestions, setSuggestions] = useState<string[]>([]); // State for filtered suggestions
  const [showSuggestions, setShowSuggestions] = useState(false); // Control the visibility of suggestions
  const [showCalendar, setShowCalendar] = useState(false)
  const [validInput, markValidInput] = useState(true)


  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    
    try {
      const newTime = e.target.value; // e.g., "14:30" (HH:mm format)
    
      // Split the new time into hours and minutes
      const [hours, minutes] = newTime.split(':').map(Number);
    
      if (isNaN(hours) || isNaN(minutes) || hours > 12 || minutes > 59) {
        console.log("Invalid Time");
        return; // Exit the function if the date is invalid
      }

      // Update the date directly using a copy of formData.date
      const updatedDate = new Date(formData.date);
      updatedDate.setHours(hours);
      updatedDate.setMinutes(minutes);
      updatedDate.setSeconds(0); // Reset seconds to zero
    
      // Update the formData state
      setFormData({
        ...formData,
        date: updatedDate, // Convert it back to an ISO string for consistency
      });
    }
    catch{}
  };


  const formatDate = (date : Date) => { 
    try {
      return date.toISOString().split('T')[0];
    }
    catch {
      console.log("Error" + date.toString())
    }
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("typing " + e.target.value)
    try{
      const newDate = e.target.value; // e.g., "2024-10-24" (YYYY-MM-DD format)
      
      // Split the new date into year, month, and day
      const [year, month, day] = newDate.split('-').map(Number);

      if (day < 1 || day > 31 || month < 1 || month > 12) {
        console.log("Invalid Date");
        return; // Exit the function if the date is invalid
      }
    
      // Update the date directly using a copy of formData.date
      const updatedDate = new Date(formData.date);
    
      // Set the year, month (note: month is 0-indexed in JavaScript), and day
      updatedDate.setFullYear(year);
      updatedDate.setMonth(month - 1); // Subtract 1 because months are 0-indexed
      updatedDate.setDate(day);
    
      // Update the formData state
      setFormData({
        ...formData,
        date: updatedDate,
      });
      console.log("Changed data")
  }
  catch {}
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const {name, value} = e.target; // get the name and value of the input field

    setFormData({
      ...formData,
      [name] : value, // this works because the form variables match the names of the input fields
    })

    //for the food name input
    if (name === 'food_name') {
      markValidInput(value in foodList)
      // Filter the foodList to match the input value
      const filteredFoods = Object.keys(foodList).filter(food =>
        food.toLowerCase().includes(value.toLowerCase())
      );

      // Show suggestions only if there are matches and the input isn't empty
      setSuggestions(filteredFoods);
      setShowSuggestions(value.length > 0 && filteredFoods.length > 0);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    markValidInput(true)
    // Update the formData with the selected suggestion
    setFormData({
      ...formData,
      food_name: suggestion,
    });
    setShowSuggestions(false); // Hide suggestions after selection
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    // setShowCalendar(false)
    // setShowSuggestions(false)
    e.preventDefault() // prevent automatic submission
    let data = {
      food_id: getFoodID(formData.food_name),
      amount_in_grams: Number(formData.amount_in_grams),
      date: tolocalDateString(formData.date),
      log_id: _id
    }
    await request('/logs/edit', 'POST', data, 'JSON')
    refreshLogs()
  }

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault() // prevent automatic submission
    await request(`/logs/delete?log_id=${_id}`, 'DELETE')
    console.log("Log deleted successfully");
    setDeleted(true)
    refreshLogs()
    setFormData({ ...formData, food_name: '', amount_in_grams : ''})
  }

  const handleSelect = (date: Date) => {
    setFormData({...formData, date : date});
  };

  return (
    !deleted ? (
    <form
      id="edit-log-form"
      className = {`edit-form-elements-wrapper ${showSuggestions ? 'active' : ''}`}
      onSubmit={handleSubmit}>
      
      <div className = 'delete-log-button-container'>
        <ImageButton
                type= "button"
                onClick= {handleDelete}
                className= "delete-button"
                children= {<Trashcan/>}>
        </ImageButton>  
      </div>

        <div className = "form-dropdown-wrapper">
        
          <div className={`edit-entry-form-bubble ${showSuggestions ? 'active' : ''}`}>
            <div className= 'edit-input-food-name-wrapper'>
              <input
                name='food_name'
                className = 'edit-input-food-name'
                placeholder='food'
                value = {formData.food_name}
                onChange={handleTyping}
                required
              ></input>
            </div>

            <div className="edit-input-food-amt-wrapper ">
              <input
                name='amount_in_grams'
                className = 'edit-input-food-amt'
                type = 'number'
                placeholder='0'
                value = {formData.amount_in_grams}
                onChange={handleTyping}
                required
              ></input>
              <span className="edit-unit">g</span>
            </div>


            <div className='edit-dateTime-container'>

              <div className = 'edit-input-date-wrapper'>
              
              <div className='edit-input-date-wrapper'>
                <input
                  className='edit-input-date'
                  name='date'
                  type='date'
                  onChange={handleDateChange}
                  value={formatDate(formData.date)} // Format date to 'YYYY-MM-DD'
                  required
                />
              </div>
                
              </div>

              <div className='edit-input-time-wrapper '>
                <input className='edit-input-time-wrapper'
                name = 'time'
                type = 'time'
                onChange={handleTimeChange}
                value = {`${String(formData.date.getHours()).padStart(2, '0')}:${String(formData.date.getMinutes()).padStart(2, '0')}`}
                required>
                </input>
            </div>

            </div>

          </div>

          {showSuggestions && (
            <ul className="suggestions-list">
              {suggestions.map(suggestion => (
                <li key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="suggestion-item">
                  {suggestion}
                </li>
              ))}
            </ul>
          )}

          {showCalendar && (
          <div className = 'calendar-dropdown-wrapper'>
            <CalendarDay
            day={date}
            handleSelect={handleSelect}
            isOpen = {showCalendar}
            setIsOpen={setShowCalendar}/>
          </div>
          )}
            
        </div>

        <div className = 'edit-log-submit-container'>
          <HoverButton
                  type="submit"
                  className="edit-log-submit"
                  disabled={!formData.food_name || !formData.amount_in_grams || !validInput}
                  childrenOn={<YesOk/>}
                  childrenOff={<IsOk/>}>
          </HoverButton>
        </div> 
    </form>) :
    <div>

      
    </div>
  )

}

export  {EditLogForm}