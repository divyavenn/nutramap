
import React, {useState } from 'react' 
import {request } from './endpoints';
import '../assets/css/new_nutrient.css'
import '../assets/css/buttons.css'
import { Nutrient } from './structures';
import { getNutrientInfo } from './utlis';
import { useRefreshRequirements } from './dashboard_states';
import { HoverButton} from './Sections';
import { ImageButton } from './Sections';
import Trashcan from '../assets/images/trashcan.svg?react'
import Ok from '../assets/images/check_circle.svg?react'
import OkOk from '../assets/images/checkmark.svg?react'

function NewNutrientForm({ original }: { original?: Nutrient }): React.ReactNode{

  const nutrientList : Record<string, string> = JSON.parse(localStorage.getItem('nutrients') || '{}');

  const [formData, setFormData] = useState({
    nutrient_name : original ? original.name : '',
    requirement : original ? String(original.target) : '',
    should_exceed : original ? original.shouldExceed : true,
  })

  const [suggestions, setSuggestions] = useState<string[]>([]); // State for filtered suggestions
  const [showSuggestions, setShowSuggestions] = useState(false); // Control the visibility of suggestions
  const [validInput, markValidInput] = useState(true)
  const [isDeleted, setIsDeleted] = useState(false)
  const refreshRequirements = useRefreshRequirements()


  // Handler for the comparison select element
  const handleComparisonChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setFormData((prevFormData) => ({
      ...prevFormData,
      should_exceed: value === 'more'
    }));
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {

    const {name, value} = e.target; // get the name and value of the input field

    console.log(`Updating ${name} with value: ${value}`); // Debugging log

    setFormData({
      ...formData,
      [name] : value, // this works because the form variables match the names of the input fields
    })

    //for the food name input
    if (name === 'nutrient_name') { 
      markValidInput(value in nutrientList)
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
    markValidInput(true)
    // Update the formData with the selected suggestion
    setFormData({
      ...formData,
      nutrient_name: suggestion,
    });
    setShowSuggestions(false); // Hide suggestions after selection
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    console.log("submitting")
    e.preventDefault() // prevent automatic submission
    let requestData = {
      nutrient_id: parseInt(getNutrientInfo(formData.nutrient_name) as string, 10),
      amt: parseFloat(formData.requirement),
      should_exceed: Boolean(formData.should_exceed)
    }
    let response = await request('/requirements/new','POST', requestData, 'JSON')
    refreshRequirements();

      // Reset the form state immediately to avoid showing incorrect data
    if (!original) setFormData({ nutrient_name: '', requirement: '', should_exceed: true });
    else setFormData({ nutrient_name: original.name, requirement: String(original.target), should_exceed: original.shouldExceed});
    }


  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault() // prevent automatic submission
    await request(`/requirements/delete?requirement_id=${getNutrientInfo(formData.nutrient_name)}`, 'DELETE');
    console.log("Requirement deleted successfully");
    setIsDeleted(true)
    refreshRequirements()
    setFormData({ ...formData, nutrient_name: '', requirement : ''})
  }

  return (
    !isDeleted && (
    <form
      id="new-nutrient-form" className = {`new-nutrient-wrapper ${showSuggestions ? 'active' : ''}`} onSubmit={handleSubmit}>
      <div className={`nutrient-form-bubble ${showSuggestions ? 'active' : ''}`}>
      <div className = 'delete-requirement-button-container'>
      {original && (
        <ImageButton
                type= "button"
                onClick= {handleDelete}
                className= "delete-button"
                children= {<Trashcan/>}>
        </ImageButton> )}
      </div>
      
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
        <select name="comparison" className="custom-select" onChange={handleComparisonChange}
        value={formData.should_exceed ? 'more' : 'less'}>
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
          {formData.nutrient_name && validInput && getNutrientInfo(formData.nutrient_name, true)}
        </span>
      </div>

      
      <div className = 'new-nutrient-button-container'>
      {(formData.nutrient_name && formData.requirement && validInput) && (
      <HoverButton
              type="submit"
              className="new-nutrient-button"
              childrenOn={<Ok/>}
              childrenOff={<OkOk/>}>
      </HoverButton>)}
      </div> 
  

      </div>
      {showSuggestions && (
            <ul className="nutrient-suggestions-list">
              {suggestions.map(suggestion => (
                <li key={suggestion}
                    className="nutrient-suggestion-item"
                    onClick={() => handleSuggestionClick(suggestion)}>
                  {suggestion}
                </li>
              ))}
            </ul>
          )}
    </form>))
}

export  {NewNutrientForm}