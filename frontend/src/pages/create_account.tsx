import {
  RecoilRoot,
  useRecoilState,
  useRecoilValue,
} from 'recoil';
import { Header, MainSection} from '../components/Sections';
import { StrictMode} from 'react'
import {Heading} from '../components/Title'
import Dashboard from '../assets/images/dashboard.svg?react'
import {request} from '../components/endpoints'
import '../assets/css/account.css'
import '../assets/css/variables.css'
import { accountInfoAtom, firstNameAtom} from '../components/account_states';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

function AddInfo({infoType} : {infoType : 'name' | 'email' | 'password'}){
  const [accountInfo, setAccountInfo] = useRecoilState(accountInfoAtom)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;  // Destructure name and value from event target
    // Update the corresponding field in formData
    setAccountInfo({
      ...accountInfo,  // Spread the previous state to retain other fields
      [name]: value,    // Dynamically update the field based on the input's name
    });
  }

  const inputType = (infoType === 'email' ? 'email' : 'text');
  
  const placeholder = () => {
    switch (infoType) {
      case 'name':
        return 'Lara Croft'
      case 'email':
        return 'lara@croftholdings.com'
      default:
        return ''
    }
  }


  return (

    <div className = "account-info">
      <div className = "account-info-tag">{infoType}</div>
      <input  className = "account-info-input"
              placeholder = {placeholder()}
              name = {infoType}
              type = {inputType}
              value = {accountInfo[infoType] ?? ""}
              onChange={handleInputChange}
              required/>
    </div>
  )
}



function CreateAccountButton(){
  const navigate = useNavigate();
  const [accountInfo, setAccountInfo] = useRecoilState(accountInfoAtom)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault() // prevent automatic submission
    let response = await request('/user/new', 'POST', accountInfo, 'JSON', false);
    if (response.status == 400) {
      console.log("arsartr")
      toast.error("User already exists", {
        position: "top-right",
        className: "custom-toast"
      });
      navigate("/login")
    }
    else {
      const token = response.body.access_token;
      localStorage.setItem('access_token', token);
      navigate("/dashboard")
    }
  }

  return (
    <form className = "account-info-list" onSubmit = {handleSubmit}>
      <AddInfo infoType='name'/>
      <AddInfo infoType='email'/>
      <AddInfo infoType='password'/>
      <button type = 'submit' className = 'change-password-container'>
        <div className = 'account-actions-button'>let's go!</div>
      </button>
    </form>
    )
}


function Account(){ 
  const firstName = useRecoilValue(firstNameAtom)

  const getWelcomeMessage = () => {
    if (firstName.length > 0){
      return 'Welcome ' + firstName + "!";
    }
    else return 'Welcome!'
  }

  return (
  <StrictMode>
  <Header linkIcons = {[{to : "/dashboard", img:  <Dashboard/>}]}/>
  <Heading words = {getWelcomeMessage()}/>

  <MainSection>
      <CreateAccountButton/>
  </MainSection>
  </StrictMode>
  )
}


function NewAccountRoot(){
  return (
    <Account/>)
}

export default NewAccountRoot