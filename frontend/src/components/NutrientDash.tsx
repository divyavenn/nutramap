import { useState, useEffect, useRef, startTransition} from 'react';
import { calculateColor, formatDayForFrontend} from './utlis';
import addIcon from '../assets/images/add.svg'
import { NewNutrientForm } from './NutrientEdit';
import {useRecoilValue, useRecoilValueLoadable} from 'recoil'
import { currentDayAtom, hoveredLogAtom, hoveredLogPanelData } from './dashboard_states';
import { requirementsAtom, RequirementData, requirementsDataAtom, dayIntake, averageIntake } from './dashboard_states';
import { tutorialEvent } from './TryTutorial';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  NutrientDashboardContainer,
  NutrientEditButton,
  RequirementEditWrapper,
  NutrientEditListWrapper,
  NutrientEditPanelTitle,
  NutrientListWrapper,
  NoReqMessage,
  NutrientDashTitle,
  DashboardRow,
  NutrientNameWrapper,
  NutrientName,
  TodayStatsWrapper,
  AvgIntake,
  AvgStatsWrapper,
  HoverTransitionContainer,
  GoalMessage,
  DailyIntake,
  ProgressBarContainer,
  ProgressBar,
} from './NutrientDash.styled';


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
  const dashboardLayoutTransition = { type: 'spring', stiffness: 360, damping: 32, mass: 0.7 } as const;

  // Fixed height based on row count so hover mode never changes panel size.
  // Constants derived from NutrientStats.css:
  //   100px = dashboard padding (40 top + 60 bottom)
  //   38px  = title row (28px height + 10px margin-bottom)
  //   50px  = nutrient-list-wrapper padding (30 top + 20 bottom)
  //   40px  = per row (≈30px content + 10px margin-bottom)
  //   48px  = edit button (6px margin-top + 6+30+6px button)
  //   12px  = bottom padding buffer
  const PANEL_BASE_H = 268; // 100 + 38 + 50 + 48 + 20 + 12
  const ROW_H = 40;
  const panelHeight = requirements.length > 0
    ? PANEL_BASE_H + requirements.length * ROW_H
    : 300; // fallback for "no requirements" state

  return (
    <LayoutGroup>
    <motion.div layout transition={dashboardLayoutTransition}>
      <NutrientDashboardContainer
        className="nutrient-dashboard"
        $foodHovered={!!hoveredLog}
        style={!editing ? { height: panelHeight } : undefined}
      >
        <AnimatePresence initial={false} mode="wait">
          {!editing && (
            <motion.div
              key="nutrient-title"
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              style={{ width: '100%' }}
            >
              <NutrientDashboardTitle/>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div layout transition={dashboardLayoutTransition} style={{ width: '100%' }}>
          <RequirementEditWrapper ref={editFormRef}>
            <AnimatePresence initial={false} mode="wait">
              {!editing ? (
                <motion.div
                  key="view-mode"
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  {requirements.length === 0 ? (
                    <NoReqMessage>no requirements</NoReqMessage>
                  ) : (
                    <NutrientListWrapper>
                      <NutrientStats requirements={requirements}/>
                    </NutrientListWrapper>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="edit-mode"
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  <NutrientEditListWrapper className="nutrient-edit-list-wrapper">
                    <NutrientEditPanelTitle>nutritional targets</NutrientEditPanelTitle>
                    {requirements.length > 0 &&
                      requirements.map((n, index) =>
                        {return(
                          <NewNutrientForm
                            key={n.name}
                            original={n}/>);
                        })
                    }
                    <NewNutrientForm/>
                  </NutrientEditListWrapper>
                </motion.div>
              )}
            </AnimatePresence>
          </RequirementEditWrapper>
        </motion.div>

        <AnimatePresence initial={false}>
          {!editing && (
            <motion.div
              key="add-requirement-button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <NutrientEditButton
                className="tutorial-nutrient-edit-button"
                onClick={hoveredLog ? undefined : toggleEditing}
                style={{ visibility: hoveredLog ? 'hidden' : 'visible' }}
              >
                <img src={addIcon} alt="Edit nutrients" width="30" height="30" />
              </NutrientEditButton>
            </motion.div>
          )}
        </AnimatePresence>
      </NutrientDashboardContainer>
    </motion.div>
    </LayoutGroup>
  )
}


function NutrientDashboardTitle(){
  const hoveredLog = useRecoilValue(hoveredLogAtom);
  const currentDay = useRecoilValue(currentDayAtom)
  return (
    <DashboardRow>
      <NutrientNameWrapper $hidden={!!hoveredLog}>
        <NutrientDashTitle>target</NutrientDashTitle>
      </NutrientNameWrapper>
      <TodayStatsWrapper className="today-stats-wrapper">
        <NutrientDashTitle $foodMode={!!hoveredLog}>
          {hoveredLog ? hoveredLog[1] : formatDayForFrontend(currentDay)}
        </NutrientDashTitle>
      </TodayStatsWrapper>
      <AvgStatsWrapper className="avg-stats-wrapper" $hidden={!!hoveredLog}>
        <NutrientDashTitle>average</NutrientDashTitle>
      </AvgStatsWrapper>
    </DashboardRow>
  );
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
        setDailyValues(hoveredPanel.contents ?? initialize());
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
    <DashboardRow>
      <NutrientNameWrapper
        onMouseEnter={() => setHoveredName(true)}
        onMouseLeave={() => setHoveredName(false)}>
        <NutrientName>
          {hoveredName ? `${target} ${units}` : name}
        </NutrientName>
      </NutrientNameWrapper>

      <TodayStatsWrapper
        className="today-stats-wrapper"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}>
        <HoverTransitionContainer>
          <GoalMessage $visible={!!(hoveredLog || hovered)}>
            {targetDisplay(dayIntake, units)}
          </GoalMessage>
          <DailyIntake $visible={!(hoveredLog || hovered)}>
            <ProgressBarContainer className="progress-bar-container">
              <ProgressBar
                style={{
                  width: `${shouldExceed ? progressPercentage : progressPercentage * 0.75}%`,
                  backgroundColor: progressColor,
                }}
              />
            </ProgressBarContainer>
          </DailyIntake>
        </HoverTransitionContainer>
      </TodayStatsWrapper>

      <AvgStatsWrapper
        className="avg-stats-wrapper"
        $hidden={!!hoveredLog}
      >
        <AvgIntake
          className="avg-intake"
          style={{
            '--avg-color': avgColor
          } as React.CSSProperties}
        >
          {avgIntake.toFixed(0)} {units.toLowerCase()}
        </AvgIntake>
      </AvgStatsWrapper>
    </DashboardRow>
  );
}

export {NutrientDashboard, NutrientStatsProps}
