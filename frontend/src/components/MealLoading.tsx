import {
  LogBubble, FoodNameSpace, FoodDateSpace, FoodPortionSpace, MealRowContainer, MealToggleBtn,
} from './LogStyles';
import { SavingText } from './SavingText';
import { formatQuantity } from './utlis';
import { pluralize } from './pluralize';
import Caret from '../assets/images/caret-right.svg?react';

interface MealLoadingProps {
  // What the parser found; while unknown the row shows a generic loading state
  name?: string;
  servings?: number;
}

function MealLoading({ name, servings }: MealLoadingProps) {
  const portion = servings
    ? `${formatQuantity(servings, 2)} ${pluralize('serving', servings)}`
    : null;

  return (
    <MealRowContainer>
      <MealToggleBtn $expanded={false} disabled aria-hidden tabIndex={-1} style={{ opacity: 0.3 }}><Caret aria-hidden /></MealToggleBtn>
      <LogBubble>
        {/* SavingText's pulse is CSS and stops under reduced motion */}
        <FoodNameSpace><SavingText>{name ?? 'loading meals…'}</SavingText></FoodNameSpace>
        <FoodDateSpace />
        <FoodPortionSpace>{portion && <SavingText>{portion}</SavingText>}</FoodPortionSpace>
      </LogBubble>
    </MealRowContainer>
  );
}

export { MealLoading };
