import styled, { createGlobalStyle, css, keyframes } from 'styled-components';
import { SvgButton } from './Sections.styled';

export const LogNewGlobalStyles = createGlobalStyle`
  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  input[type="number"] {
    -moz-appearance: textfield;
  }

  .entry-form-bubble:hover input,
  .entry-form-bubble:hover textarea {
    color: #1e002e;
    background-color: transparent;
  }

  .entry-form-bubble:hover input::placeholder,
  .entry-form-bubble:hover textarea::placeholder {
    color: rgba(30, 0, 46, 0.45) !important;
  }

  input, textarea {
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    color: var(--white);
    background-color: transparent;
    border: none;
    outline: none;
    transition: color 0.3s ease, background-color 0.3s ease;
  }

  ::placeholder {
    color: #a6a5a5 !important;
    opacity: 0.9 !important;
  }

  :-ms-input-placeholder {
    color: #a6a5a5 !important;
    opacity: 0.9 !important;
  }

  ::-ms-input-placeholder {
    color: #a6a5a5 !important;
    opacity: 0.9 !important;
  }

  @keyframes jiggle {
    0% { transform: translateX(0); opacity: 1; }
    25% { transform: translateX(-1px); opacity: 0.75; }
    50% { transform: translateX(3px); opacity: 0.5; }
    75% { transform: translateX(-1px); opacity: 0.25; }
    100% { transform: translateX(0); opacity: 0; }
  }

  @keyframes fadeOut {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }

  .jiggle-text {
    animation: jiggle .3s ease 3.33, fadeOut 1s ease forwards;
    will-change: opacity, transform;
  }
`;

// .form-elements-wrapper — keep className="form-elements-wrapper" for tutorial selector
export const FormElementsWrapper = styled.form`
  width: var(--modal-width);
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  position: relative;
`;

// .entry-form-bubble — keep className="entry-form-bubble" for nested hover selectors
export const EntryFormBubble = styled.div`
  display: flex;
  padding: 15px;
  border-radius: 14px;
  align-items: center;
  color: var(--white);
  transition: all 0.3s ease;
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  will-change: transform;
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.1);
  justify-content: space-between;

  &:hover {
    background-color: var(--hover-white);
    color: #1e002e;
  }
`;

const jiggleAnim = keyframes`
  0% { transform: translateX(0); opacity: 1; }
  25% { transform: translateX(-1px); opacity: 0.75; }
  50% { transform: translateX(3px); opacity: 0.5; }
  75% { transform: translateX(-1px); opacity: 0.25; }
  100% { transform: translateX(0); opacity: 0; }
`;

const fadeOut = keyframes`
  0% { opacity: 1; }
  100% { opacity: 0; }
`;

interface NewLogInputJournalProps {
  $jiggling?: boolean;
}

export const NewLogInputJournal = styled.textarea<NewLogInputJournalProps>`
  width: calc(100% - 60px);
  resize: none;
  font-family: Inconsolata;
  color: inherit;
  background: none;
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 10px;
  border: none;
  outline: none;
  transition: background-color 0.3s ease, color 0.3s ease;

  &::placeholder {
    text-align: left;
    color: rgba(255, 255, 255, 0.642);
  }

  ${({ $jiggling }) =>
    $jiggling &&
    css`
      animation: ${jiggleAnim} 0.3s ease 3.33, ${fadeOut} 1s ease forwards;
      will-change: opacity, transform;
    `}
`;

// Styled submit button for the log form — overrides SvgButton sizing/colors
export const NewLogButton = styled(SvgButton)`
  align-items: center;
  margin-right: 5px;
  order: 1;

  svg {
    fill: #ffffffa8;
    width: 15px;
    height: 15px;
  }

  &:hover svg {
    fill: #1e002e;
    width: 15px;
    height: 15px;
  }
`;
