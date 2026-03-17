import styled, { createGlobalStyle } from 'styled-components';
import { motion } from 'framer-motion';

export const LockedNextWrapper = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
`;

export const NextLockedOverlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  background: oklch(0 0 0 / 35%);
  pointer-events: none;
`;

export const NextLockedCard = styled(motion.div)`
  width: min(360px, 82vw);
  padding: 36px 40px;
  border-radius: 20px;
  background: oklch(0.82 0.06 295 / 75%);
  color: oklch(0.22 0.044 295);
  font-family: 'Public Sans', 'Ubuntu', system-ui, sans-serif;
  font-size: 18px;
  font-weight: 300;
  line-height: 1.65;
  text-align: center;
  box-shadow: 0 24px 64px oklch(0 0 0 / 50%);

  strong {
    color: oklch(0.35 0.12 295);
    font-weight: 600;
  }
`;

export const TutorialGlobalStyles = createGlobalStyle`
  .tutorial-typewriter-text {
    color: inherit;
  }

  .tutorial-typewriter-cursor {
    background-color: rgba(168, 85, 247, 0.92) !important;
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
  $hasMedia?: boolean;
}

export const TutorialText = styled(motion.div)<TutorialTextProps>`
  position: fixed;
  max-width: 420px;
  width: 85vw;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px;
  border-radius: 14px;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  ${({ $centered }) => $centered && `
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  `}
  ${({ $centered, $hasMedia }) => $centered && $hasMedia && `
    width: 92vw;
    max-width: 1200px;
  `}
`;

export const TutorialMessage = styled.div`
  font-family: 'Public Sans', 'Ubuntu', system-ui, sans-serif;
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

export const TutorialMedia = styled(motion.div)`
  margin-top: 4px;
`;

export const TutorialMediaAsset = styled.img`
  width: 100%;
  max-height: 78vh;
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
    color: rgba(168, 85, 247, 0.45);
    cursor: default;
  }
`;

export const TutorialSkipBtn = styled.button`
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  background: none;
  border: none;
  color: rgba(168, 85, 247, 0.9);
  font-family: 'Ubuntu', sans-serif;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: color 0.2s ease, opacity 0.2s ease;

  &:hover {
    color: rgba(216, 180, 254, 1);
  }
`;
