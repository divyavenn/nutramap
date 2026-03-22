import React from 'react';
import { motion } from 'framer-motion';
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
  index?: number;
}

const MotionRecipeCardEl = motion(RecipeCardEl);

function RecipeBlurb({ recipe, onClick, index = 0 }: RecipeBlurbProps) {
  return (
    <MotionRecipeCardEl
      className="recipe-card"
      layout
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        layout: { type: 'spring', stiffness: 360, damping: 32, mass: 0.7 },
        opacity: { duration: 0.2 },
        y: { duration: 0.2 },
        delay: index * 0.04,
      }}
      onClick={onClick}
    >
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
    </MotionRecipeCardEl>
  );
}

export { RecipeBlurb };
export type { Recipe, RecipeIngredient };
