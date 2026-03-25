import {
  useRecoilState,
  useRecoilValue,
  useSetRecoilState
} from 'recoil';
import { Header, MainSection} from '../components/Sections';
import { StrictMode, useEffect, useState, useRef} from 'react'
import {Heading} from '../components/Title'
import AccountIcon from '../assets/images/account.svg?react'
import DashboardIcon from '../assets/images/dashboard.svg?react'
import FoodBowl from '../assets/images/food_bowl.svg?react'
import RecipesIcon from '../assets/images/recipes.svg?react'
import {request} from '../components/endpoints'
import { accountInfoAtom, firstNameAtom, useRefreshAccountInfo, editingPasswordAtom, useResetAccountAtoms} from '../components/account_states';
import Ok from '../assets/images/check_circle.svg?react'
import OkHover from '../assets/images/checkmark.svg?react'
import { useNavigate } from 'react-router-dom';
import { isLoginExpired, cleanLocalStorage } from '../components/utlis';
import {
  AccountInfoList,
  AccountInfoForm,
  AccountInfoTag,
  AccountInfoInput,
  SubmitInfoUpdateButtonContainer,
  SubmitInfoUpdateButton,
  AccountActionsRow,
  ChangePasswordContainer,
  AccountActionsButton,
} from '../components/Account.styled';

function UpdateInfo({infoType} : {infoType : 'name' | 'email' | 'password'}){
  const [accountInfo, setAccountInfo] = useRecoilState(accountInfoAtom)
  const dialogRef = useRef<HTMLFormElement>(null);
  const setEditingPassword = useSetRecoilState(editingPasswordAtom)
  const refreshAccountInfo = useRefreshAccountInfo()
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);


  const handleClickOutside = (event: MouseEvent) => {
    if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
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
    const { name, value } = e.target;
    setAccountInfo({
      ...accountInfo,
      [name]: value,
    });
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    let response = await request(`/user/update-${infoType}?new_${infoType}=${accountInfo[infoType]}`, 'POST');
    if (response.status == 401) {
      navigate("/login")
    }
    if (response.status !== 304){
      localStorage.setItem('access_token', await response.body);
      refreshAccountInfo()
    }
    if (infoType=='password'){
      setEditingPassword(false)
    }
  }

  const inputType = (infoType === 'email' ? 'email' : 'text');

  return (
    <AccountInfoForm onSubmit={handleSubmit} ref={dialogRef}>
      <AccountInfoInput
        placeholder={infoType}
        name={infoType}
        type={inputType}
        value={accountInfo[infoType] ?? ""}
        onChange={handleInputChange}
        required
      />
      <SubmitInfoUpdateButtonContainer>
        <SubmitInfoUpdateButton
          type="submit"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}>
          {isHovered ? <Ok/> : <OkHover/>}
        </SubmitInfoUpdateButton>
      </SubmitInfoUpdateButtonContainer>
    </AccountInfoForm>
  )
}

function CheckPassword({mustAuthenticate, protectedComponent} : {mustAuthenticate : boolean, protectedComponent : React.ReactNode}){
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(!mustAuthenticate)
  const [isIncorrect, setIsIncorrect] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const response = await request(`/user/check-password?password=${password}`, 'POST')
    if (response.status == 200){
      setAuthenticated(true)
    }
    else {
      setIsIncorrect(true);
      setTimeout(() => setIsIncorrect(false), 300);
    }

  }
  return (
    <div>{
    !authenticated ?
    (<AccountInfoForm $jiggle={isIncorrect} onSubmit={handleSubmit}>
      <AccountInfoTag>current password</AccountInfoTag>
      <AccountInfoInput
        type='password'
        value={password}
        onChange={handleInputChange}
        required
      />
      <SubmitInfoUpdateButtonContainer>
        <SubmitInfoUpdateButton
          type="submit"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}>
          {isHovered ? <Ok/> : <OkHover/>}
        </SubmitInfoUpdateButton>
      </SubmitInfoUpdateButtonContainer>
    </AccountInfoForm>) :
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
    <ChangePasswordContainer type="button">
      <AccountActionsButton onClick={handleLogout}>log out</AccountActionsButton>
    </ChangePasswordContainer>
  )
}

function DeleteAccountButton(){
  const navigate = useNavigate();
  return (
    <ChangePasswordContainer type="button">
      <AccountActionsButton $variant="delete" onClick={() => {navigate('/goodbye')}}>delete account</AccountActionsButton>
    </ChangePasswordContainer>
    )
}

function ChangePasswordButton(){
  const [editingPassword, setEditingPassword] = useRecoilState(editingPasswordAtom)

  return (
    editingPassword ? <CheckPassword mustAuthenticate={true}
                                     protectedComponent={<UpdateInfo infoType='password'/>}/> :
    (
    <ChangePasswordContainer type="button">
      <AccountActionsButton $variant="purple" onClick={() => {setEditingPassword(true)}}>change password</AccountActionsButton>
    </ChangePasswordContainer>
    )
  )
}

function AccountInfo(){
  const editPasswordRef = useRef<HTMLDivElement>(null);
  const setEditingPassword = useSetRecoilState(editingPasswordAtom)

    const handleClickOutside = (event: MouseEvent) => {
      if (editPasswordRef.current && !editPasswordRef.current.contains(event.target as Node)) {
        setEditingPassword(false);
      }
    }

    useEffect(() => {
      if (editPasswordRef.current) {
        document.addEventListener('mousedown', handleClickOutside);
      }
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [editPasswordRef])

  return (
    <MainSection>
      <AccountInfoList>
        <UpdateInfo infoType='name'/>
        <UpdateInfo infoType='email'/>
        <AccountActionsRow>
          <div ref={editPasswordRef}>
            <ChangePasswordButton/>
          </div>
          <LogoutButton/>
          <DeleteAccountButton/>
        </AccountActionsRow>
      </AccountInfoList>
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
  <Header linkIcons = {[{to : "/dashboard", img:  <DashboardIcon/>}, {to : '/account', img : <AccountIcon/>}, {to : '/myfoods', img : <FoodBowl/>}, {to : '/myrecipes', img : <RecipesIcon/>}]}/>
  <Heading words = {'Hello, ' + firstName}/>

  <AccountInfo/>
  </StrictMode>
  )
}


function AccountRoot(){
  return (<Account/>)
}

export default AccountRoot
