import React from 'react';
import {
  RecipeCardEl,
  RecipeCardHeader,
  RecipeTitleEl,
  RecipeUsageCount,
  RecipeIngredientsPreview,
  IngredientPreviewItem,
  MoreIngredients,
} from './RecipeCard.styled';

interface RecipeIngredient {
  food_id: number | string;
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
    <RecipeCardEl onClick={onClick}>
      <RecipeCardHeader>
        <RecipeTitleEl>{recipe.description}</RecipeTitleEl>
        <RecipeUsageCount>
          Used {recipe.usage_count} {recipe.usage_count === 1 ? 'time' : 'times'}
        </RecipeUsageCount>
      </RecipeCardHeader>
      <RecipeIngredientsPreview>
        {recipe.ingredients.slice(0, 5).map((ing, idx) => (
          <IngredientPreviewItem key={idx}>
            {ing.amount} {ing.food_name || 'Unknown'}
          </IngredientPreviewItem>
        ))}
        {recipe.ingredients.length > 5 && (
          <MoreIngredients>
            +{recipe.ingredients.length - 5} more
          </MoreIngredients>
        )}
      </RecipeIngredientsPreview>
    </RecipeCardEl>
  );
}

export { RecipeBlurb };
export type { Recipe, RecipeIngredient };
