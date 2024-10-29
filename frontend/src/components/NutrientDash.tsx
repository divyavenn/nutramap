import React, { useState, useEffect, useRef} from 'react';
import { calculateColor, formatDayForFrontend} from './utlis';
import { ImageButton } from './Sections';
import AddLogButton from '../assets/images/plus.svg?react'
import { NewNutrientForm } from './addNutrientForm';
import '../assets/css/NutrientStats.css'; // Import your CSS file for styling


interface NutrientStatsProps {
  name: string;
  target: number;
  dayIntake?: number;
  avgIntake: number;
  shouldExceed: boolean;
  units: string;
}

function NutrientDashboard({nutrientStats, currentDay, callAfterNewNutrient} : 
                            {nutrientStats : NutrientStatsProps[], currentDay : Date, callAfterNewNutrient : () => void}){


  /* for add nutrient requirement button */
  const [editing, setEditing] = useState<boolean>(false)
  const editFormRef = useRef<HTMLDivElement>(null); 

  // Function to close form if clicked outside
  const handleClickOutside = (event: MouseEvent) => {
    if (editFormRef.current && !editFormRef.current.contains(event.target as Node)) {
      setEditing(false); // Close the form when clicking outside
    }
  }
    
  useEffect(() => {
    // start looking for clicks outside if new requirement form is visible
    console.log("clicked outside edit form")
    if (editFormRef) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside); // Cleanup
    };  
  }, [editFormRef])  


  const removeTextWithinBrackets = (str : string) => {
    return str.replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, '').trim();
  }

  const toggleEditing = () =>  {setEditing(!editing)}

  return (
    <div className="nutrient-dashboard">
      {!editing && <NutrientDashboardTitle currentDay = {currentDay}/>}

        <div className = 'requirement-edit-wrapper' ref = {editFormRef}>
          {!editing ?
            nutrientStats.length === 0 ? 

              <div> no requirements </div> :

              <div className='nutrient-list-wrapper'>
                {nutrientStats.map((n, index) => 
                  {return(
                    <NutrientStats
                      key={index}  // Using index as a key. Ideally, use a unique id if available.
                      name={removeTextWithinBrackets(n.name)}
                      target={n.target}
                      dayIntake={n.dayIntake}
                      avgIntake={Math.round(n.avgIntake * 10) / 10}
                      shouldExceed={n.shouldExceed}
                      units={n.units}/>);
                  })
                }
            </div>  :
            (<div className='nutrient-edit-list-wrapper'>
              {nutrientStats.map((n, index) => 
                {return(
                  <NewNutrientForm
                    key={index}  // Using index as a key. Ideally, use a unique id if available.
                    callAfterSubmitting={callAfterNewNutrient}
                    original={n}/>);
                })
              }
              <NewNutrientForm callAfterSubmitting={callAfterNewNutrient}/>
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

    </div>
    <div className = 'today-stats-wrapper'>
      <div className = 'nutrient-dashboard-title'> {formatDayForFrontend(currentDay)} </div>
    </div>

    <div className='avg-stats-wrapper'>
      <div className = 'nutrient-dashboard-title'> average </div>
    </div>
  </div>
}


function NutrientStats({ name, target, dayIntake = 0, avgIntake, shouldExceed, units }: NutrientStatsProps) {
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
      if (intake < target) return difference.toFixed() + " " + units + " until target";
      else return "target met: " + intake.toFixed() + " " + units;
    }
    else {
      if (intake < target) return difference.toFixed() + " within target";
      else return "exceeded target by " + difference.toFixed() + " " + units
    }
  }

  return (
    <div className="dashboard-row">
      <div
        className="nutrient-name-wrapper"
        onMouseEnter={() => setHoveredName(true)}
        onMouseLeave={() => setHoveredName(false)}>
        <div className="nutrient-name">
          {hoveredName ? `target: ${target} ${units}` : name}
        </div>
      </div>

      <div className="today-stats-wrapper" 
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)} >
          {hovered ? 
            (<div>
              {goalMessage(target, dayIntake, units, shouldExceed)}
              </div>) : 
            (
              <div className="daily-intake">
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
            )}
      </div>
      <div className="avg-stats-wrapper">
        <div className="avg-intake" style={{ color: avgColor }}>
          {avgIntake} {units}
        </div>
      </div>
     </div>
  );
}

export {NutrientDashboard, NutrientStatsProps}