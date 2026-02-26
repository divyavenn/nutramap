
import { firstNameAtom, useResetAccountAtoms } from '../components/account_states'
import { ConfirmSection } from '../components/ConfirmModal.styled'
import {
  useRecoilValue,
} from 'recoil';
import { Confirm } from '../components/Confirm';
import { Header, Background } from '../components/Sections';
import { useNavigate} from 'react-router-dom';
import { request } from '../components/endpoints'; 
import { useState } from 'react';
import { cleanLocalStorage } from '../components/utlis';
import { useEffect } from 'react';
import { isLoginExpired } from '../components/utlis';

function DeleteAccount() {
  const name = useRecoilValue(firstNameAtom)
  const resetAccountAtoms = useResetAccountAtoms()
  const navigate = useNavigate()
  const [deleted, setDeleted] = useState(false)

  useEffect(() => {
    if (isLoginExpired()){
      navigate('/login')
    }
  }, [])

  const handleYes = async () =>{
    await request('user/delete', 'POST')
    cleanLocalStorage()
    resetAccountAtoms()
    setDeleted(true)
    setTimeout(() => {
      navigate("/"); // Navigate back to the homepage
    }, 5000); // 10 seconds (10,000 ms)
  }

  const handleNo = () =>{
    navigate("/account")
  }

  let message = `${name}, are you sure? Your data will be gone forever!`
  return (
    <div>
    <Header/>
    {!deleted ?
    (<ConfirmSection>
        <Confirm message = {message} ifYesDo={handleYes} ifNoDo={handleNo}/>
      </ConfirmSection>)
    :
    (<ConfirmSection className="greeting"> Goodbye! </ConfirmSection>)
    }
    </div>)
}

export {DeleteAccount}