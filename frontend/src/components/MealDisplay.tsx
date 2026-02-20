import { formatTime } from './utlis';

interface DisplayMealProps {
  meal_name: string;
  date: Date;
  servings: number;
  recipe_id: string | null | undefined;
  recipe_exists?: boolean;
  onNameClick?: () => void;
  onEditClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function MealDisplay ({ meal_name, date, servings, recipe_id, recipe_exists, onNameClick, onEditClick, onMouseEnter, onMouseLeave } : DisplayMealProps) {
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
      <span className='food-name-space' onClick={(e) => { e.stopPropagation(); onNameClick?.(); }}>{meal_name}</span>
      <span className='food-portion-space'> {Number.isInteger(servings) ? servings : servings.toFixed(1)} servings</span>
      <div className='food-weight-space'></div>
      <div className='food-date-space'></div>
      <span className='food-time-space' >{formatTime(new Date(date))}</span>
    </div>
  );
}

export { MealDisplay }
