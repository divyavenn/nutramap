import { ConfirmModal, DialogText, OptionsHolder, OptionButton, OptionText } from './ConfirmModal.styled';

function Confirm({message, ifYesDo, ifNoDo} : {message : string, ifYesDo : ()=>void, ifNoDo : ()=>void}) {
  return (
    <ConfirmModal className="confirm-modal">
      <DialogText>
        {message}
      </DialogText>
      <OptionsHolder>
        <OptionButton $side="left" onClick={ifYesDo}>
          <OptionText> yes </OptionText>
        </OptionButton>
        <OptionButton $side="right" onClick={ifNoDo}>
          <OptionText> no </OptionText>
        </OptionButton>
      </OptionsHolder>
    </ConfirmModal>
  )
}

export {Confirm}
