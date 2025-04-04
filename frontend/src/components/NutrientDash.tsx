import { useState, useEffect, useRef, startTransition} from 'react';
import { calculateColor, formatDayForFrontend} from './utlis';
import { ImageButton } from './Sections';
import AddLogButton from '../assets/images/plus.svg?react'
import { NewNutrientForm } from './EditNutrientForm';
import '../assets/css/NutrientStats.css'; // Import your CSS file for styling
import {useRecoilValue, useRecoilValueLoadable} from 'recoil'
import { currentDayAtom, rowData} from './dashboard_states';
import { requirementsAtom, RequirementData, requirementsDataAtom, dayIntake, averageIntake } from './dashboard_states';
import { nutrientDetailsByIDAtom } from './account_states';


interface NutrientStatsProps {
  name: string;
  target: number;
  dayIntake?: number;
  avgIntake: number;
  shouldExceed: boolean;
  units: string;
}


function NutrientDashboard(){
  /* for add nutrient requirement button */
  const [editing, setEditing] = useState<boolean>(false)
  const editFormRef = useRef<HTMLDivElement>(null); 
  const currentDay = useRecoilValue(currentDayAtom) 
  const requirementsData = useRecoilValueLoadable(requirementsDataAtom);
  const [requirements, setRequirements] = useState<RequirementData[]>([]);
    
  useEffect(() => {
    if (requirementsData.state === 'hasValue') {
      startTransition(() => {
        setRequirements(requirementsData.contents); // Update state with loaded data
      });
    } else if (requirementsData.state === 'hasError') {
      console.error('Error loading requirements data:', requirementsData.contents);
    }
  }, [requirementsData]);

  useEffect(() => {
    // start looking for clicks outside if new requirement form is visible
    // console.log("clicked outside edit form")
    if (editFormRef.current) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside); // Cleanup
    };  
  }, [editFormRef])  


  // Function to close form if clicked outside
  const handleClickOutside = (event: MouseEvent) => {
    if (editFormRef.current && !editFormRef.current.contains(event.target as Node)) {
      setEditing(false); // Close the form when clicking outside
    }
  }

  const toggleEditing = () =>  {setEditing(!editing)}

  return (
    <div className="nutrient-dashboard">
      {!editing && <NutrientDashboardTitle currentDay = {currentDay}/>}
        <div className = 'requirement-edit-wrapper' ref = {editFormRef}>
          {!editing ?
            requirements.length === 0 ? 
              <div className = 'no-req-message'> no requirements </div> :
              <div className='nutrient-list-wrapper'>
                <NutrientStats requirements={requirements}/>
            </div>  :
            (<div className='nutrient-edit-list-wrapper'>
              {requirements.length > 0 && 
              requirements.map((n, index) => 
                {return(
                  <NewNutrientForm
                    key={n.name}  // Using index as a key. Ideally, use a unique id if available.
                    original={n}/>);
                })
              }
              <NewNutrientForm/>
            </div> )}
        </div>


      {!editing && (
        <ImageButton
        onClick = {toggleEditing}>
          <AddLogButton/>
        </ImageButton>
      )} 
    </div>
  )
}


function NutrientDashboardTitle({currentDay = new Date()} : {currentDay? : Date}){
  return <div className='dashboard-row'>
    <div className = 'nutrient-name-wrapper'>
      <div className = 'nutrient-dashboard-title'> target </div>
    </div>
    <div className = 'today-stats-wrapper'>
      <div className = 'nutrient-dashboard-title'> {formatDayForFrontend(currentDay)} </div>
    </div>

    <div className='avg-stats-wrapper'>
      <div className = 'nutrient-dashboard-title'> average </div>
    </div>
  </div>
}



const NutrientStats = ({requirements} : {requirements : RequirementData[]}) => {

  function initialize(): { [key: string]: number } {
    return requirements.reduce((acc, requirement) => {
      acc[requirement.id] = 0; // Initialize each requirement ID with 0
      return acc;
    }, {} as { [key: string]: number });
  }

  const day = useRecoilValueLoadable(dayIntake);
  const [dailyValues, setDailyValues] = useState<{[key: string]: number}>(
    () => initialize() // Initialize dailyValues
  );

  const average = useRecoilValueLoadable(averageIntake);
  const [avgValues, setAvgValues] = useState<{[key: string]: number}>((
    () => initialize() // Initialize dailyValues
  ));

  useEffect(() => {
    if (day.state === 'hasValue') {
      startTransition(() => {
        setDailyValues(day.contents); // Update state with loaded data
      });
    } else if (day.state === 'hasError') {
      console.error('Error loading daily values data:', day.contents);
    }
  }, [day]);

  useEffect(() => {
    if (average.state === 'hasValue') {
      startTransition(() => {
        setAvgValues(average.contents); // Update state with loaded data
      });
    } else if (average.state === 'hasError') {
      console.error('Error loading daily values data:', average.contents);
    }
  }, [average]);

  const removeTextWithinBrackets = (str : string) => {
    return str.replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, '').trim();
  }

  return (
    <div >
      {requirements.length > 0 && requirements.map((nutrient) => (
        <NutrientStatRow
          key = {nutrient.id}
          name = {removeTextWithinBrackets(nutrient.name)}
          target = {nutrient.target} 
          dayIntake = {dailyValues[nutrient.id]}
          avgIntake={avgValues[nutrient.id]}
          shouldExceed={nutrient.shouldExceed}
          units={nutrient.units}/>))}
    </div>
  );
};


function NutrientStatRow({ name, target, dayIntake = 0, avgIntake, shouldExceed, units }: NutrientStatsProps) {
  const [hovered, setHovered] = useState(false);
  const [hoveredName, setHoveredName] = useState(false);

  // Calculate the progress percentage
  const progressPercentage = Math.min((dayIntake / target) * 100, 100);
  const progressColor = calculateColor(progressPercentage, shouldExceed);

  // Determine the average intake color based on the same rules as above
  const avgColor = calculateColor((avgIntake / target) * 100, shouldExceed);

  const goalMessage = (target : number, intake : number, units : string, shouldExceed : boolean) => {
    const difference = Math.abs(target - dayIntake);
    if (shouldExceed) {
      if (intake < target) return difference.toFixed(0) + " " + units + " until target";
      else return "target met : " + intake.toFixed(0) + " " + units;
    }
    else {
      if (intake < target) return difference.toFixed(0) + " within target";
      else return "exceeded target by " + difference.toFixed(0) + " " + units
    }
  }

  const targetDisplay =  (target: number, units: string) =>{
    return target.toFixed(0) + ' ' + units
  }

  return (
    <div className="dashboard-row">
      <div
        className="nutrient-name-wrapper"
        onMouseEnter={() => setHoveredName(true)}
        onMouseLeave={() => setHoveredName(false)}>
        <div className="nutrient-name">
          {hoveredName ? `${target} ${units}` : name}
        </div>
      </div>

      <div 
        className="today-stats-wrapper"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}>
        <div className="hover-transition-container">
          <div 
            className={`goal-message ${hovered ? 'visible' : 'hidden'}`}>
            {targetDisplay(dayIntake, units)}
          </div>
          <div 
            className={`daily-intake ${hovered ? 'hidden' : 'visible'}`}>
            {shouldExceed ?
            (<div
              className="progress-bar"
              style={{
              width: `${progressPercentage}%`,
              backgroundColor: progressColor}}>
            </div>) :
            (<div
              className="progress-bar"
              style={{
              width: `${progressPercentage * .75}%`,
              backgroundColor: progressColor}}>
            </div>)
            }
          </div>
        </div>
      </div>
      <div className="avg-stats-wrapper">
        <div className="avg-intake" style={{ color: avgColor }}>
           {Math.round(avgIntake * 100) / 100} {units}
        </div>
      </div>
     </div>
  );
}

export {NutrientDashboard, NutrientStatsProps}