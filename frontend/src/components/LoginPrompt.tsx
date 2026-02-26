import { useNavigate } from 'react-router-dom'
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
    <LoginPromptOverlay onClick={onClose}>
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
    </LoginPromptOverlay>
  );
}

export { LoginPrompt };
