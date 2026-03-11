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
    color: oklch(0.214 0.038 295);
    background-color: transparent;
  }

  .entry-form-bubble:hover input::placeholder,
  .entry-form-bubble:hover textarea::placeholder {
    color: oklch(0.214 0.038 295 / 45%) !important;
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
    color: oklch(0.853 0.107 295 / 45%) !important;
    opacity: 1 !important;
  }

  :-ms-input-placeholder {
    color: oklch(0.853 0.107 295 / 45%) !important;
  }

  ::-ms-input-placeholder {
    color: oklch(0.853 0.107 295 / 45%) !important;
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
  padding: 18px 22px;
  border-radius: 14px;
  align-items: center;
  color: var(--white);
  transition: all 0.3s ease;
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  will-change: transform;
  opacity: 1;
  background-color: oklch(0.924 0.063 295 / 7%);
  border: none;
  box-shadow: 0 2px 20px oklch(0 0 0 / 35%), inset 0 1px 0 oklch(0.924 0.063 295 / 5%);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  justify-content: space-between;

  &:hover {
    background-color: var(--hover-white);
    color: oklch(0.214 0.038 295);
    box-shadow: 0 4px 24px oklch(0 0 0 / 30%);
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
  font-size: 16px;
  line-height: 1.5;
  color: inherit;
  background: none;
  padding-top: 4px;
  padding-bottom: 4px;
  padding-left: 4px;
  border: none;
  outline: none;
  transition: background-color 0.3s ease, color 0.3s ease;

  &::placeholder {
    text-align: left;
    color: oklch(0.853 0.107 295 / 45%);
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
  justify-content: center;
  margin-right: 2px;
  order: 1;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background-color: oklch(0.637 0.185 295 / 15%);
  transition: background-color 0.18s ease;
  flex-shrink: 0;

  svg {
    fill: oklch(0.924 0.063 295 / 80%);
    width: 18px;
    height: 18px;
  }

  &:hover {
    background-color: oklch(0.637 0.185 295 / 30%);
  }

  &:hover svg {
    fill: oklch(0.214 0.038 295);
    width: 18px;
    height: 18px;
  }
`;
