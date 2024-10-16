import React, { useState } from 'react';
import '../assets/css/NutrientStats.css'; // Import your CSS file for styling


function NutrientDash(){
  return(
    <div className='nutrient-dashboard'>
      <NutrientStats  name = {'Protein'}
                      target = {100} 
                      dayIntake={100}
                      avgIntake={100}
                      shouldExceed = {true}
                      units={'g'}>
      </NutrientStats>
      <NutrientStats  name = {'Iron'}
                      target = {100} 
                      dayIntake={50}
                      avgIntake={100}
                      shouldExceed = {true}
                      units={'g'}>
      </NutrientStats>
      <NutrientStats  name = {'PUFA'}
                      target = {30} 
                      dayIntake={31}
                      avgIntake={100}
                      shouldExceed = {false}
                      units={'g'}>
      </NutrientStats>  
    </div>
  )
}

interface NutrientStatsProps {
  name: string;
  target: number;
  dayIntake: number;
  avgIntake: number;
  shouldExceed: boolean;
  units: string;
}


function NutrientStats({ name, target, dayIntake, avgIntake, shouldExceed, units }: NutrientStatsProps) {
  const [hovered, setHovered] = useState(false);
  const [hoveredName, setHoveredName] = useState(false);

  // Calculate the progress percentage
  const progressPercentage = Math.min((dayIntake / target) * 100, 100);

  // Function to interpolate between red and blue based on intake vs. target
  const calculateColor = (percentage: number, shouldExceed: boolean) => {
    // If shouldExceed is true, red (when less) to blue (when exceeded)
    // If shouldExceed is false, blue (when less) to red (when exceeded)

    // Define RGB values for the two endpoints
    const red = [209, 99, 0]; // RGB for red
    const blue = [60, 181, 57]; // RGB for blue

    // Calculate the ratio (how far along we are towards the target)
    const ratio = Math.min(percentage / 100, 1);

    // Interpolate between red and blue
    const [r, g, b] = shouldExceed
      ? [
          Math.floor((1 - ratio) * red[0] + ratio * blue[0]),
          Math.floor((1 - ratio) * red[1] + ratio * blue[1]),
          Math.floor((1 - ratio) * red[2] + ratio * blue[2]),
        ]
      : [
          Math.floor((1 - ratio) * blue[0] + ratio * red[0]),
          Math.floor((1 - ratio) * blue[1] + ratio * red[1]),
          Math.floor((1 - ratio) * blue[2] + ratio * red[2]),
        ];

    // Return the color as a CSS-compatible string
    return `rgb(${r}, ${g}, ${b})`;
  };

  const progressColor = calculateColor(progressPercentage, shouldExceed);

  // Determine the average intake color based on the same rules as above
  const avgColor = calculateColor((avgIntake / target) * 100, shouldExceed);

  const goalMessage = (target : number, intake : number, units : string, shouldExceed : boolean) => {
    const difference = Math.abs(target - dayIntake);
    if (shouldExceed) {
      if (intake < target) return difference.toFixed() + " " + units + " until target";
      else return "target met : " + intake.toFixed() + " " + units;
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
          {hoveredName ? `${target} ${units}` : name}
        </div>
      </div>

      <div className="today-stats-wrapper" 
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)} >
          {hovered ? 
            (`${goalMessage(target, dayIntake, units, shouldExceed)}`) : 
            (
              <div className="daily-intake">
                <div
                  className="progress-bar"
                  style={{
                  width: `${progressPercentage*.75}%`,
                  backgroundColor: progressColor}}>
                </div>
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

export {NutrientDash}