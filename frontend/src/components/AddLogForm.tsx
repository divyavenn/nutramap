import React, { useState } from 'react' 
import {request} from './endpoints';
import {HoverButton } from './Sections';
import Arrow from '../assets/images/arrow.svg?react'
import Ok from '../assets/images/checkmark.svg?react'
import '../assets/css/new_log.css'
import '../assets/css/buttons.css'
import { getFoodID } from './utlis';
import { tolocalDateString } from '../components/utlis'
import { useRefreshLogs } from './dashboard_states';




function NewLogForm(){

  // Mock food data for autocomplete
  const foodList : Record<string, string> = JSON.parse(localStorage.getItem('foods') || '{}');

  const [formData, setFormData] = useState({
    food_name : '',
    amount_in_grams : '', 
    date : new Date(),
  })

  const [suggestions, setSuggestions] = useState<string[]>([]); // State for filtered suggestions
  const [showSuggestions, setShowSuggestions] = useState(false); // Control the visibility of suggestions
  const [validInput, markValidInput] = useState(true)

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
    await request(
      '/logs/new',
      'POST', 
      {
        food_id: (getFoodID(formData.food_name)),
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
          name='amount_in_grams'
          className = 'input-food-amt'
          type = 'number'
          placeholder='0'
          value = {formData.amount_in_grams}
          onChange={handleTyping}
          required
        ></input>
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