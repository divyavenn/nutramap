import React, { useState, useEffect } from 'react';
import { PageLink } from './Elems';
import { useNavigate } from 'react-router-dom';
import { Button, HoverButton } from './Sections';
import SubmitButton from '../assets/images/login.svg?react'
import SubmitButtonHollow from '../assets/images/login-hollow.svg?react'

function LoginForm() {
  // State to store the email and password
  

  const [formData, setFormData] = useState({
    email : '',
    password : '',
    errorMessage: '',
    isSubmitting: false,
    isSuccess: false
  });
  const navigate = useNavigate(); // React Router's navigation hook

  // Event object is automatically passed to handler
  // e.target: The DOM element that triggered the event (e.g., an input field).
	// e.target.value: The current value of the input field.
	// e.target.name: The name attribute of the input field.
  // e.type:  type of event that was triggered (e.g., 'click', 'change', 'submit', etc.).
  // 
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;  // Destructure name and value from event target
    // Update the corresponding field in formData
    setFormData({
      ...formData,  // Spread the previous state to retain other fields
      [name]: value,    // Dynamically update the field based on the input's name
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent default form submission
    // use object spread
    setFormData({...formData, isSubmitting : true})

    try {
      const response = await fetch('/auth/submit_login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username: formData.email,
          password: formData.password,
        }),
      });
      if (response.ok) {
        setFormData({...formData, isSuccess:true})
        const data = await response.json();
        const token = data.access_token;
    
        // Store the token in localStorage (or sessionStorage if desired)
        localStorage.setItem('access_token', token);

        console.log('Login successful.');
        //redirect to protected route.
        // window.location.href = '/user/dashboard' // this calls page from backend
        navigate('/dashboard'); // this uses react router (client side routing)
      } else {
        // Handle error status codes (e.g., 400, 500, etc.)
        const errorData = await response.json();  // Optionally parse error message from response
        const errorMessage = 'Bad credentials. Try again!'
      

        console.log('Login failed with status', response.status);

        setFormData({
          ...formData,
          errorMessage : errorMessage,  // Set the error message in formData
          isSubmitting: false,
        });
        console.log('Updated formData:', formData); 
      }
    } catch (error) {
        console.error('An unexpected error occurred:', error);

        // Handle unexpected network or parsing errors
        setFormData({
          ...formData,
          errorMessage : 'network error.',  // Set the error message in formData
          isSubmitting: false })
    }
  };

  return (
    <div className="login-form w-form">
      {formData.isSuccess ? (
        <div className="w-form-done">
          <div>welcome!</div>
        </div>
      ) : (
        <div>
        <form id="login-form" name="email-form" onSubmit={handleSubmit} className="login-form">
          <div className="w-layout-vflex">
            <div className="form-field">
              <input
                className="field"
                autoFocus
                maxLength={256}
                name="email"
                placeholder="email"
                type="email"
                id="email"
                value={formData.email}
                onChange={handleInputChange} // automatically passes event object
                required
              />
            </div>
            <div className="form-field">
              <input
                className="field"
                autoFocus
                maxLength={256}
                name="password"
                placeholder="password"
                type="password"
                id="password"
                value={formData.password}
                onChange={handleInputChange}
                required
              /> </div>
          </div>
            <HoverButton
              type="submit"
              className="login-button"
              value={formData.isSubmitting ? 'Please wait...' : 'Login'}
              disabled={formData.isSubmitting}
              childrenOn={<SubmitButton/>}
              childrenOff={<SubmitButtonHollow/>}>
              </HoverButton>
        </form>
        <div>
              {formData.errorMessage && (  
                <div>
                <div className="form-field"> {formData.errorMessage} </div> 
                {/* <PageLink url = {"/create-account"} text = {"sign up"} className = {'form-field'} />  */}
                </div>
              )}
        </div>
        </div>
      )}
    </div>
  );
};


export default LoginForm;

