
import React, { useEffect, useState } from 'react' 
import {getHeaderWithToken, doWithData } from './LoadHtml';
import {HoverButton } from './Sections';
import Arrow from '../assets/images/arrow.svg?react'
import Ok from '../assets/images/checkmark.svg?react'
import Trashcan from '../assets/images/trashcan.svg?react'
import '../assets/css/new_nutrient.css'
import '../assets/css/buttons.css'
import { getNutrientInfo } from './utlis';
import { tolocalDateString } from '../components/utlis'
import {ImageButton } from './Sections';

interface Nutrient {
  nutrient_name: string;
  requirement: string;
  should_exceed : true
}
interface NewNutrientFormProps {
  callAfterSubmitting: () => void;
  original? : Nutrient;

}

function NewNutrientForm({callAfterSubmitting, original}: NewNutrientFormProps){

  const nutrientList : Record<string, string> = JSON.parse(localStorage.getItem('nutrients') || '{}');

  const [formData, setFormData] = useState({
    nutrient_name : original ? original.nutrient_name : '',
    requirement : original ? original.requirement : '',
    should_exceed : original ? original.should_exceed : true,
  })

  const [suggestions, setSuggestions] = useState<string[]>([]); // State for filtered suggestions
  const [showSuggestions, setShowSuggestions] = useState(false); // Control the visibility of suggestions
  const [isDeleted, setIsDeleted] = useState(false)


  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("called"); // Debugging log

    const {name, value} = e.target; // get the name and value of the input field

    console.log(`Updating ${name} with value: ${value}`); // Debugging log

    setFormData({
      ...formData,
      [name] : value, // this works because the form variables match the names of the input fields
    })

    //for the food name input
    if (name === 'nutrient_name') {
      // Filter the foodList to match the input value
      const filteredNutrients = Object.keys(nutrientList).filter(n =>
        n.toLowerCase().includes(value.toLowerCase())
      );

      // Show suggestions only if there are matches and the input isn't empty
      setSuggestions(filteredNutrients);
      setShowSuggestions(value.length > 0 && filteredNutrients.length > 0);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    // Update the formData with the selected suggestion
    setFormData({
      ...formData,
      nutrient_name: suggestion,
    });
    setShowSuggestions(false); // Hide suggestions after selection
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault() // prevent automatic submission
    try {
      const response = await fetch('/requirements/new', {
        method: 'POST',
        headers: getHeaderWithToken(),
        body: new URLSearchParams({
          nutrient_id: (getNutrientInfo(formData.nutrient_name) as string),
          amt: (formData.requirement as string),
          should_exceed: String(formData.should_exceed)
        }),
      })
      if (response.ok){
        const logData = await response.json(); // Wait for the promise to resolve
        console.log("new nutrient added ", logData);
        // used to refresh log list
        await callAfterSubmitting()
        setFormData({ nutrient_name: '', requirement: '', should_exceed : true})
      }
    }
    catch (error) {
      console.error('An unexpected error occurred:', error);
    }
  }

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault() // prevent automatic submission
    try{
      const response = await fetch(`/requirements/delete?requirement_id=${getNutrientInfo(formData.nutrient_name)}`, {
        method: 'DELETE',
        headers: getHeaderWithToken(),
      });

       // Check if the response was successful
      if (response.ok) {
        console.log("Requirement deleted successfully");
        setIsDeleted(true)
        // used to refresh requirement list
        callAfterSubmitting()
        //reset after submitting
        setFormData({ ...formData, nutrient_name: '', requirement : ''})
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
    <form
      id="new-nutrient-form" className = {`new-nutrient-wrapper ${showSuggestions ? 'active' : ''}`} onSubmit={handleSubmit}>
      <div className={`nutrient-form-bubble ${showSuggestions ? 'active' : ''}`}>
      {true && (
      <div className = 'delete-requirement-button-container'>
        <ImageButton
                type= "button"
                onClick= {handleDelete}
                className= "delete-button"
                children= {<Trashcan/>}>
        </ImageButton>  
      </div>)}
      
      <div className= 'new-nutrient-name-wrapper'>
        <input
          name='nutrient_name'
          className = 'new-requirement-nutrient-name'
          placeholder='nutrient'
          value = {formData.nutrient_name}
          onChange={handleTyping}
          required
        ></input>
      </div>

      <div className="nutrient-type-select-wrapper">
        <select name="comparison" className="custom-select">
          <option value="less">less than</option>
          <option value="more">more than</option>
        </select>
      </div>

      <div className="input-requirement-amt-wrapper">
        <input
          name='requirement'
          className = 'input-requirement-amt'
          type = 'number'
          placeholder='0'
          value = {formData.requirement}
          onChange={handleTyping}
          required
        ></input>
        <span className="nutrient-unit">
          g
        </span>
      </div>

      
      <div className = 'new-nutrient-button-container'>
      {(formData.nutrient_name || formData.requirement) && (
      <HoverButton
              type="submit"
              className="new-nutrient-button"
              childrenOn={<Ok/>}
              childrenOff={<Ok/>}>
      </HoverButton>)}
      </div> 
  

      </div>
      {showSuggestions && (
            <ul className="nutrient-suggestions-list">
              {suggestions.map(suggestion => (
                <li key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="nutrient-suggestion-item">
                  {suggestion}
                </li>
              ))}
            </ul>
          )}
    </form>
    
  )

}

export  {NewNutrientForm}