import { useState, useEffect, useRef, startTransition} from 'react';
import { calculateColor, formatDayForFrontend} from './utlis';
import { ImageButton } from './Sections';
import addIcon from '../assets/images/add.svg'
import { NewNutrientForm } from './NutrientEdit';
import '../assets/css/NutrientStats.css'; // Import your CSS file for styling
import {useRecoilValue, useRecoilValueLoadable} from 'recoil'
import { currentDayAtom, hoveredLogAtom, hoveredLogPanelData } from './dashboard_states';
import { requirementsAtom, RequirementData, requirementsDataAtom, dayIntake, averageIntake } from './dashboard_states';
import { tutorialEvent } from './TryTutorial';


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
  const hoveredLog = useRecoilValue(hoveredLogAtom);
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

  const toggleEditing = () =>  { setEditing(!editing); tutorialEvent('tutorial:editing-panel'); }

  return (
    <div className={`nutrient-dashboard${hoveredLog ? ' food-hovered' : ''}`}>
      {!editing && <NutrientDashboardTitle/>}
        <div className = 'requirement-edit-wrapper' ref = {editFormRef}>
          {!editing ?
            requirements.length === 0 ? 
              <div className = 'no-req-message'> no requirements </div> :
              <div className='nutrient-list-wrapper'>
                <NutrientStats requirements={requirements}/>
            </div>  :
            (<div className='nutrient-edit-list-wrapper'>
              <div className='nutrient-edit-panel-title'>nutritional targets per day</div>
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


      {!editing && !hoveredLog && (
        <ImageButton
        className="nutrient-edit-button tutorial-nutrient-edit-button"
        onClick = {toggleEditing}>
          <img src={addIcon} alt="Edit nutrients" width="30" height="30" />
        </ImageButton>
      )}
    </div>
  )
}


function NutrientDashboardTitle(){
  const hoveredLog = useRecoilValue(hoveredLogAtom);
  const currentDay = useRecoilValue(currentDayAtom) 
  return <div className='dashboard-row'>
    <div className={`nutrient-name-wrapper${hoveredLog ? ' avg-hidden' : ''}`}>
      <div className='nutrient-dashboard-title'> target </div>
    </div>
    <div className='today-stats-wrapper'>
      <div className={`nutrient-dashboard-title${hoveredLog ? ' nutrient-title-food-mode' : ''}`}>
        {hoveredLog ? hoveredLog[1] : formatDayForFrontend(currentDay)}
      </div>
    </div>
    <div className={`avg-stats-wrapper${hoveredLog ? ' avg-hidden' : ''}`}>
      <div className='nutrient-dashboard-title'> average </div>
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

  const hoveredLog = useRecoilValue(hoveredLogAtom);
  const hoveredPanel = useRecoilValueLoadable(hoveredLogPanelData);
  const day = useRecoilValueLoadable(dayIntake);
  const [dailyValues, setDailyValues] = useState<{[key: string]: number}>(
    () => initialize() // Initialize dailyValues
  );

  const average = useRecoilValueLoadable(averageIntake);
  const [avgValues, setAvgValues] = useState<{[key: string]: number}>((
    () => initialize() // Initialize dailyValues
  ));

  // Update daily values - use hovered panel data if available, otherwise day intake
  useEffect(() => {
    if (hoveredLog && hoveredPanel.state === 'hasValue' && hoveredPanel.contents) {
      // Use hovered log's nutrient data
      startTransition(() => {
        setDailyValues(hoveredPanel.contents);
      });
    } else if (day.state === 'hasValue') {
      // Use day intake when not hovering
      startTransition(() => {
        setDailyValues(day.contents);
      });
    } else if (day.state === 'hasError') {
      console.error('Error loading daily values data:', day.contents);
    }
  }, [day, hoveredLog, hoveredPanel]);

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
    // Remove text within brackets
    let cleaned = str.replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, '').trim();
    // Truncate at first comma
    const commaIndex = cleaned.indexOf(',');
    if (commaIndex !== -1) {
      cleaned = cleaned.substring(0, commaIndex).trim();
    }
    return cleaned;
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


function NutrientStatRow({ name, target, dayIntake = 0, avgIntake = 0, shouldExceed, units }: NutrientStatsProps) {
  const [hovered, setHovered] = useState(false);
  const [hoveredName, setHoveredName] = useState(false);
  const hoveredLog = useRecoilValue(hoveredLogAtom);

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
            className={`goal-message ${hoveredLog || hovered ? 'visible' : 'hidden'}`}>
            {targetDisplay(dayIntake, units)}
          </div>
          <div 
            className={`daily-intake ${hoveredLog || hovered ? 'hidden' : 'visible'}`}>
            {shouldExceed ?
            (<div
              className="progress-bar-container">
              <div
                className="progress-bar"
                style={{
                width: `${progressPercentage}%`,
                backgroundColor: progressColor}}>
              </div>
            </div>) :
            (<div
              className="progress-bar-container">
              <div
                className="progress-bar"
                style={{
                width: `${progressPercentage * .75}%`,
                backgroundColor: progressColor}}>
              </div>
            </div>)
            }
          </div>
        </div>
      </div>
      <div className={`avg-stats-wrapper${hoveredLog ? ' avg-hidden' : ''}`}>
        <div
          className="avg-intake"
          style={{
            '--avg-color': avgColor
          } as React.CSSProperties}
        >
           {avgIntake.toFixed(0)} {units}
        </div>
      </div>
     </div>
  );
}

export {NutrientDashboard, NutrientStatsProps}
