import React from 'react';
import { formatTime } from './utlis';
import {
  RecipeBubble, MealToggleBtn,
  FoodNameSpace, FoodPortionSpace, FoodWeightSpace, FoodDateSpace, FoodTimeSpace,
} from './LogStyles';

interface DisplayMealProps {
  meal_name: string;
  date: Date;
  servings: number;
  recipe_id: string | null | undefined;
  recipe_exists?: boolean;
  serving_size_label?: string;
  expanded?: boolean;
  onToggle?: () => void;
  onNameClick?: () => void;
  onEditClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function MealDisplay ({ meal_name, date, servings, recipe_id, serving_size_label, expanded, onToggle, onNameClick, onEditClick, onMouseEnter, onMouseLeave } : DisplayMealProps) {
  const canOpenRecipe = Boolean(recipe_id);
  const count = Number.isInteger(servings) ? servings : servings.toFixed(1);
  const portionText = serving_size_label
    ? `${count} ${serving_size_label.replace(/^\d+\.?\d*\s+/, '')}`
    : `${count} servings`;

  return (
    <RecipeBubble
      $expanded={expanded}
      onClick={onEditClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      <MealToggleBtn
        $expanded={expanded}
        onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
        aria-label={expanded ? 'Collapse' : 'Expand'}
      >
        ›
      </MealToggleBtn>
      <FoodNameSpace
        as="span"
        className={canOpenRecipe ? 'tutorial-recipe-name-link' : undefined}
        onClick={(e: React.MouseEvent) => {
          if (!canOpenRecipe) return;
          e.stopPropagation();
          onNameClick?.();
        }}
      >
        {meal_name}
      </FoodNameSpace>
      <FoodPortionSpace as="span">{portionText}</FoodPortionSpace>
      <FoodWeightSpace />
      <FoodDateSpace />
      <FoodTimeSpace as="span">{formatTime(new Date(date))}</FoodTimeSpace>
    </RecipeBubble>
  );
}

export { MealDisplay }
