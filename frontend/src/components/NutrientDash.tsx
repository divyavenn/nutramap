import React, { useState } from 'react';
import '../assets/css/NutrientStats.css'; // Import your CSS file for styling


function NutrientDash(){
  return(
    <div className='nutrient-dashboard'>
      <NutrientStats name = {'Protein'} target = {100} dayIntake={10} avgIntake={100} shouldExceed = {true} units={'g'}></NutrientStats>
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

  // Determine the bar color based on the `shouldExceed` value and the intake
  const progressColor =
    shouldExceed
      ? dayIntake >= target
        ? 'blue'
        : 'red'
      : dayIntake >= target
      ? 'red'
      : 'blue';

  // Determine the average intake color based on the same rules as above
  const avgColor =
    shouldExceed
      ? avgIntake >= target
        ? 'blue'
        : 'red'
      : avgIntake >= target
      ? 'red'
      : 'blue';

  // Calculate the difference for hover text
  const difference = Math.abs(target - dayIntake).toFixed(1);

  return (
    <div className="dashboard-row">
      <div
        className="nutrient-name-wrapper"
        onMouseEnter={() => setHoveredName(true)}
        onMouseLeave={() => setHoveredName(false)}
      >
        <div className="nutrient-name">
          {hoveredName ? `${target} ${units}` : name}
        </div>
      </div>

      <div className="today-stats-wrapper">
        <div
          className="daily-intake"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {hovered ? (
            `${difference} ${units}`
          ) : (
            <div
              className="progress-bar"
              style={{
                width: `${progressPercentage}%`,
                backgroundColor: progressColor,
              }}
            >
            </div>
          )}
        </div>
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