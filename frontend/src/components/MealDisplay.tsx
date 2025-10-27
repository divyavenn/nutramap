import { formatTime } from './utlis';

interface DisplayMealProps {
  meal_name: string;
  date: Date;
  servings: number;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function MealDisplay ({ meal_name, date, servings, onClick, onMouseEnter, onMouseLeave } : DisplayMealProps) {
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
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <span className='food-name-space'>{meal_name}</span>
      <span className='food-weight-space'> {servings} servings</span>
      <div className='food-weight-space'></div>
      <div className='food-date-space'></div>
      <span className='food-time-space' >{formatTime(new Date(date))}</span>
    </div>
  );
}

export { MealDisplay }
