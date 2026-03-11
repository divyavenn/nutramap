import styled, { createGlobalStyle } from 'styled-components';

// Global styles for cross-component selectors inside the recipe modal
export const RecipeCardGlobalStyles = createGlobalStyle`
  .recipe-detail-modal .ingredient-bubble,
  .recipe-detail-modal .form-dropdown-wrapper,
  .recipe-detail-modal .ingredient-form-container {
    background-color: transparent !important;
    background: transparent !important;
  }
`;

// Page layout
export const MyRecipesPage = styled.div`
  min-height: 100vh;
  padding: 40px;
`;

export const MyRecipesContainer = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
`;

export const MyRecipesHeader = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 40px;
  margin-top: 20px;
`;

export const CreateRecipeButton = styled.button`
  padding: 12px 24px;
  background-color: var(--purple);
  color: var(--white);
  border: none;
  border-radius: 8px;
  font-family: 'Ubuntu', sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: oklch(0.33 0.105 295 / 90%);
    transform: translateY(-2px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

export const LoadingMessage = styled.div`
  text-align: center;
  padding: 60px 20px;
  font-family: 'Ubuntu', sans-serif;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);
`;

export const NoRecipesMessage = styled.div`
  text-align: center;
  padding: 60px 20px;
  font-family: 'Ubuntu', sans-serif;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);

  p {
    margin: 10px 0;
  }
`;

export const RecipesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 20px;
`;

// Recipe blurb card
export const RecipeCardEl = styled.div`
  background-color: var(--purple);
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: oklch(0.279 0.075 295 / 95%);
    transform: translateY(-4px);
    box-shadow: 0 8px 24px oklch(0 0 0 / 45%), 0 0 0 1px oklch(0.637 0.185 295 / 15%);
  }
`;

export const RecipeCardHeader = styled.div`
  margin-bottom: 16px;
`;

export const RecipeTitleEl = styled.h3`
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px;
  font-weight: 400;
  color: var(--white);
  margin: 0 0 12px 0;
  text-align: center;
`;

export const RecipeUsageCount = styled.div`
  font-family: 'Ubuntu', sans-serif;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
`;

export const RecipeIngredientsPreview = styled.div`
  font-family: 'Inconsolata', monospace;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
`;

export const IngredientPreviewItem = styled.div`
  margin: 4px 0;
`;

export const MoreIngredients = styled.div`
  margin-top: 8px;
  font-style: italic;
  color: rgba(255, 255, 255, 0.5);
`;

// Modal overlay and container
export const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: oklch(0 0 0 / 75%);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9000;
  padding: 50px;
`;

export const RecipeDetailModal = styled.div`
  position: relative;
  background: linear-gradient(
    160deg,
    oklch(0.222 0.044 295 / 95%) 0%,
    oklch(0.183 0.027 295 / 95%) 100%
  );
  border-radius: 16px;
  max-width: 800px;
  width: 100%;
  min-height: 420px;
  padding: 20px 20px 72px;
  max-height: 90vh;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  overflow-y: auto;
  box-shadow:
    inset 0 1px 0 oklch(0.924 0.063 295 / 9%),
    0 40px 96px oklch(0 0 0 / 70%),
    0 8px 28px oklch(0 0 0 / 40%);

  &::-webkit-scrollbar {
    display: none;
  }
`;

// Close button — use as={motion.button} in RecipeCard.tsx for framer-motion
export const ModalCloseX = styled.button`
  position: absolute;
  top: 20px;
  right: 20px;
  background: none;
  border: none;
  color: var(--white);
  font-size: 36px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
  z-index: 10;

  & svg {
    width: 24px;
    height: 24px;
    opacity: 0.88;
  }
`;

export const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 44px 44px 0;
  color: oklch(0.924 0.063 295 / 96%);
  font-family: 'Abyssinica SIL', Georgia, Times, 'Times New Roman', serif;
  font-size: 26px;
`;

interface RecipeNameDisplayProps {
  $saving?: boolean;
}

export const RecipeNameDisplay = styled.h2<RecipeNameDisplayProps>`
  font-family: 'Abyssinica SIL', Georgia, Times, 'Times New Roman', serif;
  font-size: inherit;
  font-weight: normal;
  color: oklch(0.924 0.063 295 / 96%);
  background: transparent;
  border: none;
  outline: none;
  width: 100%;
  padding: 0;
  margin: 0;
  cursor: text;
  ${({ $saving }) => $saving && 'min-height: 1.4em;'}
`;

export const RecipeTitleEditRow = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0;
  padding: 2px 0;
`;

export const RecipeTitleInput = styled.input`
  background: none;
  border: none;
  border-bottom: 1px solid oklch(0.637 0.185 295 / 25%);
  color: oklch(0.924 0.063 295 / 90%);
  font-family: 'Inconsolata', monospace;
  outline: none;
  padding: 0 2px 2px;
`;

export const RecipeTitleNameInput = styled(RecipeTitleInput)`
  font-size: 22px;
  font-weight: 600;
`;

export const RecipeTitleLabelInput = styled(RecipeTitleInput)`
  font-size: 22px;
  opacity: 0.75;
`;

export const RecipeTitleGramsInput = styled(RecipeTitleInput)`
  font-size: 22px;
  opacity: 0.75;
`;

export const RecipeServingSuffix = styled.span`
  font-size: 0.75em;
  opacity: 0.55;
  font-weight: 400;
  margin-left: 5%;
`;

export const RecipeTitleSep = styled.span`
  font-family: 'Inconsolata', monospace;
  font-size: 22px;
  color: oklch(0.924 0.063 295 / 28%);
  white-space: pre;
`;

export const ModalContent = styled.div`
  padding: 28px 44px 24px;
`;

export const IngredientsSection = styled.div`
  margin-bottom: 24px;
  margin-top: 18px;
`;

export const ModalFooter = styled.div`
  position: absolute;
  right: 35px;
  bottom: 35px;
  display: flex;
  align-items: center;
  padding: 0;
`;

// Delete button — use as={motion.button} in RecipeCard.tsx for framer-motion
export const DeleteRecipeIconButton = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0;

  & svg {
    width: 20px;
    height: 20px;
    fill: rgba(255, 255, 255, 0.88);
  }
`;

