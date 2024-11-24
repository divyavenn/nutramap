import {
  RecoilRoot,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState
} from 'recoil';
import { Header, MainSection} from '../components/Sections';
import { StrictMode, useEffect, useState, useRef} from 'react'
import {Heading} from '../components/Title'
import Dashboard from '../assets/images/dashboard.svg?react'
import {request} from '../components/endpoints'
import '../assets/css/account.css'
import { accountInfoAtom, firstNameAtom, useRefreshAccountInfo, editingPasswordAtom, useResetAccountAtoms} from '../components/account_states';
import { HoverButton } from '../components/Sections';
import Ok from '../assets/images/check_circle.svg?react'
import OkHover from '../assets/images/checkmark.svg?react'
import { useNavigate } from 'react-router-dom';
import { isLoginExpired, cleanLocalStorage } from '../components/utlis';

function UpdateInfo({infoType} : {infoType : 'name' | 'email' | 'password'}){
  const [accountInfo, setAccountInfo] = useRecoilState(accountInfoAtom)
  const dialogRef = useRef<HTMLFormElement>(null); 
  const setEditingPassword = useSetRecoilState(editingPasswordAtom)
  const refreshAccountInfo = useRefreshAccountInfo()
  const navigate = useNavigate(); 
  

  const handleClickOutside = (event: MouseEvent) => {
    if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
      console.log("Refreshing Account Info")
      refreshAccountInfo()
    }
  }

  useEffect(() => {
    if (isLoginExpired()){
      navigate('/login')
    }
    if (dialogRef.current) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    }}, [dialogRef]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;  // Destructure name and value from event target
    // Update the corresponding field in formData
    setAccountInfo({
      ...accountInfo,  // Spread the previous state to retain other fields
      [name]: value,    // Dynamically update the field based on the input's name
    });
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault() // prevent automatic submission
    console.log(infoType)
    console.log(accountInfo)
    let response = await request(`/user/update-${infoType}?new_${infoType}=${accountInfo[infoType]}`, 'POST');
    if (response.status == 401) {
      console.log("Logged out")
      navigate("/login")
    }
    if (response.status !== 304){
      localStorage.setItem('access_token', await response.body);
      console.log("token refreshed")
      refreshAccountInfo()
    }
    if (infoType=='password'){
      setEditingPassword(false)
    }
  }

  const inputType = (infoType === 'email' ? 'email' : 'text');

  return (

    <form className = "account-info" onSubmit={handleSubmit} ref = {dialogRef}>
      <div className = "account-info-tag">{infoType}</div>
      <input  className = "account-info-input"
              placeholder = {infoType}
              name = {infoType}
              type = {inputType}
              value = {accountInfo[infoType] ?? ""}
              onChange={handleInputChange}
              required/>
      <div className = 'submit-info-update-button-container'>
        <HoverButton
                type="submit"
                className="submit-info-update-button "
                childrenOn={<Ok/>}
                childrenOff={<OkHover/>}/>
        </div>
    </form>
  )
}

function CheckPassword({mustAuthenticate, protectedComponent} : {mustAuthenticate : boolean, protectedComponent : React.ReactNode}){
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(!mustAuthenticate)
  const [isIncorrect, setIsIncorrect] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;  // Destructure name and value from event target
    // Update the corresponding field in formData
    setPassword(value);
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault() // prevent automatic submission
    const response = await request(`/user/check-password?password=${password}`, 'POST')
    console.log(response.status)
    if (response.status == 200){
      console.log("arstarst")
      setAuthenticated(true)
    }
    else {
      setIsIncorrect(true);
      setTimeout(() => setIsIncorrect(false), 300); // Match animation duration
    }
    
  }
  return (
    <div>{
    !authenticated ? 
    (<form className = {`account-info ${isIncorrect ? "jiggle" : ""}`} onSubmit={handleSubmit}>
      <div className = "account-info-tag">current password</div>
      <input  className = "account-info-input"
              type = 'password'
              value = {password}
              onChange={handleInputChange}
              required/>
      <div className = 'submit-info-update-button-container'>
        <HoverButton
                type="submit"
                className="submit-info-update-button "
                childrenOn={<Ok/>}
                childrenOff={<OkHover/>}/>
        </div>
    </form>) :
    protectedComponent
    }</div>
  )
}



function LogoutButton(){
  const navigate = useNavigate(); 
  const resetAccountAtoms = useResetAccountAtoms()
  const handleLogout = () =>{
    cleanLocalStorage();
    resetAccountAtoms();
    navigate('/')
  }

  return(
    <button className = 'change-password-container'>
      <div className = 'account-actions-button' onClick = {handleLogout} >log out</div>
    </button>
  )
}

function DeleteAccountButton(){
  const navigate = useNavigate();
  return (
    <button className = 'change-password-container'>
      <div className = 'account-actions-button delete' onClick = {() => {navigate('/goodbye')}}>delete account</div>
    </button>
    )
}

function ChangePasswordButton(){
  const [editingPassword, setEditingPassword] = useRecoilState(editingPasswordAtom)

  return (
    editingPassword ? <CheckPassword mustAuthenticate = {true}
                                     protectedComponent = {<UpdateInfo infoType='password'/>}/> :
    (
    <button className = 'change-password-container'>
      <div className = 'account-actions-button' onClick = {() => {setEditingPassword(true)}}>change password</div>
    </button>
    )
  )
}

function AccountInfo(){
  const editPasswordRef = useRef<HTMLDivElement>(null); 
  const setEditingPassword = useSetRecoilState(editingPasswordAtom)

    // Function to close form if clicked outside
    const handleClickOutside = (event: MouseEvent) => {
      // notes: 
      // .current is a proprety of a ref object that directly references an instance of a component in the DOM. 
      // before the component mounts, it's called null
      // event.target refers to the element that triggered the even
      // even.currentTarget refers to the elment that the event listener was attached to (in this case the whole document)

      // if the component is mounted and the thing you clicked is not the component or a child of the the component
      if (editPasswordRef.current && !editPasswordRef.current.contains(event.target as Node)) {
        setEditingPassword(false); // Close the form only if clicking outside
      }
    }

    useEffect(() => {
      // start looking for clicks outside if new requirement form is visible
      // only attach the listener if the component is moutned
      if (editPasswordRef.current) {
        document.addEventListener('mousedown', handleClickOutside);
      }
      return () => {
        document.removeEventListener('mousedown', handleClickOutside); // Cleanup
      };  
    }, [editPasswordRef])  

  return (
    <MainSection>
      <div className = "account-info-list">
        <UpdateInfo infoType='name'/>
        <UpdateInfo infoType='email'/>
        <div className = 'password-container' ref = {editPasswordRef}>
        <ChangePasswordButton/>
        </div>
        <LogoutButton/>
        <DeleteAccountButton/>
      </div>
  </MainSection>
  )
}


function Account(){ 
  const navigate = useNavigate(); 
  const refreshAccountInfo = useRefreshAccountInfo()
  const firstName = useRecoilValue(firstNameAtom)


  useEffect(() => {
      if (isLoginExpired()){
        navigate('/login')
      }
      refreshAccountInfo()
  },[])

  return (
  <StrictMode>
  <Header linkIcons = {[{to : "/dashboard", img:  <Dashboard/>}]}/>
  <Heading words = {'Hello, ' + firstName}/>

  <AccountInfo/>
  </StrictMode>
  )
}


function AccountRoot(){
  return (<Account/>)
}

export default AccountRoot