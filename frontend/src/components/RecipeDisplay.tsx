import { useState } from 'react';
import { formatTime } from '../components/utlis';

interface DisplayRecipeProps {
  recipe_name: string;
  date: Date;
  servings: number;
  recipe_id?: string | null;
  recipe_exists?: boolean;
  onClick?: () => void;
}

function RecipeDisplay ({ recipe_name, date, servings, recipe_id, recipe_exists, onClick } : DisplayRecipeProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className='log-bubble'
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {recipe_id && recipe_exists ? (
        <a
          href={`/myrecipes?recipe=${recipe_id}`}
          onClick={(e) => e.stopPropagation()}
          className='food-name-space'
        >
          {recipe_name}
        </a>
      ) : (
        <span  className='food-name-space' >{recipe_name}</span>
      )}
      <span className='food-weight-space'> {servings} servings</span>
      <div className='food-weight-space'></div>
      <div className='food-date-space'></div>
      <span className='food-time-space' >{formatTime(new Date(date))}</span>
    </div>
  );
}

export { RecipeDisplay }
