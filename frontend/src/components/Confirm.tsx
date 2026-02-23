
import '../assets/css/confirm_modal.css'

function Confirm({message, ifYesDo, ifNoDo} : {message : string, ifYesDo : ()=>void, ifNoDo : ()=>void}) {
  return (
    <div className = 'confirm-modal'>
      <div className = 'dialog-text'>
        {message}
      </div>
      <div className = 'options-holder'>
        <button className = 'option left' onClick={ifYesDo}>
          <div className = 'option-text'> yes </div>
        </button>
        <button className = 'option right' onClick={ifNoDo}>
          <div className = 'option-text'> no </div>
        </button>
      </div>
    </div>
  )
}

export {Confirm}
