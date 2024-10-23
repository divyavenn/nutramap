import React, { useEffect, useState } from 'react' 
import {getHeaderWithToken, doWithData } from './LoadHtml';
import {HoverButton, ImageButton } from './Sections';
import Arrow from '../assets/images/arrow.svg?react'
import Ok from '../assets/images/checkmark.svg?react'
import Trashcan from '../assets/images/trashcan.svg?react'

import '../assets/css/edit_log.css'
import '../assets/css/buttons.css'

import { formatDayForBackend } from './utlis';

interface KeyValue {
  id : number;
  name : string;
}


interface EditLogFormProps {
  food_name: string;
  date: Date;
  amount_in_grams : number;
  _id : string;
  callAfterSubmitting: () => void;
}

function EditLogForm({food_name, date, amount_in_grams, _id, callAfterSubmitting} : EditLogFormProps){

  // Mock food data for autocomplete
  const foodList : Record<string, string> = JSON.parse(localStorage.getItem('foods') || '{}');
  const [visible, setVisible] = useState(true)
  const [formData, setFormData] = useState({
    food_name : food_name,
    amount_in_grams : String(amount_in_grams), 
    date : date,
  })

  const [suggestions, setSuggestions] = useState<string[]>([]); // State for filtered suggestions
  const [showSuggestions, setShowSuggestions] = useState(false); // Control the visibility of suggestions
 

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const {name, value} = e.target; // get the name and value of the input field
    setFormData({
      ...formData,
      [name] : value, // this works because the form variables match the names of the input fields
    })

    //for the food name input
    if (name === 'food_name') {
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
    // Update the formData with the selected suggestion
    setFormData({
      ...formData,
      food_name: suggestion,
    });
    setShowSuggestions(false); // Hide suggestions after selection
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault() // prevent automatic submission
    try {
      const response = await fetch('/logs/edit', {
        method: 'POST',
        headers: getHeaderWithToken(),
        body: new URLSearchParams({
          food_id: foodList[formData.food_name],
          amount_in_grams: formData.amount_in_grams,
          date: formatDayForBackend(formData.date),
          log_id: _id
        }),
      })
      // used to refresh log list
      callAfterSubmitting()
    }
    catch (error) {
      console.error('An unexpected error occurred:', error);
    }
  }
  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault() // prevent automatic submission
    try{
      const response = await fetch(`/logs/delete?log_id=${_id}`, {
        method: 'DELETE',
        headers: getHeaderWithToken(),
      });

       // Check if the response was successful
      if (response.ok) {
        console.log("Log deleted successfully");
        setVisible(false)
        // used to refresh log list
        callAfterSubmitting()
        //reset after submitting
        setFormData({ ...formData, food_name: '', amount_in_grams : ''})
        // Refresh logs or perform other actions
      } else {
        console.error("Error deleting log: ", response.status);
      }
    }
    catch (error) {
      console.error('An unexpected error occurred:', error);
    }
  }

  return (
    visible ? (
    <form
      id="login-form" className = {`edit-form-elements-wrapper ${showSuggestions ? 'active' : ''}`} onSubmit={handleSubmit}>
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
      <HoverButton
              type="submit"
              className="new-log-button"
              disabled={!formData.food_name || !formData.amount_in_grams}
              childrenOn={<Ok/>}
              childrenOff={<Arrow/>}>
      </HoverButton> </div> 

      </div>

      <div className = 'delete-log-button-container'>
      <ImageButton
              onClick={handleDelete}
              className="month-arrow"
              children={<Trashcan/>}>
      </ImageButton>  </div>

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
    </form>) :
    <div></div>
  )

}

export  {EditLogForm}