import styled, { keyframes, css } from 'styled-components';

// Animations
const pixelateOut = keyframes`
  0% {
    opacity: 1;
    filter: none;
    transform: scale(1) translateY(0);
  }
  20% {
    opacity: 0.9;
    filter: blur(1px);
    transform: scale(1) translateY(0);
  }
  40% {
    opacity: 0.8;
    filter: blur(2px) contrast(1.2);
    transform: scale(0.98) translateY(0);
  }
  60% {
    opacity: 0.6;
    filter: blur(3px) contrast(1.4);
    transform: scale(0.95) translateY(2px);
  }
  80% {
    opacity: 0.4;
    filter: blur(4px) contrast(1.6);
    transform: scale(0.9) translateY(4px);
  }
  100% {
    opacity: 0;
    filter: blur(6px) contrast(2);
    transform: scale(0.8) translateY(8px);
  }
`;

interface FormContainerProps {
  $submitting?: boolean;
  $deleting?: boolean;
}

export const FormContainer = styled.form<FormContainerProps>`
  display: flex;
  margin-bottom: 20px;
  justify-content: start;
  align-items: flex-start;

  ${props => props.$submitting && css`
    pointer-events: none;
  `}

  ${props => props.$deleting && css`
    animation: ${pixelateOut} 0.4s ease-in forwards;
    pointer-events: none;
  `}
`;

interface DeleteButtonContainerProps {
  $hide?: boolean;
}

export const DeleteButtonContainer = styled.div<DeleteButtonContainerProps>`
  display: flex;
  width: 40px;
  margin-left: 40px;
  align-items: center;

  ${props => props.$hide && css`
    opacity: 0;
    transform: scale(0);
    transition: opacity 0.3s ease, transform 0.3s ease;
  `}
`;

export const DeleteButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  font-size: 24px;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  width: 30px;
  height: 30px;
  line-height: 1;
  transition: color 0.2s ease, transform 0.2s ease;
  font-family: Arial, sans-serif;
  font-weight: 300;

  &:hover {
    color: rgba(255, 255, 255, 0.8);
    transform: rotate(90deg);
  }
`;

export const FormDropdownWrapper = styled.div`
  display: flex;
  color: var(--white);
  flex-direction: column;
  border-radius: 14px;
  width: 600px;
  background-color: transparent;
  transition: all 0.1s ease;
`;

interface IngredientBubbleProps {
  $active?: boolean;
}

export const IngredientBubble = styled.div<IngredientBubbleProps>`
  display: flex;
  border-radius: 14px;
  width: 600px;
  height: auto:
  flex-direction: row;
  align-items: center;
  background-color: transparent;
  color: var(--white);
  justify-content: space-evenly;
  transition: all 0.1s ease;

  ${props => props.$active && css`
    border-bottom-left-radius: 0px;
    border-bottom-right-radius: 0px;
  `}
`;

export const FoodNameSpace = styled.div`
  border-radius: 2px;
  position: relative;
  flex-grow: 1;
  flex-shrink: 1;
  display: flex;
  align-items: center;
  min-width: 200px;
`;

export const FoodNameInput = styled.textarea`
  font-family: 'Funnel Sans';
  font-size: var(--recipe-card-font-size);
  color: var(--white);
  border: none;
  outline: none;
  background: transparent;
  width: 100%;
  resize: none;
  overflow: hidden;
  min-height: var(--ingredient-input-height);
  line-height: 1.5;

  &::placeholder {
    color: rgba(190, 140, 255, 0.5);
  }
`;

export const FoodPortionSpace = styled.div`
  border-radius: 2px;
  width: 150px;
  flex-grow: 0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
`;

export const PortionInput = styled.input`
  font-family: 'Inconsolata', monospace;
  font-size: var(--recipe-card-font-size);
  font-weight: inherit;
  color: var(--white);
  border: none;
  outline: none;
  background: transparent;
  width: 100%;
  min-height: var(--ingredient-input-height);
  padding: 0;

  &::placeholder {
    color: rgba(190, 140, 255, 0.5);
  }
`;

export const FoodWeightSpace = styled.div`
  border-radius: 2px;
  flex-grow: 0;
  padding-right: 20px;
  flex-shrink: 0;
  display: flex;
  justify-content: start;
  margin-left: 10px;
`;

export const GramsDisplay = styled.input`
  font-family: 'Inconsolata', monospace;
  font-size: var(--recipe-card-font-size);
  color: rgba(255, 255, 255, 0.6);
  border: none;
  outline: none;
  background: transparent;
  padding: 0;
  width: 50px;
  min-height: var(--ingredient-input-height);
  display: flex;
`;



export const AnimatedFoodName = styled.div`
  font-family: 'Inconsolata', monospace;
  font-size: var(--recipe-card-font-size);
  color: var(--white);
  min-height: var(--ingredient-input-height);
  line-height: 1.5;
  display: flex;
  align-items: center;
`;

export const AnimatedWeightText = styled.div`
  font-family: 'Inconsolata', monospace;
  font-size: var(--recipe-card-font-size);
  color: rgba(255, 255, 255, 0.6);
  min-height: var(--ingredient-input-height);
  display: flex;
  align-items: center;
`;

export const SuggestionsContainer = styled.div`
  position: relative;
  width: 100%;
  margin-top: 8px;
  z-index: 1001;
`;

export const SuggestionsList = styled.ul`
  list-style-type: none;
  padding: 0;
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
  background: linear-gradient(
    160deg,
    oklch(0.222 0.044 295 / 97%) 0%,
    oklch(0.183 0.027 295 / 97%) 100%
  );
  border-radius: 10px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px oklch(0 0 0 / 50%), inset 0 1px 0 oklch(0.924 0.063 295 / 6%);
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
`;

interface SuggestionItemProps {
  $selected?: boolean;
}

export const AlignedText = styled.div`
  font-family: 'Inconsolata', monospace;
  font-size: var(--recipe-card-font-size);
  color: var(--white);
`;


export const SuggestionItem = styled.li<SuggestionItemProps>`
  padding: 12px 24px;
  font-family: 'Inconsolata', monospace;
  font-size: var(--recipe-card-font-size);
  color: oklch(0.924 0.063 295 / 72%);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;

  ${props => props.$selected && css`
    background-color: oklch(0.924 0.063 295 / 8%);
    color: oklch(0.924 0.063 295 / 95%);
  `}

  &:hover {
    background-color: oklch(0.924 0.063 295 / 8%);
    color: oklch(0.924 0.063 295 / 95%);
  }
`;
