
import '../assets/css/confirm_modal.css'
import { firstNameAtom } from './account_states'
import {
  useRecoilValue,
} from 'recoil';

function Confirm({message} : {message : string}) {
  const name = useRecoilValue(firstNameAtom)
  return (
    <div className = 'confirm-modal'>
      <div className = 'dialog-text'>
        {message}
      </div>
      <div className = 'options-holder'>
        <div className = 'option left'>
          <div className = 'option-text'> yes </div>
        </div>
        <div className = 'option right'>
          <div className = 'option-text'> no </div>
        </div>
      </div>
    </div>
  )
}

export {Confirm}