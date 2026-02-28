import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion';
import {
  LoginPromptOverlay,
  LoginPromptModal,
  LoginPromptText,
  LoginPromptActions,
  LoginPromptBtn,
  LoginPromptBtnText,
} from './LoginPrompt.styled';

interface LoginPromptProps {
  onClose: () => void;
}

function LoginPrompt({ onClose }: LoginPromptProps) {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
    >
      <LoginPromptOverlay onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <LoginPromptModal onClick={(e) => e.stopPropagation()}>
            <LoginPromptText>
              Please log in to save and view your nutritional information across different days
            </LoginPromptText>
            <LoginPromptActions>
              <LoginPromptBtn $variant="primary" onClick={handleLogin}>
                <LoginPromptBtnText>Log In</LoginPromptBtnText>
              </LoginPromptBtn>
              <LoginPromptBtn $variant="secondary" onClick={onClose}>
                <LoginPromptBtnText>Cancel</LoginPromptBtnText>
              </LoginPromptBtn>
            </LoginPromptActions>
          </LoginPromptModal>
        </motion.div>
      </LoginPromptOverlay>
    </motion.div>
  );
}

export { LoginPrompt };
