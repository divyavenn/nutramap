import { AnimatedText} from "./AnimatedText";


function MealLoading({} : {}) {

  return (
    <div
      className='recipe-bubble'
    >
      <span className='food-name-space'>
        <AnimatedText text="Loading..." />
      </span>
    </div>
  );
}

export { MealLoading }