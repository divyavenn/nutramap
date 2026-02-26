import styled from 'styled-components';

export const LoginPromptOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

export const LoginPromptModal = styled.div`
  display: flex;
  width: 500px;
  min-height: 250px;
  flex-direction: column;
  border-radius: 30px;
  background-color: hsla(254, 100%, 12%, 0.95);
  font-family: Inconsolata;
  color: bisque;
  font-size: 20px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
`;

export const LoginPromptText = styled.div`
  display: flex;
  padding: 40px;
  justify-content: center;
  align-items: center;
  flex-grow: 1;
  font-size: 22px;
  text-align: center;
  line-height: 1.5;
`;

export const LoginPromptActions = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border-bottom-left-radius: 30px;
  border-bottom-right-radius: 30px;
  background-color: hsla(0, 0%, 0%, 0.413);
`;

interface LoginPromptBtnProps {
  $variant: 'primary' | 'secondary';
}

export const LoginPromptBtn = styled.button<LoginPromptBtnProps>`
  flex-grow: 1;
  height: 70px;
  background: transparent;
  color: bisque;
  border: none;
  cursor: pointer;
  transition: background 0.2s ease;
  border-bottom-left-radius: ${({ $variant }) => $variant === 'primary' ? '30px' : '0'};
  border-bottom-right-radius: ${({ $variant }) => $variant === 'secondary' ? '30px' : '0'};

  &:hover {
    background: black;
  }
`;

export const LoginPromptBtnText = styled.div`
  font-size: 22px;
  text-align: center;
  font-family: Inconsolata;
`;
