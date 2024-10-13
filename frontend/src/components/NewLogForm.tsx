import React, { useEffect, useState } from 'react' 
import { doWithData } from './LoadHtml';

interface KeyValue {
  id : number;
  name : string;
}
function newLogForm(){

  // Mock food data for autocomplete
  const foodList : Record<string, string> = {'Apple' : '1', 'Banana' : '2', 'Carrot' : '3'}

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
    try {
      const response = await fetch('/user/submit_new_log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          food_id: foodList[formData.food_name],
          amount_in_grams: formData.amount_in_grams,
          
        }),
      })
    }
  }

}