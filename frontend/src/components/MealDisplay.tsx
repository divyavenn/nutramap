import { formatTime } from './utlis';

interface DisplayMealProps {
  meal_name: string;
  date: Date;
  servings: number;
  recipe_id: string | null | undefined;
  recipe_exists?: boolean;
  serving_size_label?: string;
  onNameClick?: () => void;
  onEditClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function MealDisplay ({ meal_name, date, servings, recipe_id, serving_size_label, onNameClick, onEditClick, onMouseEnter, onMouseLeave } : DisplayMealProps) {
  const canOpenRecipe = Boolean(recipe_id);
  const count = Number.isInteger(servings) ? servings : servings.toFixed(1);
  const portionText = serving_size_label
    ? `${count} ${serving_size_label.replace(/^\d+\.?\d*\s+/, '')}`
    : `${count} servings`;

  const handleMouseEnter = () => {
    if (onMouseEnter) {
      onMouseEnter();
    }
  };

  const handleMouseLeave = () => {
    if (onMouseLeave) {
      onMouseLeave();
    }
  };

  return (
    <div
      className='recipe-bubble'
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onEditClick}
      style={{ cursor: 'pointer' }}
    >
      <span
        className={`food-name-space${canOpenRecipe ? ' tutorial-recipe-name-link' : ''}`}
        onClick={(e) => {
          if (!canOpenRecipe) return;
          e.stopPropagation();
          onNameClick?.();
        }}
      >
        {meal_name}
      </span>
      <span className='food-portion-space'> {portionText}</span>
      <div className='food-weight-space'></div>
      <div className='food-date-space'></div>
      <span className='food-time-space' >{formatTime(new Date(date))}</span>
    </div>
  );
}

export { MealDisplay }
