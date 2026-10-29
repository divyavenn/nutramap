import styled, { css, keyframes, createGlobalStyle } from 'styled-components';
import { HoverButton, ImageButton } from './Sections';

export const GlobalEditStyles = createGlobalStyle`

  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    appearance: none;
    margin: 0;
  }

  input[type="number"] {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  input[type="time"]::-webkit-calendar-picker-indicator,
  input[type="datetime-local"]::-webkit-calendar-picker-indicator {
    display: none;
    -webkit-appearance: none;
    appearance: none;
  }

  input[type="time"],
  input[type="datetime-local"] {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  input, textarea {
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    color: var(--white);
    background-color: transparent;
    border: none;
    outline: none;
    transition: color 0.1s ease, background-color 0.1s ease;
  }
`;

const pixelateOut = keyframes`
  from { opacity: 1; filter: blur(0);   transform: scale(1); }
  to   { opacity: 0; filter: blur(2px); transform: scale(0.97); }
`;

const confirmAnimation = keyframes`
  0%   { transform: scale(1); }
  40%  { transform: scale(0.92); }
  100% { transform: scale(1); }
`;

export const EditFormContainer = styled.form<{ $submitting?: boolean; $deleting?: boolean }>`
  display: flex;
  margin-bottom: 20px;

  ${p => p.$submitting && css`
    pointer-events: none;
  `}

  ${p => p.$deleting && css`
    animation: ${pixelateOut} 180ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
    pointer-events: none;
  `}
`;

export const FormDropdownWrapper = styled.div`
  display: flex;
  background-color: var(--log-bubble-color);
  color: var(--white);
  flex-direction: column;
  border-radius: 14px;
  width: 100%;
  max-width: calc(var(--modal-width) + 150px);
  transition: background-color 100ms ease;
`;

export const EditEntryFormBubble = styled.div<{ $active?: boolean }>`
  display: flex;
  width: 100%;
  max-width: calc(var(--modal-width) + 150px);
  margin-bottom: 20px;
  flex-direction: row;
  align-self: center;
  align-items: center;
  font-family: var(--font-mono);
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  border-radius: 14px;
  background-color: var(--purple);
  color: var(--white);
  justify-content: flex-start;
  transition: background-color 100ms ease, color 100ms ease;
  box-sizing: border-box;

  ${p => p.$active && css`
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  `}

  /* Inputs inside drop their outline; the bubble shows focus instead */
  &:focus-within {
    box-shadow: 0 0 0 2px var(--accent-purple);
  }

  /* Don't invert colors under the cursor while someone is typing in it */
  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:focus-within) {
      background-color: var(--hover-white);
      color: var(--color-text-inverse);
    }
  }
`;

export const EditInputFoodName = styled.textarea`
  background: none;
  padding: 0;
  font-family: var(--font-mono);
  color: inherit;
  outline: none;
  transition: background-color 0.1s ease, color 0.1s ease;
  text-align: start;
  height: auto;
  word-wrap: break-word;
  white-space: normal;
  line-height: 1.4;
  resize: none;
  overflow: hidden;
  box-sizing: border-box;
  display: block;
`;

export const EditInputPortion = styled.input`
  font-family: var(--font-mono);
  height: var(--edit-log-input-height);

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--color-text-inverse);
    }
  }
`;

export const EditGramsDisplay = styled.div`
  font-family: var(--font-mono);
  font-size: inherit;
  color: inherit;
  opacity: 0.8;
  padding-inline-start: 10px;
  text-align: start;
`;

export const EditInputDate = styled.input`
  border: none;
  background-color: transparent;
  color: inherit;
  font-family: var(--font-mono);
  border-radius: 5px;
  outline: none;
  height: var(--edit-log-input-height);

  &::-webkit-calendar-picker-indicator {
    display: none;
    -webkit-appearance: none;
    appearance: none;
  }
`;

export const EditInputTimeWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  background: none;
  color: inherit;
  border: none;
  font-family: var(--font-mono);
  text-align: end;
  width: 100%;
  height: var(--edit-log-input-height);

  input {
    width: 100%;
    text-align: end;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--color-text-inverse);
    }
  }
`;

export const SuggestionsContainer = styled.div`
  position: relative;
  width: 100%;
  z-index: 999;
`;

export const SuggestionsList = styled.ul`
  list-style-type: none;
  padding-inline-start: 0;
  margin: 0;
  width: 100%;
  max-height: 300px;
  overflow-y: auto;
  opacity: 1;
  transition: opacity 0.1s ease, max-height 0.1s ease;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  overscroll-behavior: contain;
`;

export const SuggestionItem = styled.li<{ $selected?: boolean }>`
  padding: 10px 40px 10px 27px;
  font-family: var(--font-mono);
  color: var(--white);
  cursor: pointer;
  transition: background-color 0.1s ease, color 0.1s ease;

  /* Square hover fill would paint past the dropdown's rounded bottom corners */
  &:last-child {
    border-radius: 0 0 14px 14px;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--hover-white);
      color: var(--color-text-inverse);
    }
  }

  ${p => p.$selected && css`
    background-color: var(--hover-white);
    color: var(--color-text-inverse);
  `}
`;

export const DeleteLogButtonContainer = styled.div<{ $hide?: boolean }>`
  display: flex;
  width: 40px;
  margin-inline-end: 10px;
  margin-top: 20px;
  align-items: start;

  ${p => p.$hide && css`
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 150ms ease-out, transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
  `}
`;

export const DeleteLogBtn = styled(ImageButton)`
  display: block;
  clear: none;
  background: transparent;
  border: none;
  font-size: 0.625rem;
  text-align: center;
  cursor: pointer;

  svg {
    fill: #ffffff77;
    height: 20px;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover svg {
      fill: #ffffff;
    }
  }
`;

export const EditLogSubmitContainer = styled.div`
  display: flex;
  width: 40px;
  justify-content: flex-end;
  padding-top: 8px;
  align-items: start;
  margin-inline-start: 5px;
  margin-top: 20px;
  margin-inline-end: 5px;
  padding-inline-start: 20px;
`;

export const EditLogSubmitBtn = styled(HoverButton)<{ $confirming?: boolean }>`
  background: none;
  margin-inline-start: 10px;
  cursor: pointer;
  order: 1;

  ${p => p.$confirming && css`
    animation: ${confirmAnimation} 250ms cubic-bezier(0.23, 1, 0.32, 1);
  `}

  svg {
    fill: #ffffffa8;
    height: 25px;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover svg {
      fill: #ffffff;
    }
  }
`;

export const CalendarDropdownWrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-content: center;
  justify-content: center;
  z-index: 20;
`;
