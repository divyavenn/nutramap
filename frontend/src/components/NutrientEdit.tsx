import React, {useState, useEffect, useRef } from 'react'
import {request } from './endpoints';
import { Nutrient } from './structures';
import { getNutrientInfo } from './utlis';
import { useRefreshRequirements } from './dashboard_states';
import { nutrientDetailsByNameAtom } from './account_states';
import { useRecoilValue } from 'recoil';
import { tutorialEvent } from './TryTutorial';
import {
  NewNutrientWrapper,
  NutrientFormBubble,
  NewNutrientNameWrapper,
  NewRequirementNutrientName,
  NutrientTypeSelectWrapper,
  CustomSelect,
  InputRequirementAmtWrapper,
  InputRequirementAmt,
  DeleteRequirementButtonContainer,
  DeleteXButton,
  NutrientSuggestionsList,
  NutrientSuggestionItem,
} from './NutrientEdit.styled';

function NewNutrientForm({ original }: { original?: Nutrient }): React.ReactNode{

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
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);
  const refreshRequirements = useRefreshRequirements()
  const suggestionsRef = useRef<HTMLUListElement>(null);

  // Reset selected suggestion index when suggestions change
  useEffect(() => {
    setSelectedSuggestionIndex(suggestions.length > 0 ? 0 : -1);
  }, [suggestions]);

  // Scroll selected suggestion into view when selection changes
  useEffect(() => {
    if (selectedSuggestionIndex >= 0 && suggestionsRef.current) {
      const suggestionsContainer = suggestionsRef.current;
      const selectedElement = suggestionsContainer.children[selectedSuggestionIndex] as HTMLElement;

      if (selectedElement) {
        // Calculate if the element is outside the visible area
        const containerTop = suggestionsContainer.scrollTop;
        const containerBottom = containerTop + suggestionsContainer.clientHeight;
        const elementTop = selectedElement.offsetTop;
        const elementBottom = elementTop + selectedElement.offsetHeight;

        // Scroll if the element is not fully visible
        if (elementTop < containerTop) {
          // Element is above visible area
          suggestionsContainer.scrollTop = elementTop;
        } else if (elementBottom > containerBottom) {
          // Element is below visible area
          suggestionsContainer.scrollTop = elementBottom - suggestionsContainer.clientHeight;
        }
      }
    }
  }, [selectedSuggestionIndex]);

  // Handle keyboard navigation for nutrient name input
  const handleNutrientNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) {
      // No suggestions showing, just submit on Enter
      if (e.key === 'Enter') {
        e.preventDefault();
        if (formData.nutrient_name && formData.requirement && validInput) {
          submitForm();
        }
      }
      return;
    }

    // Handle navigation when suggestions are showing
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev =>
          prev > 0 ? prev - 1 : prev
        );
        break;
      case 'Tab':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          handleSuggestionClick(suggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Enter':
        e.preventDefault();
        // If a suggestion is selected, use it
        if (selectedSuggestionIndex >= 0) {
          handleSuggestionClick(suggestions[selectedSuggestionIndex]);
        } else if (validInput && formData.requirement) {
          // Otherwise, submit if valid
          submitForm();
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        break;
    }
  };

  // Handle Enter key on requirement input
  const handleRequirementKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (formData.nutrient_name && formData.requirement && validInput) {
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
    tutorialEvent('tutorial:nutrient-added');
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

    setFormData({
      ...formData,
      [name] : value, // this works because the form variables match the names of the input fields
    })

    //for the nutrient name input
    if (name === 'nutrient_name') {
      markValidInput(value in nutrientList)
      // Filter the nutrientList to match the input value
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
    <NewNutrientWrapper
      id="new-nutrient-form"
      $active={showSuggestions}
      onSubmit={handleSubmit}
    >
      <NutrientFormBubble $active={showSuggestions} $newEntry={!original}>

        <NewNutrientNameWrapper>
          <NewRequirementNutrientName
            name='nutrient_name'
            placeholder='nutrient'
            value={formData.nutrient_name}
            onChange={handleTyping}
            onKeyDown={handleNutrientNameKeyDown}
            required
          />
        </NewNutrientNameWrapper>

        <NutrientTypeSelectWrapper>
          <CustomSelect
            name="comparison"
            onChange={handleComparisonChange}
            value={formData.should_exceed ? 'more' : 'less'}
          >
            <option value="less">less than</option>
            <option value="more">more than</option>
          </CustomSelect>
        </NutrientTypeSelectWrapper>

        <InputRequirementAmtWrapper>
          <InputRequirementAmt
            name='requirement'
            type='number'
            placeholder='0'
            value={formData.requirement}
            onChange={handleTyping}
            onKeyDown={handleRequirementKeyDown}
            required
          />
          <span>
            {formData.nutrient_name && validInput && getNutrientInfo(formData.nutrient_name, true, nutrientList)}
          </span>
          <span>a day</span>
        </InputRequirementAmtWrapper>

        <DeleteRequirementButtonContainer>
          {original && (
            <DeleteXButton type="button" onClick={handleDelete} aria-label="Delete">
              ×
            </DeleteXButton>
          )}
        </DeleteRequirementButtonContainer>

      </NutrientFormBubble>

      {showSuggestions && (
        <NutrientSuggestionsList ref={suggestionsRef}>
          {suggestions.map((suggestion, index) => (
            <NutrientSuggestionItem
              key={suggestion}
              $selected={index === selectedSuggestionIndex}
              onClick={() => handleSuggestionClick(suggestion)}
              onMouseEnter={() => setSelectedSuggestionIndex(index)}
            >
              {suggestion}
            </NutrientSuggestionItem>
          ))}
        </NutrientSuggestionsList>
      )}
    </NewNutrientWrapper>))
}

export  {NewNutrientForm}
