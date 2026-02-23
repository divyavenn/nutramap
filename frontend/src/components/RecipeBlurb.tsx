import React from 'react';
import '../assets/css/myrecipes.css';

interface RecipeIngredient {
  food_id: number;
  amount: string;
  weight_in_grams: number;
  food_name?: string;
}

interface Recipe {
  recipe_id: string;
  description: string;
  ingredients: RecipeIngredient[];
  serving_size_label?: string;
  serving_size_grams?: number;
  created_at: string;
  updated_at: string;
  usage_count: number;
}

interface RecipeBlurbProps {
  recipe: Recipe;
  onClick: () => void;
}

function RecipeBlurb({ recipe, onClick }: RecipeBlurbProps) {
  return (
    <div className="recipe-card" onClick={onClick}>
      <div className="recipe-card-header">
        <h3 className="recipe-title">{recipe.description}</h3>
        <div className="recipe-usage-count">
          Used {recipe.usage_count} {recipe.usage_count === 1 ? 'time' : 'times'}
        </div>
      </div>
      <div className="recipe-ingredients-preview">
        {recipe.ingredients.slice(0, 5).map((ing, idx) => (
          <div key={idx} className="ingredient-preview-item">
            {ing.amount} {ing.food_name || 'Unknown'}
          </div>
        ))}
        {recipe.ingredients.length > 5 && (
          <div className="more-ingredients">
            +{recipe.ingredients.length - 5} more
          </div>
        )}
      </div>
    </div>
  );
}

export { RecipeBlurb };
export type { Recipe, RecipeIngredient };
