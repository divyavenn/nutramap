import { AnimatedText } from './AnimatedText';
import {
  LogBubble, FoodNameSpace, FoodDateSpace, FoodPortionSpace, MealRowContainer,
} from './LogStyles';

function MealLoading() {
  return (
    <MealRowContainer>
      <LogBubble>
        <FoodNameSpace><AnimatedText text="loading..." /></FoodNameSpace>
        <FoodDateSpace />
        <FoodPortionSpace><AnimatedText text="0g" /></FoodPortionSpace>
      </LogBubble>
    </MealRowContainer>
  );
}

export { MealLoading };
