import {
  RecoilRoot,
  useRecoilState,
  useRecoilValue
} from 'recoil';
import { Header, MainSection} from '../components/Sections';
import { StrictMode, useEffect, useState} from 'react'
import {Heading} from '../components/Title'
import Dashboard from '../assets/images/dashboard.svg?react'
import {request, doWithData} from '../components/endpoints'
import '../assets/css/account.css'
import { accountInfoAtom, firstNameAtom } from '../components/account_states';
import { HoverButton } from '../components/Sections';
import Ok from '../assets/images/check_circle.svg?react'
import OkHover from '../assets/images/checkmark.svg?react'



function UpdateInfo({infoType} : {infoType : 'name' | 'email'}){
  const [accountInfo, setAccountInfo] = useRecoilState(accountInfoAtom)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;  // Destructure name and value from event target
    // Update the corresponding field in formData
    setAccountInfo({
      ...accountInfo,  // Spread the previous state to retain other fields
      [name]: value,    // Dynamically update the field based on the input's name
    });
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault() // prevent automatic submission
    request(`/user/update-${infoType}?new_${infoType}=${accountInfo[infoType]}`, 'POST');
  }

  const inputType = (infoType === 'email' ? 'email' : 'text');

  return (
    <form className = "account-info" onSubmit={handleSubmit}>
      <div className = "account-info-tag">{infoType}</div>
      <input  className = "account-info-input"
              placeholder = {infoType}
              name = {infoType}
              type = {inputType}
              value = {accountInfo[infoType]}
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

function AccountInfo(){
  const [accountInfo, setAccountInfo] = useRecoilState(accountInfoAtom)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;  // Destructure name and value from event target
    // Update the corresponding field in formData
    setAccountInfo({
      ...accountInfo,  // Spread the previous state to retain other fields
      [name]: value,    // Dynamically update the field based on the input's name
    });
  };

  return (
    <MainSection>
      <div className = "account-info-list">
        <UpdateInfo infoType='name'/>
        <UpdateInfo infoType='email'/>
      </div>
  </MainSection>
  )
}


function Account(){ 

  const [accountInfo, setAccountInfo] = useRecoilState(accountInfoAtom)
  const firstName = useRecoilValue(firstNameAtom)


  useEffect(() => {
      doWithData('/user/info', setAccountInfo)
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
  return (<RecoilRoot>
    <Account/>
  </RecoilRoot>)
}

export default AccountRoot