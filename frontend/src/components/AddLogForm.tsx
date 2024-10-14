import React, { useEffect, useState } from 'react' 
import {getHeaderWithToken, doWithData } from './LoadHtml';
import {HoverButton } from './Sections';
import Arrow from '../assets/images/arrow.svg?react'
import Ok from '../assets/images/checkmark.svg?react'
import '../assets/css/logs.css'
import '../assets/css/buttons.css'

interface KeyValue {
  id : number;
  name : string;
}

interface ComponentCallingFunctionProps {
  callAfterSubmitting: () => void;
}

function NewLogForm({ callAfterSubmitting }: ComponentCallingFunctionProps){

  // Mock food data for autocomplete
  const foodList : Record<string, string> = JSON.parse(localStorage.getItem('foods') || '{}');

  const [formData, setFormData] = useState({
    food_name : '',
    amount_in_grams : '', 
    date : new Date(),
  })

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const {name, value} = e.target; // get the name and value of the input field
    setFormData({
      ...formData,
      [name] : value, // this works because the form variables match the names of the input fields
    })
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault() // prevent automatic submission
    console.log(foodList[formData.food_name] + ',' + formData.amount_in_grams)
    try {
      console.log(foodList[formData.food_name] + ',' + formData.amount_in_grams)
      const response = await fetch('/user/submit_new_log', {
        method: 'POST',
        headers: getHeaderWithToken(),
        body: new URLSearchParams({
          food_id: foodList[formData.food_name],
          amount_in_grams: formData.amount_in_grams,
        }),
      })
      // used to refresh log list
      callAfterSubmitting()
      //reset after submitting
      setFormData({ food_name: '', amount_in_grams: '', date : new Date()})
    }
    catch (error) {
      console.error('An unexpected error occurred:', error);
    }
  }

  return (
    <form
      id="login-form" className = 'log-bubble' onSubmit={handleSubmit}>
      <input
        name='food_name'
        className = 'entry-food-name'
        placeholder='food'
        value = {formData.food_name}
        onChange={handleTyping}
        required
      ></input>
      <input
        name='amount_in_grams'
        className = 'entry-food-amt'
        type = 'number'
        placeholder='0'
        value = {formData.amount_in_grams}
        onChange={handleTyping}
        required
      ></input>
      <HoverButton
              type="submit"
              className="new-log-button"
              disabled={!formData.food_name || !formData.amount_in_grams}
              childrenOn={<Ok/>}
              childrenOff={<Arrow/>}>
      </HoverButton>
    </form>
  )

}

export  {NewLogForm}