import { useState, useEffect, useRef, startTransition} from 'react';
import { calculateColor, formatDayForFrontend} from './utlis';
import { ImageButton } from './Sections';
import AddLogButton from '../assets/images/plus.svg?react'
import '../assets/css/NutrientStats.css'; // Import your CSS file for styling
import {useRecoilValue, useRecoilValueLoadable} from 'recoil'
import { currentDayAtom, hoveredLogAtom, rowData} from './dashboard_states';
import { requirementsAtom, RequirementData, requirementsDataAtom, dayIntake, averageIntake } from './dashboard_states';
import { NewNutrientForm } from './EditNutrientForm';


interface NutrientInfoData {
  name: string;
  amount: number;
  units: string;
}

interface NutrientPanelData{
  nutrients: NutrientInfoData[];
}

function EditNutrientInfo({ original }: { original?: NutrientInfoData }): React.ReactNode{

  const nutrientList = useRecoilValue(nutrientDetailsByNameAtom)

  const [formData, setFormData] = useState({
    nutrient_name : original ? original.name : '',
    requirement : original ? String(original.target) : '',
    should_exceed : original ? original.shouldExceed : true,
  })

  const [suggestions, setSuggestions] = useState<string[]>([]); // State for filtered suggestions
  const [showSuggestions, setShowSuggestions] = useState(false); // Control the visibility of suggestions
  const [validInput, markValidInput] = useState(true)
  const [isDeleted, setIsDeleted] = useState(false)
  const refreshRequirements = useRefreshRequirements()

  // Handle key down events for inputs
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // If Enter is pressed and not in the middle of selecting a suggestion
    if (e.key === 'Enter' && (!showSuggestions || suggestions.length === 0)) {
      e.preventDefault();
      
      // Check if form is valid before submitting
      if (formData.nutrient_name && formData.requirement && validInput) {
        // Call the submission logic directly
        submitForm();
      }
    }
  };

  // Extract the submission logic to a separate function
  const submitForm = async () => {
    let requestData = {
      nutrient_id: getNutrientInfo(formData.nutrient_name, false, nutrientList),
      amt: parseFloat(formData.requirement),
      should_exceed: Boolean(formData.should_exceed)
    }
    let response = await request('/requirements/new','POST', requestData, 'JSON')
    refreshRequirements();
  }

  // Handler for the comparison select element
  const handleComparisonChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setFormData((prevFormData) => ({
      ...prevFormData,
      should_exceed: value === 'more'
    }));
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {

    const {name, value} = e.target; // get the name and value of the input field

    // console.log(`Updating ${name} with value: ${value}`); // Debugging log

    setFormData({
      ...formData,
      [name] : value, // this works because the form variables match the names of the input fields
    })

    //for the food name input
    if (name === 'nutrient_name') { 
      markValidInput(value in nutrientList)
      // Filter the foodList to match the input value
      const filteredNutrients = Object.keys(nutrientList).filter(n =>
        n.toLowerCase().includes(value.toLowerCase())
      );

      // Show suggestions only if there are matches and the input isn't empty
      setSuggestions(filteredNutrients);
      setShowSuggestions(value.length > 0 && filteredNutrients.length > 0);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    markValidInput(true)
    // Update the formData with the selected suggestion
    setFormData({
      ...formData,
      nutrient_name: suggestion,
    });
    setShowSuggestions(false); // Hide suggestions after selection
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    console.log("submitting")
    e.preventDefault() // prevent automatic submission
    await submitForm();
  }

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault() // prevent automatic submission
    const nutrientId = getNutrientInfo(formData.nutrient_name, false, nutrientList);

    const response = await request(`/requirements/delete?requirement_id=${nutrientId}`, 'DELETE');

    if (response.status === 200) {
      await refreshRequirements();
      setIsDeleted(true);
      setFormData({ ...formData, nutrient_name: '', requirement : ''});
    } else {
      console.error("Failed to delete requirement:", response);
    }
  }

  return (
    !isDeleted && (
    <form
      id="new-nutrient-form" className = {`new-nutrient-wrapper ${showSuggestions ? 'active' : ''}`} onSubmit={handleSubmit}>
      <div className={`nutrient-form-bubble ${showSuggestions ? 'active' : ''}`}>
      <div className = 'delete-requirement-button-container'>
      {original && (
        <ImageButton
                type= "button"
                onClick= {handleDelete}
                className= "delete-button"
                children= {<Trashcan/>}>
        </ImageButton> )}
      </div>
      
      <div className= 'new-nutrient-name-wrapper'>
        <input
          name='nutrient_name'
          className = 'new-requirement-nutrient-name'
          placeholder='nutrient'
          value = {formData.nutrient_name}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
          required
        ></input>
      </div>

      <div className="nutrient-type-select-wrapper">
        <select name="comparison" className="custom-select" onChange={handleComparisonChange}
        value={formData.should_exceed ? 'more' : 'less'}>
          <option value="less">less than</option>
          <option value="more">more than</option>
        </select>
      </div>

      <div className="input-requirement-amt-wrapper">
        <input
          name='requirement'
          className = 'input-requirement-amt'
          type = 'number'
          placeholder='0'
          value = {formData.requirement}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
          required
        ></input>
        <span className="nutrient-unit">
          {formData.nutrient_name && validInput && getNutrientInfo(formData.nutrient_name, true, nutrientList)}
        </span>
      </div>

      
      <div className = 'new-nutrient-button-container'>
      {(formData.nutrient_name && formData.requirement && validInput) && (
      <HoverButton
              type="submit"
              className="new-nutrient-button"
              childrenOn={<Ok/>}
              childrenOff={<OkOk/>}>
      </HoverButton>)}
      </div> 
  

      </div>
      {showSuggestions && (
            <ul className="nutrient-suggestions-list">
              {suggestions.map(suggestion => (
                <li key={suggestion}
                    className="nutrient-suggestion-item"
                    onClick={() => handleSuggestionClick(suggestion)}>
                  {suggestion}
                </li>
              ))}
            </ul>
          )}
    </form>))
}


function NutrientPanel(food_name : string, nutrients : NutrientPanelData[]){
  /* for add nutrient requirement button */
  const [editing, setEditing] = useState<boolean>(false)
  const editFormRef = useRef<HTMLDivElement>(null); 
  const [nutrientsData, setNutrientsData] = useState<NutrientPanelData>({nutrients: []});
    
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
      <NutrientPanelTitle/>
        <div className = 'requirement-edit-wrapper' ref = {editFormRef}>
            (<div className='nutrient-edit-list-wrapper'>
              {nutrients.length > 0 && 
              nutrients.map((n, index) => 
                {return(
                  <NewNutrientForm
                    key={n.name}  // Using index as a key. Ideally, use a unique id if available.
                    original={n}/>);
                })
              }
              <NewNutrientForm/>
            </div> )
        </div> 
    </div>
  )
}


function NutrientPanelTitle(food_name: string){
  return <div className='dashboard-row'>
    <div className = 'nutrient-name-wrapper'>
      <div className = 'nutrient-dashboard-title'> target </div>
    </div>
    <div className='avg-stats-wrapper'>
      <div className = 'nutrient-dashboard-title'> average </div>
    </div>
  </div>
}



const NutrientStats = ({requirements} : {requirements : RequirementData[]}) => {
  const hoveredLog = useRecoilValue(hoveredLogAtom);
  
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
  }, [day, hoveredLog]);

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
      <div className="avg-stats-wrapper">
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