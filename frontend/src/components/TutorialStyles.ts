import styled, { createGlobalStyle } from 'styled-components';
import { motion } from 'framer-motion';

export const TutorialGlobalStyles = createGlobalStyle`
  .tutorial-typewriter-text {
    color: inherit;
  }

  .tutorial-typewriter-cursor {
    background-color: rgba(168, 85, 247, 0.92) !important;
  }

  body[data-tutorial-active='true'] .recipe-detail-modal::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.82);
    z-index: 100;
    border-radius: 16px;
    pointer-events: none;
  }

  body[data-tutorial-active='true'] .tutorial-unlink-btn {
    position: relative;
    z-index: 101;
  }
`;

export const TutorialDim = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.82);
  pointer-events: none;
  z-index: 2000;
`;

interface TutorialTextProps {
  $centered?: boolean;
}

export const TutorialText = styled(motion.div)<TutorialTextProps>`
  position: fixed;
  max-width: 420px;
  width: 85vw;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 16px;
  ${({ $centered }) => $centered && `
    top: 20%;
    right: 5%;
    left: auto;
    transform: none;
  `}
`;

export const TutorialMessage = styled.div`
  font-family: 'Public Sans';
  font-size: 25px;
  font-weight: lighter;
  line-height: 1.5;
  color: rgba(197, 186, 228, 0.9);
`;

export const TutorialNav = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
`;

export const TutorialMedia = styled.div`
  margin-top: 4px;
`;

export const TutorialMediaAsset = styled.img`
  width: 100%;
  max-height: 220px;
  object-fit: contain;
  border-radius: 8px;
  background: rgba(15, 15, 30, 0.6);
`;

// keep className="tutorial-email-form" so the keydown handler can querySelector it
export const TutorialEmailForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const TutorialEmailInput = styled.input`
  width: 100%;
  border: none;
  border-radius: 8px;
  background: #ab52ff;
  color: #2b1658;
  font-family: 'Inconsolata', monospace;
  font-size: 16px;
  padding: 10px 12px;
  box-sizing: border-box;

  &::placeholder {
    color: rgba(43, 22, 88, 0.62);
  }

  &:focus {
    outline: none;
    box-shadow: none;
  }
`;

interface TutorialEmailFeedbackProps {
  $error?: boolean;
}

export const TutorialEmailFeedback = styled.div<TutorialEmailFeedbackProps>`
  font-family: 'Ubuntu', sans-serif;
  font-size: 12px;
  color: ${({ $error }) => $error ? 'rgba(255, 133, 133, 0.95)' : 'rgba(255, 255, 255, 0.7)'};
`;

export const TutorialPrevBtn = styled.button`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-family: 'Ubuntu', sans-serif;
  font-size: 13px;
  cursor: pointer;
  padding: 6px 12px;
  transition: color 0.2s ease;

  &:hover {
    color: rgba(255, 255, 255, 0.7);
  }

  &:disabled {
    color: rgba(255, 255, 255, 0.15);
    cursor: default;
  }
`;

export const TutorialNextBtn = styled.button`
  background: none;
  border: none;
  color: rgba(168, 85, 247, 0.9);
  font-family: 'Ubuntu', sans-serif;
  font-size: 13px;
  cursor: pointer;
  padding: 6px 12px;
  transition: color 0.2s ease;

  &:hover {
    color: rgba(192, 132, 252, 1);
  }

  &:disabled {
    color: rgba(168, 85, 247, 0.35);
    cursor: default;
  }
`;
