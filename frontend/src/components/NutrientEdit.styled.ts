import styled, { css } from 'styled-components';
import { AnimatedText } from './AnimatedText';

// Shared styles for nutrient name fields (used on input and animated text)
const nutrientNameStyles = css`
  cursor: pointer;
  font-family: 'Funnel Sans';
  font-size: 17px;
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
  background-color: transparent;
  color: var(--white);
  flex-direction: column;
  border-radius: 12px;
  font-family: 'Funnel Sans';
`;

// ── Delete button — defined before NutrientFormBubble so it can be referenced ──

export const DeleteXButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  color: oklch(0.924 0.063 295 / 50%);
  padding: 4px 6px;
  transition: color 0.15s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);

  &:hover {
    color: oklch(0.924 0.063 295 / 90%);
    transform: rotate(90deg) scale(1.2);
  }
`;

export const DeleteRequirementButtonContainer = styled.div`
  display: flex;
  width: 28px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  margin-left: auto;

  .delete-button svg {
    fill: oklch(0.924 0.063 295 / 55%);
    height: 16px;
    width: 16px;
  }

  .delete-button:hover svg {
    fill: oklch(0.924 0.063 295 / 90%);
  }
`;

interface NutrientFormBubbleProps {
  $active?: boolean;
  $newEntry?: boolean;
}

export const NutrientFormBubble = styled.div<NutrientFormBubbleProps>`
  display: flex;
  border-radius: ${({ $active }) => ($active ? '10px 10px 0 0' : '10px')};
  width: 100%;
  min-height: 50px;
  flex-direction: row;
  align-items: center;
  color: var(--white);
  justify-content: flex-start;
  gap: 12px;
  padding: 0 14px;
  box-sizing: border-box;
  transition: background-color 0.15s ease;

  ${DeleteXButton} {
    opacity: 0;
    transition: opacity 0.15s ease, color 0.15s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  &:hover ${DeleteXButton} {
    opacity: 1;
  }

  ${DeleteRequirementButtonContainer} .delete-button svg {
    opacity: 0;
    transition: opacity 0.15s ease, fill 0.15s ease;
  }

  &:hover ${DeleteRequirementButtonContainer} .delete-button svg {
    opacity: 1;
  }

  &:hover {
    background-color: oklch(0.924 0.063 295 / 4%);
  }

  ${({ $newEntry }) => $newEntry && css`
    background-color: oklch(0.279 0.075 295 / 10%);
    border-top: 1px solid oklch(0.637 0.185 295 / 15%);
    margin-top: 8px;
    border-radius: 0 0 10px 10px;
    padding: 8px 14px;

    &:hover {
      background-color: oklch(0.279 0.075 295 / 18%);
    }
  `}
`;

export const NewNutrientNameWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex: 1;
  min-width: 0;
`;

export const NewRequirementNutrientName = styled.input`
  ${nutrientNameStyles}
  background: none;
  border: none;
  outline: none;
  color: oklch(0.924 0.063 295 / 90%);
  width: 100%;
`;

export const AnimatedNutrientName = styled(AnimatedText)`
  ${nutrientNameStyles}
  color: oklch(0.924 0.063 295 / 90%);
`;

export const NutrientColon = styled.span`
  font-family: 'Funnel Sans';
  font-size: 17px;
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
  gap: 4px;
  font-family: 'Funnel Sans';
  font-size: 16px;
  color: oklch(0.924 0.063 295 / 90%);
  font-variant-numeric: tabular-nums;
`;

export const InputRequirementAmt = styled.input`
  background: none;
  border: none;
  text-align: right;
  color: inherit;
  min-width: 1ch;
  max-width: 7ch;
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
  font-size: 17px;
`;

export const CustomSelect = styled.select`
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background: none;
  border: none;
  border-radius: 0;
  color: oklch(0.924 0.063 295 / 40%);
  cursor: pointer;
  width: 110px;
  text-align: left;
  font-family: inherit;
  font-size: inherit;
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
  border-radius: 0 0 10px 10px;
  background-color: oklch(0.279 0.075 295 / 88%);
  backdrop-filter: blur(10px);

  &::-webkit-scrollbar {
    display: none;
  }
`;

interface NutrientSuggestionItemProps {
  $selected?: boolean;
}

export const NutrientSuggestionItem = styled.li<NutrientSuggestionItemProps>`
  font-family: 'Funnel Sans';
  font-size: 15px;
  padding: 10px 14px 10px 18px;
  color: oklch(0.924 0.063 295 / 90%);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  ${({ $selected }) => $selected && css`
    background-color: oklch(0.924 0.063 295 / 65%);
    color: oklch(0.214 0.038 295);
  `}

  &:hover {
    background-color: oklch(0.924 0.063 295 / 65%);
    color: oklch(0.214 0.038 295);
  }
`;
