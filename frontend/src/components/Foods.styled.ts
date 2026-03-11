import styled, { createGlobalStyle, keyframes, css } from 'styled-components';
import { EntryFormBubble } from './LogNew.styled';
import {
  NutrientDashboardContainer,
  NutrientEditListWrapper,
  NutrientPanelTitle,
} from './NutrientDash.styled';
import {
  NutrientFormBubble,
  NewNutrientWrapper,
  NewNutrientNameWrapper,
  InputRequirementAmtWrapper,
  InputRequirementAmt,
  NewRequirementNutrientName,
  NewNutrientButtonContainer,
  DeleteRequirementButtonContainer,
  AnimatedNutrientName,
} from './NutrientEdit.styled';
import { HoverButton } from './Sections';

// Global input resets for the foods page
export const FoodsGlobalStyles = createGlobalStyle`
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
    color: oklch(0.924 0.063 295 / 38%) !important;
    opacity: 1 !important;
  }

  :-ms-input-placeholder {
    color: oklch(0.924 0.063 295 / 38%) !important;
  }

  ::-ms-input-placeholder {
    color: oklch(0.924 0.063 295 / 38%) !important;
  }
`;

// --- Page header ---

export const FoodsPageTitle = styled.h1`
  font-family: 'Funnel Sans', sans-serif;
  font-size: 26px;
  font-weight: 400;
  color: oklch(0.924 0.063 295 / 90%);
  margin: 0 0 5px 0;
  letter-spacing: -0.01em;
`;

export const FoodsPageSubtitle = styled.p`
  font-family: 'Funnel Sans', sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: oklch(0.924 0.063 295 / 38%);
  margin: 0 0 24px 0;
`;

// --- Foods page layout ---

export const FoodsContainer = styled.div`
  max-width: 760px;
  margin: 0 auto;
  padding: 20px 40px 40px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;

  ${EntryFormBubble} {
    background-color: oklch(0.214 0.038 295 / 70%);
    border-radius: 12px;
    padding: 12px 18px;
    box-shadow: 0 2px 16px oklch(0 0 0 / 28%), inset 0 1px 0 oklch(0.924 0.063 295 / 4%);

    &:hover {
      background-color: oklch(0.279 0.075 295 / 65%);
    }

    &:hover input,
    &:hover textarea {
      color: oklch(0.924 0.063 295 / 92%);
    }
  }
`;

export const NoFoodsMessage = styled.div`
  font-family: 'Funnel Sans', sans-serif;
  color: oklch(0.924 0.063 295 / 32%);
  font-size: 14px;
  font-style: italic;
  margin-top: 20px;
`;

// --- Food tags ---

const shimmerAnimation = keyframes`
  0% {
    background: oklch(0.376 0.129 295 / 49%);
    background-size: 200% 100%;
    background-position: 200% 0;
    transform: scale(1);
    box-shadow: 0 0 0 oklch(0 0 0 / 0%);
  }
  15% {
    transform: scale(1.04);
    box-shadow: 0 3px 16px oklch(0.637 0.185 295 / 35%);
  }
  30%, 70% {
    background-position: -200% 0;
    transform: scale(1.02);
  }
  85% {
    transform: scale(1.01);
  }
  100% {
    background: oklch(0.376 0.129 295 / 49%);
    background-position: -200% 0;
    transform: scale(1);
    box-shadow: 0 0 0 oklch(0 0 0 / 0%);
  }
`;

// ── Delete — defined before FoodTag so it can be referenced ──

export const FoodTagDelete = styled.button`
  background: none;
  border: none;
  color: oklch(0.924 0.063 295 / 45%);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: max-width 0.22s ease, padding 0.22s ease, opacity 0.15s ease, color 0.15s ease;

  &:hover {
    color: oklch(0.924 0.063 295 / 90%);
  }
`;

export const FoodsTagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 16px;
  margin-bottom: 24px;
  width: 100%;
`;

interface FoodTagProps {
  $selected?: boolean;
  $shimmer?: boolean;
  $pending?: boolean;
}

export const FoodTag = styled.div<FoodTagProps>`
  display: inline-flex;
  align-items: center;
  gap: 0;
  min-height: 42px;
  padding: 20px 25px;
  background-color: oklch(0.279 0.075 295 / 55%);
  border: none;
  border-radius: 30px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  font-family: 'Abyssinica SIL', Georgia, Times, 'Times New Roman', serif;
  font-size: 23px;
  line-height: 26px;
  color: oklch(0.924 0.063 295 / 92%);

  &:hover {
    background-color: oklch(0.376 0.129 295 / 60%);
  }

  ${({ $selected }) => $selected && css`
    background-color: oklch(0.495 0.172 295 / 55%);
  `}

  ${({ $shimmer }) => $shimmer && css`
    animation: ${shimmerAnimation} 2s ease-in-out forwards;
  `}

  ${({ $pending }) => $pending && css`
    background-color: oklch(0.214 0.038 295 / 60%);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    cursor: default;
  `}

  &:hover ${FoodTagDelete} {
    max-width: 36px;
    padding: 0 0 0 10px;
    opacity: 1;
  }
`;

export const FoodTagName = styled.span`
  flex: 1;
  line-height: 1;
  white-space: nowrap;
`;

// --- Food detail modal ---

export const FoodModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: oklch(0 0 0 / 80%);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
`;

// Wrapper for the NutrientPanel modal — keeps className for tutorial hooks
export const TutorialFoodDetailModal = styled.div`
  width: min(900px, 96vw);

  ${NutrientDashboardContainer} {
    width: 100%;
    margin: 0;
    max-height: 90vh;
    padding: 34px 56px 44px;
    border-radius: 20px;
    background: oklch(0.279 0.075 295 / 92%);
    box-shadow: 0 20px 60px oklch(0 0 0 / 50%);
    backdrop-filter: blur(16px);
  }

  ${NutrientPanelTitle} {
    font-family: 'Abyssinica SIL', Georgia, Times, 'Times New Roman', serif;
    font-size: 28px;
    font-weight: 400;
    text-align: center;
    margin-bottom: 2px;
  }

  ${NutrientEditListWrapper} {
    width: 100%;
    padding-top: 24px;
  }

  ${NewNutrientWrapper} {
    padding-bottom: 10px;
  }

  ${NutrientFormBubble} {
    min-height: 48px;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto 28px;
    align-items: center;
    column-gap: 28px;
    justify-content: initial;
  }

  ${NewRequirementNutrientName},
  ${InputRequirementAmt},
  ${InputRequirementAmtWrapper} span {
    font-family: 'Inconsolata', monospace;
    font-size: 22px;
    line-height: 1.3;
    color: oklch(0.924 0.063 295 / 88%);
  }

  ${NewNutrientNameWrapper},
  ${InputRequirementAmtWrapper},
  ${NewNutrientButtonContainer} {
    width: auto;
    padding: 0;
  }

  ${NewNutrientNameWrapper} {
    justify-self: stretch;
  }

  ${InputRequirementAmtWrapper} {
    justify-self: start;
  }

  ${InputRequirementAmt} {
    text-align: left;
  }

  ${NewNutrientButtonContainer} {
    justify-self: end;
    justify-content: flex-end;
  }

  ${DeleteRequirementButtonContainer} {
    width: auto;
    align-items: center;
  }

  ${DeleteRequirementButtonContainer} .delete-button svg {
    fill: oklch(0.214 0.038 295 / 92%) !important;
    width: 22px;
    height: 22px;
  }

  ${DeleteRequirementButtonContainer} .delete-button {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.16s ease;
  }

  ${DeleteRequirementButtonContainer} .delete-button:hover svg {
    fill: oklch(0.183 0.027 295 / 95%) !important;
  }

  ${NutrientFormBubble}:hover ${DeleteRequirementButtonContainer} .delete-button,
  ${NutrientFormBubble}:focus-within ${DeleteRequirementButtonContainer} .delete-button {
    opacity: 1;
    pointer-events: auto;
  }

  ${NewRequirementNutrientName}::placeholder,
  ${InputRequirementAmt}::placeholder {
    color: oklch(0.853 0.107 295 / 55%);
  }

  ${AnimatedNutrientName} {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  @media (max-width: 1180px) {
    ${NutrientPanelTitle} {
      font-size: 24px;
    }

    ${NutrientFormBubble} {
      grid-template-columns: 24px minmax(0, 1fr) auto 24px;
      column-gap: 16px;
      min-height: 42px;
    }

    ${NewRequirementNutrientName},
    ${InputRequirementAmt},
    ${InputRequirementAmtWrapper} span {
      font-size: 19px;
    }
  }
`;

// --- NewFood form components ---

export const FoodFormWrapper = styled.form`
  width: min(760px, 100%);
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  position: relative;
  overflow: hidden;
`;

const jiggleAnim = keyframes`
  0% { transform: translateX(0); opacity: 1; }
  25% { transform: translateX(-1px); opacity: 0.75; }
  50% { transform: translateX(3px); opacity: 0.5; }
  75% { transform: translateX(-1px); opacity: 0.25; }
  100% { transform: translateX(0); opacity: 0; }
`;

const fadeOutAnim = keyframes`
  0% { opacity: 1; }
  100% { opacity: 0; }
`;

interface FoodJournalInputProps {
  $jiggling?: boolean;
}

export const FoodJournalInput = styled.textarea<FoodJournalInputProps>`
  flex: 1;
  width: calc(100% - 60px);
  padding-top: 5px;
  padding-bottom: 15px;
  padding-left: 10px;
  padding-right: 10px;
  resize: none;
  max-height: 50px;
  overflow: hidden;
  vertical-align: top;
  line-height: 1.2;
  font-family: Inconsolata;
  color: inherit;
  background: none;
  border: none;
  outline: none;
  transition: background-color 0.3s ease, color 0.3s ease;
  text-align: left;

  ${({ $jiggling }) => $jiggling && css`
    animation: ${jiggleAnim} 0.3s ease 3.33, ${fadeOutAnim} 1s ease forwards;
    will-change: opacity, transform;
  `}
`;

export const ImageUploadContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0 10px;
`;

export const ImageUploadButton = styled.button`
  background-color: oklch(0.924 0.063 295 / 10%);
  color: var(--white);
  border: none;
  border-radius: 5px;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: Inconsolata;
  cursor: pointer;
  transition: background-color 0.2s ease;
  width: 36px;
  height: 36px;

  &:hover {
    background-color: oklch(0.924 0.063 295 / 20%);
  }
`;

export const SmartLogButtonContainer = styled.div`
  display: flex;
  width: 3.2%;
  justify-content: flex-end;
  align-items: center;
`;

export const FoodLogButton = styled(HoverButton)`
  align-items: center;
  background: none;
  margin-right: 5px;
  cursor: pointer;
  border: none;
  order: 1;

  svg {
    fill: oklch(0.924 0.063 295 / 66%);
    width: 15px;
    height: 15px;
  }

  &:hover svg {
    fill: oklch(0.214 0.038 295);
    width: 15px;
    height: 15px;
  }
`;

export const ImagesPreviewGrid = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
`;

export const ImagePreviewContainer = styled.div`
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  background-color: oklch(0 0 0 / 20%);
`;

export const ImagePreviewEl = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
`;

export const RemoveImageButton = styled.button`
  position: absolute;
  top: 2px;
  right: 2px;
  background-color: oklch(0 0 0 / 60%);
  color: var(--white);
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  line-height: 1;
  transition: background-color 0.2s ease;
  padding: 0;

  &:hover {
    background-color: oklch(0.5 0.2 25 / 80%);
  }
`;
