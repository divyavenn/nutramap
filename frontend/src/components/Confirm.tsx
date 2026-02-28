import { ConfirmModal, DialogText, OptionsHolder, OptionButton, OptionText } from './ConfirmModal.styled';
import { motion } from 'framer-motion';

function Confirm({message, ifYesDo, ifNoDo} : {message : string, ifYesDo : ()=>void, ifNoDo : ()=>void}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
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
    </motion.div>
  )
}

export {Confirm}
