import styled, { css, keyframes, createGlobalStyle } from 'styled-components';
import { HoverButton, ImageButton } from './Sections';

export const GlobalEditStyles = createGlobalStyle`
  @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@300;400;500;700&display=swap');

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
  0%   { opacity: 1;   filter: none;                         transform: scale(1)    translateY(0); }
  20%  { opacity: 0.9; filter: blur(1px);                    transform: scale(1)    translateY(0); }
  40%  { opacity: 0.8; filter: blur(2px) contrast(1.2);      transform: scale(0.98) translateY(0); }
  60%  { opacity: 0.6; filter: blur(3px) contrast(1.4);      transform: scale(0.95) translateY(2px); }
  80%  { opacity: 0.4; filter: blur(4px) contrast(1.6);      transform: scale(0.9)  translateY(4px); }
  90%  { opacity: 0.2; filter: blur(1px) contrast(2);        transform: scale(1.05) translateY(-2px); }
  95%  { opacity: 0.1; filter: blur(0)   brightness(1.5);    transform: scale(1.02) translateY(0); }
  100% { opacity: 0;   filter: blur(0);                      transform: scale(0); }
`;

const confirmAnimation = keyframes`
  0%   { transform: scale(1); }
  20%  { transform: scale(1.2); }
  40%  { transform: scale(0.9); }
  60%  { transform: scale(1.1); }
  80%  { transform: scale(0.95); }
  100% { transform: scale(1); }
`;

export const EditFormContainer = styled.form<{ $submitting?: boolean; $deleting?: boolean }>`
  display: flex;
  margin-bottom: 20px;

  ${p => p.$submitting && css`
    pointer-events: none;
  `}

  ${p => p.$deleting && css`
    animation: ${pixelateOut} 0.4s ease-in forwards;
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
  transition: all 0.1s ease;
`;

export const EditEntryFormBubble = styled.div<{ $active?: boolean }>`
  display: flex;
  width: 100%;
  max-width: calc(var(--modal-width) + 150px);
  margin-bottom: 20px;
  flex-direction: row;
  align-self: center;
  align-items: center;
  font-family: Inconsolata;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  border-radius: 14px;
  background-color: var(--purple);
  color: var(--white);
  justify-content: flex-start;
  transition: all 0.1s ease;
  box-sizing: border-box;

  ${p => p.$active && css`
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  `}

  &:hover {
    background-color: var(--hover-white);
    color: #1e002e;
  }
`;

export const EditInputFoodName = styled.textarea`
  background: none;
  padding: 0;
  font-family: Inconsolata;
  color: inherit;
  outline: none;
  transition: background-color 0.1s ease, color 0.1s ease;
  text-align: left;
  height: auto;
  word-wrap: break-word;
  white-space: normal;
  line-height: 1.2;
  resize: none;
  overflow: hidden;
  box-sizing: border-box;
  display: block;
`;

export const EditInputPortion = styled.input`
  font-family: Inconsolata;
  height: var(--edit-log-input-height);

  &:hover {
    color: #000000;
  }
`;

export const EditGramsDisplay = styled.div`
  font-family: Inconsolata;
  font-size: inherit;
  color: inherit;
  opacity: 0.8;
  padding-left: 10px;
  text-align: left;
`;

export const EditInputDate = styled.input`
  border: none;
  background-color: transparent;
  color: inherit;
  font-family: Inconsolata;
  border-radius: 5px;
  outline: none;
  height: var(--edit-log-input-height);

  &::-webkit-calendar-picker-indicator {
    display: none;
    -webkit-appearance: none;
    appearance: none;
  }

  &:hover {
    color: white;
  }
`;

export const EditInputTimeWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  background: none;
  color: inherit;
  border: none;
  font-family: Inconsolata;
  text-align: right;
  width: 100%;
  height: var(--edit-log-input-height);

  input {
    width: 100%;
    text-align: right;
  }

  &:hover {
    color: #000000;
  }
`;

export const SuggestionsContainer = styled.div`
  position: relative;
  width: 100%;
  z-index: 999;
`;

export const SuggestionsList = styled.ul`
  list-style-type: none;
  padding-left: 0;
  margin: 0;
  width: 100%;
  max-height: 300px;
  overflow-y: auto;
  opacity: 1;
  transition: opacity 0.1s ease, max-height 0.1s ease;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

export const SuggestionItem = styled.li<{ $selected?: boolean }>`
  padding: 10px 40px 10px 27px;
  font-family: Inconsolata;
  color: var(--white);
  cursor: pointer;
  transition: background-color 0.1s ease, color 0.1s ease;

  &:hover {
    background-color: #ffffffa1;
    color: #1e002e;
  }

  ${p => p.$selected && css`
    background-color: #ffffffa1;
    color: #1e002e;
  `}
`;

export const DeleteLogButtonContainer = styled.div<{ $hide?: boolean }>`
  display: flex;
  width: 40px;
  margin-right: 10px;
  margin-top: 20px;
  align-items: start;

  ${p => p.$hide && css`
    opacity: 0;
    transform: scale(0);
    transition: opacity 0.3s ease, transform 0.3s ease;
  `}
`;

export const DeleteLogBtn = styled(ImageButton)`
  display: block;
  clear: none;
  background: transparent;
  border: none;
  font-size: 10px;
  text-align: center;
  cursor: pointer;

  svg {
    fill: #ffffff77;
    height: 20px;
  }

  &:hover svg {
    fill: #ffffff;
  }
`;

export const EditLogSubmitContainer = styled.div`
  display: flex;
  width: 40px;
  justify-content: flex-end;
  padding-top: 8px;
  align-items: start;
  margin-left: 5px;
  margin-top: 20px;
  margin-right: 5px;
  padding-left: 20px;
`;

export const EditLogSubmitBtn = styled(HoverButton)<{ $confirming?: boolean }>`
  background: none;
  margin-left: 10px;
  cursor: pointer;
  order: 1;

  ${p => p.$confirming && css`
    animation: ${confirmAnimation} 1.2s ease-in-out;
  `}

  svg {
    fill: #ffffffa8;
    height: 25px;
  }

  &:hover svg {
    fill: #ffffff;
  }
`;

export const CalendarDropdownWrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-content: center;
  justify-content: center;
  z-index: 20;
`;
