
import { firstNameAtom } from '../components/account_states'
import '../assets/css/confirm_modal.css'
import {
  useRecoilValue,
} from 'recoil';
import { Confirm } from '../components/Confirm';

function DeleteAccount() {
  const name = useRecoilValue(firstNameAtom)
  let message = `${name}, are you sure? Your information cannot be recovered!`
  return (
    <div className = 'confirm-section'>
      <Confirm message = {message}/>
    </div>)
}

export {DeleteAccount}