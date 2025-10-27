import React from 'react';
import '../assets/css/recipe_divider.css';

interface MealDividerProps {
  mealDescription: string;
  recipeId: string;
  onClick?: () => void;
}

function MealDivider({ mealDescription, recipeId, onClick }: MealDividerProps) {
  return (
    <div className="recipe-divider">
      <button
        className="recipe-description"
        onClick={onClick}
        title="Click to view recipe details"
      >
        {mealDescription}
      </button>
    </div>
  );
}

export { MealDividerProps, MealDivider };
