import {
  useRecoilState,
  useRecoilValue,
} from 'recoil';
import { Header, MainSection} from '../components/Sections';
import { StrictMode} from 'react'
import {Heading} from '../components/Title'
import Dashboard from '../assets/images/dashboard.svg?react'
import {request} from '../components/endpoints'
import '../assets/css/variables.css'
import { accountInfoAtom, firstNameAtom} from '../components/account_states';
import { useNavigate } from 'react-router-dom';
import { clearUserCaches } from '../components/utlis';
import { toast } from 'react-toastify';
import {
  AccountInfoList,
  AccountInfoRow,
  AccountInfoTag,
  AccountInfoInput,
  LetsGoButton,
} from '../components/Account.styled';

function AddInfo({infoType} : {infoType : 'name' | 'email' | 'password'}){
  const [accountInfo, setAccountInfo] = useRecoilState(accountInfoAtom)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAccountInfo({
      ...accountInfo,
      [name]: value,
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
    <AccountInfoRow>
      <AccountInfoTag>{infoType}</AccountInfoTag>
      <AccountInfoInput
        placeholder={placeholder()}
        name={infoType}
        type={inputType}
        value={accountInfo[infoType] ?? ""}
        onChange={handleInputChange}
        required
      />
    </AccountInfoRow>
  )
}



function CreateAccountButton(){
  const navigate = useNavigate();
  const [accountInfo, setAccountInfo] = useRecoilState(accountInfoAtom)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { name, email, password } = accountInfo;
    let response = await request('/user/new', 'POST', { name, email, password }, 'JSON', false);
    if (response.status == 400) {
      toast.error("User already exists", {
        position: "top-right",
        className: "custom-toast"
      });
      navigate("/login")
      return
    }
    if (response.status !== 200) {
      toast.error("Could not create account. Check your details and try again.", {
        position: "top-right",
        className: "custom-toast"
      });
      return
    }
    // /user/new returns the created user, not a token — log in to get one.
    const loginResponse = await request(
      '/auth/submit_login',
      'POST',
      { username: email, password },
      'URLencode',
      false
    );
    const token = loginResponse.body?.access_token;
    if (loginResponse.status !== 200 || !token) {
      navigate("/login")
      return
    }
    // Drop cached recipes/custom foods from any previous (e.g. trial) session.
    clearUserCaches();
    localStorage.setItem('access_token', token);
    sessionStorage.removeItem('isTrial');
    setAccountInfo({ ...accountInfo, password: '' });
    navigate("/dashboard")
  }

  return (
    <AccountInfoList as="form" onSubmit={handleSubmit}>
      <AddInfo infoType='name'/>
      <AddInfo infoType='email'/>
      <AddInfo infoType='password'/>
      <LetsGoButton type='submit'>let's go!</LetsGoButton>
    </AccountInfoList>
    )
}


function NewAccount(){
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


export default NewAccount
