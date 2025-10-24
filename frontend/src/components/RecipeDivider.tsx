import React from 'react';
import '../assets/css/recipe_divider.css';

interface RecipeDividerProps {
  recipeDescription: string;
  recipeId: string;
  onClick?: () => void;
}

function RecipeDivider({ recipeDescription, recipeId, onClick }: RecipeDividerProps) {
  return (
    <div className="recipe-divider">
      <button
        className="recipe-description"
        onClick={onClick}
        title="Click to view recipe details"
      >
        {recipeDescription}
      </button>
    </div>
  );
}

export { RecipeDivider };
