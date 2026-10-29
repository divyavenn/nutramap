import styled, { keyframes } from 'styled-components';

const savingPulse = keyframes`
  from { opacity: 0.85; }
  to   { opacity: 0.45; }
`;

/**
 * Shows a value that's being saved: it stays on screen (the user just typed it) and dims
 * gently until the save finishes, instead of disappearing and re-typing itself.
 */
export const SavingText = styled.span.attrs({ 'aria-busy': true })`
  animation: ${savingPulse} 700ms ease-in-out infinite alternate;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    opacity: 0.6;
  }
`;
