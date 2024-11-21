import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {HoverButton } from './Sections';
import SubmitButton from '../assets/images/login.svg?react'
import SubmitButtonHollow from '../assets/images/login-hollow.svg?react'
import {Link} from 'react-router-dom';
import { useRefreshAccountInfo } from './account_states';
import { request } from './endpoints';
import { accountInfoAtom } from './account_states';
import { useRecoilState } from 'recoil';

function LoginForm() {
  // State to store the email and password
  
  const [accountInfo, setAccountInfo] = useRecoilState(accountInfoAtom)

  const [formData, setFormData] = useState({
    email : accountInfo.email || '',
    password : accountInfo.password || '', 
  })
  const [redirect, setRedirect] = useState({url : '', message : ''})

  const [emailIncorrect, setEmailIncorrect] = useState(false);
  const [passwordIncorrect, setPasswordIncorrect] = useState(false);
  const refreshAccountInfo = useRefreshAccountInfo()

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


  function isEmail() {
    // Define the regular expression for validating email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)){
      setEmailIncorrect(true)
      setTimeout(() => setEmailIncorrect(false), 300);
      setRedirect({url : '', message : 'must be an email!'})
      return false
    }
    return true
  }

  const handleEnter = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (isEmail()){
        const response = await request(`/auth/check_user?user=${formData.email}`, 'GET', null, 'URLencode', false)
        if (response.status == 404){
          setEmailIncorrect(true)
          setAccountInfo({...accountInfo, email: formData.email})
          setTimeout(() => setEmailIncorrect(false), 300);
          setRedirect({url : '/hello', message : 'not registered! create account?'})
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent default form submission

    try {
      if (isEmail()){
        const response = await 
        request('/auth/submit_login', 
                'POST', 
                { username : formData.email, password : formData.password}, 
                'URLencode',
                false)
        if (response.status == 200) {
          const token = response.body.access_token;
          // Store the token in localStorage (or sessionStorage if desired)
          localStorage.setItem('access_token', token);
          console.log('Login successful.');
          refreshAccountInfo();
          // window.location.href = '/user/dashboard' // this calls page from backend
          navigate('/dashboard'); // this uses react router (client side routing)
        } else {
          // raise HTTPException(status_code=404, detail="User not found")
          if (response.status == 404){
            console.log("hi!")
            setEmailIncorrect(true)
            setTimeout(() => setEmailIncorrect(false), 300);
            setRedirect({url : '/hello', message : 'create account'})
          }
          // raise HTTPException(status_code=403, detail="Incorrect password")
          if (response.status == 403){
            setPasswordIncorrect(true)
            setTimeout(() => setPasswordIncorrect(false), 300);
            setRedirect({url : '/oops', message : 'forgot? reset password'})
          }
        }
      }
    } catch (error) {
        console.error('An unexpected error occurred:', error);
    }
  };

  return (
    <div className="login-form w-form">
        <div>
        <form id="login-form" name="email-form" onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="w-layout-vflex">
            <div className="form-field">
              <input
                className={`field ${emailIncorrect ? "jiggle" : ""}`}
                autoFocus
                maxLength={256}
                name="email"
                placeholder="email"
                type="email"
                id="email"
                value={formData.email}
                onChange={handleInputChange} // automatically passes event object
                onKeyDown={handleEnter}
                required
              />
            </div>
            <div className="form-field">
              <input
                className={`field ${passwordIncorrect ? "jiggle" : ""}`}
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
              childrenOn={<SubmitButton/>}
              childrenOff={<SubmitButtonHollow/>}>
              </HoverButton>
        </form>
        <div>
              {redirect && (  
                <div className = 'form-field'>
                <Link style = {{textAlign: 'center'}}to={redirect.url}> {redirect.message}</Link>
                {/* <PageLink url = {"/create-account"} text = {"sign up"} className = {'form-field'} />  */}
                </div>
              )}
        </div>
        </div>
    </div>
  );
};


export default LoginForm;

