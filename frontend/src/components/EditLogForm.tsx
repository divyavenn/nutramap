import React, { useState, useEffect, useRef, KeyboardEvent } from 'react' 
import {request} from './endpoints';
import {HoverButton, ImageButton } from './Sections';
import YesOk from '../assets/images/check_circle.svg?react'
import IsOk from '../assets/images/checkmark.svg?react'
import Trashcan from '../assets/images/trashcan.svg?react'
import { CalendarDay} from './DateSelector';
import { getFoodID } from './utlis';
import { tolocalDateString } from '../components/utlis'
import { useRecoilValue } from 'recoil';

import '../assets/css/edit_log.css'
import { LogProps } from './structures';
import { useRefreshLogs } from './dashboard_states';
import { foodsAtom } from './account_states';


function EditLogForm({food_name, date, amount_in_grams, _id} : LogProps){

  // Mock food data for autocomplete
  const foodList = useRecoilValue(foodsAtom)
  const [deleted, setDeleted] = useState(false)
  const [formData, setFormData] = useState({
    food_name : food_name,
    amount_in_grams : String(amount_in_grams), 
    date : date,
  })
  const [isSubmitting, setIsSubmitting] = useState(false); // Track submission animation state

  const refreshLogs = useRefreshLogs();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [suggestions, setSuggestions] = useState<string[]>([]); // State for filtered suggestions
  const [showSuggestions, setShowSuggestions] = useState(false); // Control the visibility of suggestions
  const [showCalendar, setShowCalendar] = useState(false)
  const [validInput, markValidInput] = useState(true)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1); // Track selected suggestion

  // Auto-adjust textarea height based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [formData.food_name]);

  // Reset selected suggestion index when suggestions change
  useEffect(() => {
    setSelectedSuggestionIndex(suggestions.length > 0 ? 0 : -1);
  }, [suggestions]);

  // Prevent events from bubbling up to parent, except for mouseLeave
  const handleMouseEvent = (e: React.MouseEvent) => {
    // Don't stop propagation for mouseLeave events
    if (e.type !== 'mouseleave') {
      e.stopPropagation();
    }
  };

  // Handle keyboard navigation for suggestions
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!showSuggestions) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev > 0 ? prev - 1 : prev
        );
        break;
      case 'Tab':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          handleSuggestionClick(suggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Enter':
        // If suggestions are shown and one is selected, select it
        if (showSuggestions && selectedSuggestionIndex >= 0) {
          e.preventDefault();
          handleSuggestionClick(suggestions[selectedSuggestionIndex]);
        }
        // Otherwise, let the form submit normally
        break;
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        // Allow these to work normally for cursor movement
        break;
    }
  };

  // Prevent Enter key from creating new lines in textarea
  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Call the general key handler first
    handleKeyDown(e);
    
    // Prevent Enter from creating a new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      
      // If no suggestions are shown or none selected, submit the form
      if (!showSuggestions || selectedSuggestionIndex < 0) {
        const form = document.getElementById('edit-log-form') as HTMLFormElement;
        if (form) form.requestSubmit();
      }
    }
  };

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


  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(date.getDate()).padStart(2, '0');
  
    return `${year}-${month}-${day}`;
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    }
    catch {}
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
    e.preventDefault() // prevent automatic submission
    e.stopPropagation(); // prevent event from bubbling up

    
    // Start the submission animation
    setIsSubmitting(true);
    
    // Add a delay to show the animation before submitting
    setTimeout(async () => {
      const data = {
        food_id: getFoodID(formData.food_name, foodList),
        amount_in_grams: Number(formData.amount_in_grams),
        date: tolocalDateString(formData.date),
        log_id: _id
      }
      await request('/logs/edit', 'POST', data, 'JSON')
      refreshLogs()
      
      // Reset the submission state after a short delay to show the animation
      setTimeout(() => {
        setIsSubmitting(false);
      }, 500);
    }, 800); // Delay before actual submission
  }

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault() // prevent automatic submission
    e.stopPropagation(); // prevent event from bubbling up
    
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
        className={`edit-form-container ${showSuggestions ? 'active' : ''} ${isSubmitting ? 'submitting' : ''}`}
        onSubmit={handleSubmit}
        onMouseEnter={handleMouseEvent}
        onMouseLeave={handleMouseEvent}
        onMouseOver={handleMouseEvent}
        onMouseMove={handleMouseEvent}
        onClick={handleMouseEvent}
      >
        
        <div className={`delete-log-button-container ${isSubmitting ? 'hide' : ''}`}>
          <ImageButton
                  type="button"
                  onClick={handleDelete}
                  className="delete-button"
                  children={<Trashcan/>}>
          </ImageButton>  
        </div>

        <div className="form-dropdown-wrapper">
          <div className={`edit-entry-form-bubble ${showSuggestions ? 'active' : ''}`}>
            <div className='edit-food-name'>
              <textarea
                ref={textareaRef}
                name='food_name'
                className='edit-input-food-name textarea-auto-height'
                placeholder='food'
                value={formData.food_name}
                onChange={handleTyping}
                onKeyDown={handleTextareaKeyDown}
                required
              ></textarea>
            </div>

            <div className="edit-input-food-amt-wrapper">
              <input
                name='amount_in_grams'
                className='edit-input-food-amt'
                type='number'
                placeholder='0'
                value={formData.amount_in_grams}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
                required
              ></input>
              <div className="edit-unit">g</div>
            </div>

            <div className='edit-dateTime-container'>
              <div className='edit-input-date-wrapper'>
                <input
                  className='edit-input-date'
                  name='date'
                  type='date'
                  onChange={handleDateChange}
                  onKeyDown={handleKeyDown}
                  value={formatDate(formData.date)} // Format date to 'YYYY-MM-DD'
                  required
                />
              </div>

              <div className='edit-input-time-wrapper'>
                <input className='edit-input-time-wrapper'
                name='time'
                type='time'
                onChange={handleTimeChange}
                onKeyDown={handleKeyDown}
                value={`${String(formData.date.getHours()).padStart(2, '0')}:${String(formData.date.getMinutes()).padStart(2, '0')}`}
                required>
                </input>
              </div>
            </div>
          </div>

          {showSuggestions && (
            <ul 
              className="suggestions-list" 
              onMouseEnter={handleMouseEvent}
              onMouseLeave={handleMouseEvent}
              onMouseOver={handleMouseEvent}
              onMouseMove={handleMouseEvent}
            >
              {suggestions.map((suggestion, index) => (
                <li key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className={`suggestion-item ${index === selectedSuggestionIndex ? 'selected' : ''}`}
                    onMouseEnter={() => setSelectedSuggestionIndex(index)}
                >
                  {suggestion}
                </li>
              ))}
            </ul>
          )}

          {showCalendar && (
          <div 
            className='calendar-dropdown-wrapper' 
            onMouseEnter={handleMouseEvent}
            onMouseLeave={handleMouseEvent}
            onMouseOver={handleMouseEvent}
            onMouseMove={handleMouseEvent}
          >
            <CalendarDay
            day={date}
            handleSelect={handleSelect}
            isOpen={showCalendar}
            setIsOpen={setShowCalendar}/>
          </div>
          )}
        </div>

        <div className='edit-log-submit-container'>
          <HoverButton
                  type="submit"
                  className={`edit-log-submit ${isSubmitting ? 'confirming' : ''}`}
                  disabled={!formData.food_name || !formData.amount_in_grams || !validInput || isSubmitting}
                  childrenOn={<YesOk/>}
                  childrenOff={<IsOk/>}>
          </HoverButton>
        </div> 
      </form>
    ) :
    <div>

      
    </div>
  )

}

export {EditLogForm}