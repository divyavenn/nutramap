import styled, { keyframes, css } from 'styled-components';
import { AnimatedText } from './AnimatedText';

const xIdle = keyframes`
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.55; }
`;

// Shared styles for nutrient name fields (used on input and animated text)
const nutrientNameStyles = css`
  cursor: pointer;
  font-family: 'Funnel Sans';
  font-size: 19px;
  flex: 1 1 0;
  min-width: 0;
  text-align: left;
`;

interface NewNutrientWrapperProps {
  $active?: boolean;
}

export const NewNutrientWrapper = styled.form<NewNutrientWrapperProps>`
  width: 100%;
  display: flex;
  box-sizing: border-box;
  background-color: #19050500;
  color: var(--white);
  flex-direction: column;
  border-radius: 14px;
  font-family: 'Funnel Sans';
`;

interface NutrientFormBubbleProps {
  $active?: boolean;
  $newEntry?: boolean;
}

export const NutrientFormBubble = styled.div<NutrientFormBubbleProps>`
  display: flex;
  border-radius: ${({ $active }) => ($active ? '10px 10px 0 0' : '10px')};
  width: 100%;
  flex-direction: row;
  align-items: center;
  color: var(--white);
  justify-content: flex-start;
  gap: 10px;
  padding: 4px 6px;
  background-color: ${({ $newEntry }) => ($newEntry ? 'rgba(130, 60, 220, 0.25)' : 'transparent')};
`;

export const NewNutrientNameWrapper = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: flex-start;
  gap: 2px;
  width: 185px;
  flex-shrink: 0;
`;

export const NewRequirementNutrientName = styled.input`
  ${nutrientNameStyles}
  background: none;
  border: none;
  outline: none;
  color: inherit;
`;

export const AnimatedNutrientName = styled(AnimatedText)`
  ${nutrientNameStyles}
`;

export const NutrientColon = styled.span`
  font-family: 'Funnel Sans';
  font-size: 19px;
  color: inherit;
  opacity: 0.5;
  flex-shrink: 0;
`;

export const InputRequirementAmtWrapper = styled.div`
  display: flex;
  align-items: baseline;
  align-self: center;
  position: relative;
  width: auto;
  flex-shrink: 0;
  gap: 6px;
  font-family: 'Funnel Sans';
  font-size: 19px;
`;

export const InputRequirementAmt = styled.input`
  background: none;
  border: none;
  text-align: right;
  color: inherit;
  min-width: 1ch;
  font-family: inherit;
  font-size: inherit;
  outline: none;
`;

export const NutrientTypeSelectWrapper = styled.div`
  display: flex;
  align-items: center;
  align-self: center;
  position: relative;
  font-family: 'Funnel Sans';
  font-size: 19px;
`;

export const CustomSelect = styled.select`
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background: none;
  border: none;
  border-radius: 0;
  color: inherit;
  cursor: pointer;
  width: 95px;
  text-align: left;
  font-family: inherit;
  font-size: inherit;
`;

export const DeleteRequirementButtonContainer = styled.div`
  display: flex;
  width: 24px;
  align-items: center;
  justify-content: center;
  margin-left: auto;

  .delete-button svg {
    fill: #ffffff77;
    height: 16px;
    width: 16px;
  }

  .delete-button:hover svg {
    fill: #ffffff;
  }
`;

export const DeleteXButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 25px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.35);
  padding: 0;
  transition: color 0.2s ease, transform 0.2s ease;
  animation: ${xIdle} 3s ease-in-out infinite;

  &:hover {
    color: rgba(255, 255, 255, 0.9);
    transform: rotate(90deg);
    animation: none;
  }
`;

export const NewNutrientButtonContainer = styled.div`
  display: flex;
  width: 20%;
  justify-content: flex-end;
  align-items: center;
  padding-top: 5px;
`;

export const NewNutrientButtonHidden = styled.button`
  display: none;
`;

export const NutrientSuggestionsList = styled.ul`
  list-style-type: none;
  padding-left: 0;
  margin: 0;
  width: 100%;
  max-height: 300px;
  overflow-y: auto;
  z-index: 999;
  opacity: 1;
  transition: opacity 0.3s ease, max-height 0.3s ease;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  font-family: 'Funnel Sans';

  &::-webkit-scrollbar {
    display: none;
  }
`;

interface NutrientSuggestionItemProps {
  $selected?: boolean;
}

export const NutrientSuggestionItem = styled.li<NutrientSuggestionItemProps>`
  font-family: 'Funnel Sans';
  font-size: 16px;
  padding: 10px 10px 10px 39px;
  color: var(--white);
  cursor: pointer;
  transition: background-color 0.3s ease, color 0.3s ease;

  ${({ $selected }) =>
    $selected &&
    `
    background-color: #ffffffa1;
    color: #1e002e;
  `}

  &:hover {
    background-color: #ffffffa1;
    color: #1e002e;
  }
`;
