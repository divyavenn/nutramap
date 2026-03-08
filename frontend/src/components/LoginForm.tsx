import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoginButton } from './Sections.styled';
import SubmitButton from '../assets/images/login.svg?react'
import SubmitButtonHollow from '../assets/images/login-hollow.svg?react'
import {Link} from 'react-router-dom';
import { request } from './endpoints';
import { accountInfoAtom } from './account_states';
import { clearUserCaches } from './utlis';
import { useRecoilState } from 'recoil';
import { debounce } from 'lodash';
import { useRef } from 'react';

type LoginLocationState = {
  loginError?: string;
};

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
  const [loginHovered, setLoginHovered] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextInputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate(); // React Router's navigation hook
  const location = useLocation();
  const loginErrorMessage = ((location.state as LoginLocationState | null) || {}).loginError || '';


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
      e.preventDefault();
      e.stopPropagation();
      if (isEmail()) {
        debounce(async () => {
          const response = await request(`/auth/check-user?username=${encodeURIComponent(formData.email)}`, 'GET', "", 'URLencode', false);
          if (response.status === 404) {
            setEmailIncorrect(true);
            setAccountInfo({ ...accountInfo, email: formData.email });
            setTimeout(() => setEmailIncorrect(false), 300);
            setRedirect({ url: '/hello', message: 'not registered! create account?' });
          }
          else {
            nextInputRef.current?.focus();
            setRedirect({url : '', message : ''})
          }
        }, 300)();
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent default form submission
    if (isSubmitting) return;

    try {
      if (!isEmail()) return;

      setIsSubmitting(true);

      // Authenticate first so token is available immediately after submit.
      const response = await request(
        '/auth/submit_login',
        'POST',
        { username: formData.email, password: formData.password },
        'URLencode',
        false
      );

      if (response.status !== 200 || !response.body?.access_token) {
        const loginError = response.status === 403
          ? 'Incorrect password. Please try again.'
          : response.status === 404
            ? 'Account not found. Create an account to continue.'
            : 'Login failed. Please try again.';
        navigate('/login', { replace: true, state: { loginError } });
        return;
      }

      if (accountInfo.email && accountInfo.email !== formData.email) {
        clearUserCaches();
      }
      localStorage.setItem('access_token', response.body.access_token);
      sessionStorage.removeItem('isTrial');
      setAccountInfo({ ...accountInfo, email: formData.email, password: '' });
      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('An unexpected error occurred:', error);
      navigate('/login', { replace: true, state: { loginError: 'Login failed. Please try again.' } });
    } finally {
      setIsSubmitting(false);
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
                ref = {nextInputRef}
                className={`field ${passwordIncorrect ? "jiggle" : ""}`}
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
            <LoginButton
              type="submit"
              disabled={isSubmitting}
              style={{ opacity: isSubmitting ? 0.65 : 1 }}
              onMouseEnter={() => setLoginHovered(true)}
              onMouseLeave={() => setLoginHovered(false)}>
              {loginHovered ? <SubmitButton/> : <SubmitButtonHollow/>}
            </LoginButton>
        </form>
        <div>
              {loginErrorMessage && (
                <div className='form-field'>
                  <div style={{ textAlign: 'center', color: '#f7b4d8' }}>{loginErrorMessage}</div>
                </div>
              )}
              {redirect && (
                <div className = 'form-field'>
                <Link style = {{textAlign: 'center'}}to={redirect.url}> {redirect.message}</Link>
                {/* <PageLink url = {"/create-account"} text = {"sign up"} className = {'form-field'} />  */}
                </div>
              )}
              <div className = 'form-field'>
                <Link style = {{textAlign: 'center'}} to="/hello">create account</Link>
              </div>
        </div>
        </div>
    </div>
  );
};


export default LoginForm;
