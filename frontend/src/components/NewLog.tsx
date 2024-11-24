import React, { useState } from 'react' 
import {request} from './endpoints';
import {HoverButton } from './Sections';
import Arrow from '../assets/images/arrow.svg?react'
import Ok from '../assets/images/checkmark.svg?react'
import '../assets/css/new_log.css'
import '../assets/css/buttons.css'
import { getFoodID } from './utlis';
import { tolocalDateString } from './utlis'
import { useRefreshLogs } from './dashboard_states';
import { foodsAtom } from './account_states';
import { useRecoilValue } from 'recoil';
import { useMemo, useEffect } from 'react';


function NewLogForm(){

  // Mock food data for autocomplete
  const foodList : Record<string, number> = useRecoilValue(foodsAtom)

  const [formData, setFormData] = useState({
    food_name : '',
    amount_in_grams : '', 
    date : new Date(),
  })

  const [suggestions, setSuggestions] = useState<string[]>([]); // State for filtered suggestions
  const [showSuggestions, setShowSuggestions] = useState(false); // Control the visibility of suggestions
  const [validInput, markValidInput] = useState(true)

  // const [activeIndex, setActiveIndex] = useState(-1); // Track the currently highlighted suggestion


  // const handleKeyDown = (e: React.KeyboardEvent) => {
  //   if (e.key === 'ArrowDown') {
  //     // Navigate down through the suggestions list
  //     e.preventDefault(); // Prevent default behavior (e.g., scrolling)
  //     setActiveIndex((prevIndex) =>
  //       prevIndex < suggestions.length - 1 ? prevIndex + 1 : 0
  //     );
  //   } else if (e.key === 'ArrowUp') {
  //     // Navigate up through the suggestions list
  //     e.preventDefault(); // Prevent default behavior
  //     setActiveIndex((prevIndex) =>
  //       prevIndex > 0 ? prevIndex - 1 : suggestions.length - 1
  //     );
  //   } else if (e.key === 'Enter' && activeIndex >= 0) {
  //     // Select the currently highlighted suggestion
  //     e.preventDefault(); // Prevent form submission
  //     handleSuggestionClick(suggestions[activeIndex]);
  //   } else if (e.key === 'Enter' && suggestions.length > 0 && activeIndex === -1) {
  //     // If no suggestion is active, select the first one
  //     e.preventDefault();
  //     handleSuggestionClick(suggestions[0]);
  //   } else if (e.key === 'Escape') {
  //     // Close the suggestions list
  //     setShowSuggestions(false);
  //     setActiveIndex(-1);
  //   }
  // };


  const filteredFoods = useMemo(() => {
    return Object.keys(foodList).filter(food =>
      food.toLowerCase().includes(formData.food_name.toLowerCase())
    );
  }, [formData.food_name, foodList]);

  useEffect(() => {
    setSuggestions(filteredFoods); // Set suggestions directly
    setShowSuggestions(formData.food_name.length > 0 && filteredFoods.length > 0);
  }, [filteredFoods]);


  const refreshLogs = useRefreshLogs();

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const {name, value} = e.target; // get the name and value of the input field
    setFormData({
      ...formData,
      [name] : value, // this works because the form variables match the names of the input fields
    })
    //for the food name input
    if (name === 'food_name') {
      markValidInput(value in foodList)
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
    await request(
      '/logs/new',
      'POST', 
      {
        food_id: (getFoodID(formData.food_name, foodList)),
        amount_in_grams: (formData.amount_in_grams),
        date: tolocalDateString(new Date())
      })
    setFormData({ food_name: '', amount_in_grams: '', date : new Date()})
    refreshLogs()
  }

  return (
    <form
      id="login-form" className = {`form-elements-wrapper ${showSuggestions ? 'active' : ''}`} onSubmit={handleSubmit}>
      <div className={`entry-form-bubble ${showSuggestions ? 'active' : ''}`}>
      <div className= 'input-food-name-wrapper'>
        <input
          name='food_name'
          className = 'input-food-name'
          placeholder='food'
          value = {formData.food_name}
          onChange={handleTyping}
          required
        ></input>
      </div>

      <div className="input-food-amt-wrapper">
      <input
        name="amount_in_grams"
        className="input-food-amt"
        type="number"
        placeholder="0"
        value={formData.amount_in_grams}
        onChange={(e) => {
          const value = parseFloat(e.target.value);
          if (value > 0 || e.target.value === '') {
            handleTyping(e);
          }
        }}
        required
      />
        <span className="unit">g</span>
      </div>

      
      <div className = 'new-log-button-container'>
      {formData.food_name && formData.amount_in_grams && validInput &&
      <HoverButton
              type="submit"
              className="new-log-button"
              disabled={!formData.food_name || !formData.amount_in_grams || !validInput}
              childrenOn={<Ok/>}
              childrenOff={<Arrow/>}>
      </HoverButton>}
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
    </form>
    
  )

}

export  {NewLogForm}