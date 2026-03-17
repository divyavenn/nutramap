import { AnimatedText } from './AnimatedText';
import {
  LogBubble, FoodNameSpace, FoodDateSpace, FoodPortionSpace, MealRowContainer, MealToggleBtn,
} from './LogStyles';

function MealLoading() {
  return (
    <MealRowContainer>
      <MealToggleBtn $expanded={false} disabled style={{ filter: 'blur(4px)' }}>›</MealToggleBtn>
      <LogBubble>
        <FoodNameSpace><AnimatedText text="loading..." /></FoodNameSpace>
        <FoodDateSpace />
        <FoodPortionSpace><AnimatedText text="0g" /></FoodPortionSpace>
      </LogBubble>
    </MealRowContainer>
  );
}

export { MealLoading };
