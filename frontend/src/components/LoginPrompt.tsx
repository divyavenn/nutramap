import '../assets/css/login_prompt.css'
import { useNavigate } from 'react-router-dom'

interface LoginPromptProps {
  onClose: () => void;
}

function LoginPrompt({ onClose }: LoginPromptProps) {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <div className="login-prompt-overlay" onClick={onClose}>
      <div className="login-prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="login-prompt-text">
          Please log in to save and view your nutritional information across different days
        </div>
        <div className="login-prompt-actions">
          <button className="login-prompt-btn primary" onClick={handleLogin}>
            <div className="login-prompt-btn-text">Log In</div>
          </button>
          <button className="login-prompt-btn secondary" onClick={onClose}>
            <div className="login-prompt-btn-text">Cancel</div>
          </button>
        </div>
      </div>
    </div>
  );
}

export { LoginPrompt };
