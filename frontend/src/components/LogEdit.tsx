import React, { useState, useEffect, useRef, KeyboardEvent } from 'react'
import {request} from './endpoints';
import { tutorialEvent } from './TryTutorial';
import YesOk from '../assets/images/check_circle.svg?react'
import IsOk from '../assets/images/checkmark.svg?react'
import Trashcan from '../assets/images/trashcan.svg?react'
import { CalendarDay} from './DateSelector';
import { getFoodID } from './utlis';
import { tolocalDateString } from './utlis'
import { useRecoilValue } from 'recoil';
import { useRefreshLogs } from './dashboard_states';
import { foodsAtom } from './account_states';
import {
  EditFormContainer, FormDropdownWrapper, EditEntryFormBubble,
  EditInputFoodName, EditInputPortion, EditGramsDisplay, EditInputDate, EditInputTimeWrapper,
  SuggestionsContainer, SuggestionsList, SuggestionItem,
  DeleteLogButtonContainer, DeleteLogBtn,
  EditLogSubmitContainer, EditLogSubmitBtn,
  CalendarDropdownWrapper,
} from './EditLogStyles';
import { FoodNameSpace, FoodPortionSpace, FoodWeightSpace, FoodDateSpace, FoodTimeSpace } from './LogStyles';

interface LogProps {
  food_name: string;
  date: Date;
  amount?: string;
  weight_in_grams: number;
  _id: string;
  componentIndex?: number; // Optional: index of component being edited
  recipeId?: string | null; // Optional: recipe ID if this component belongs to a recipe
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
  onCancel?: () => void; // Optional: callback to cancel editing
}

function EditLogForm({food_name, date, amount, weight_in_grams, _id, componentIndex, recipeId, onAnimationStart, onAnimationEnd, onCancel} : LogProps){

  const [deleted, setDeleted] = useState(false)
  const [formData, setFormData] = useState({
    food_name : food_name,
    food_id: null as string | null, // Store the food_id from autocomplete
    amount: amount || `${weight_in_grams}g`,
    weight_in_grams : String(weight_in_grams),
    date : date,
  })
  const [isSubmitting, setIsSubmitting] = useState(false); // Track submission animation state
  const [isDeleting, setIsDeleting] = useState(false); // Track deletion animation state

  const refreshLogs = useRefreshLogs();
  // Ref always holds the latest formData so submit handler never reads stale state
  const formDataRef = useRef(formData);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null); // Timer for debouncing autocomplete

  const [suggestions, setSuggestions] = useState<Array<{food_id: string, food_name: string}>>([]); // State for filtered suggestions
  const [showSuggestions, setShowSuggestions] = useState(false); // Control the visibility of suggestions
  const [showCalendar, setShowCalendar] = useState(false)
  const [validInput, markValidInput] = useState(true)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1); // Track selected suggestion

  // Create a ref for the suggestions container
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Auto-adjust textarea height based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [formData.food_name]);

  // Reset selected suggestion index when suggestions change
  useEffect(() => {
    setSelectedSuggestionIndex(suggestions.length > 0 ? 0 : -1);
  }, [suggestions]);

  // Scroll selected suggestion into view when selection changes
// Scroll selected suggestion into view when selection changes
useEffect(() => {
  if (selectedSuggestionIndex >= 0 && suggestionsRef.current) {
    const suggestionsContainer = suggestionsRef.current;
    const selectedElement = suggestionsContainer.querySelector(`.suggestion-item:nth-child(${selectedSuggestionIndex + 1})`) as HTMLElement;
    
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

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Prevent events from bubbling up to parent, except for mouseLeave
  const handleMouseEvent = (e: React.MouseEvent) => {
    // Don't stop propagation for mouseLeave events
    if (e.type !== 'mouseleave') {
      e.stopPropagation();
    }
  };


  const handleAdvancedSearch = async (value: string) => {
    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    try {
      const response = await request('/match/autocomplete' + '?prompt=' + value, 'POST', {}, 'JSON');
      if (response.body) {
        setSuggestions(response.body);
        setShowSuggestions(value.length > 0 && response.body.length > 0);
        markValidInput(response.body.some((item: {food_id: string, food_name: string}) => item.food_name === value));
      }
    } catch (error) {
      console.error('Error fetching autocomplete suggestions:', error);
      setSuggestions([]);
      setShowSuggestions(false);
      markValidInput(false);
    }
  };
  
  // Handle keyboard navigation for suggestions
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!showSuggestions) return;
    
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleAdvancedSearch(formData.food_name);
      return;
    }
    
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
        // If suggestions are shown and one is selected, select it
        if (showSuggestions && selectedSuggestionIndex >= 0) {
          e.preventDefault();
          handleSuggestionClick(suggestions[selectedSuggestionIndex]);
        }
        // Otherwise, let the form submit normally
        break;
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        // Allow these to work normally for cursor movement
        break;
    }
  };

  // Prevent Enter key from creating new lines in textarea
  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Call the general key handler first
    handleKeyDown(e);
    
    // Prevent Enter from creating a new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      
      // If no suggestions are shown or none selected, submit the form
      if (!showSuggestions || selectedSuggestionIndex < 0) {
        // Get the form element directly from the event target
        const form = (e.target as HTMLTextAreaElement).closest('form') as HTMLFormElement;
        if (form) {
          // Use submit() instead of requestSubmit() for better browser compatibility
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      }
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    
    try {
      const newTime = e.target.value; // e.g., "14:30" (HH:mm format)
    
      // Split the new time into hours and minutes
      const [hours, minutes] = newTime.split(':').map(Number);
    
      if (isNaN(hours) || isNaN(minutes) || hours > 12 || minutes > 59) {
        console.log("Invalid Time");
        return; // Exit the function if the date is invalid
      }

      // Update the date directly using a copy of formData.date
      const updatedDate = new Date(formData.date);
      updatedDate.setHours(hours);
      updatedDate.setMinutes(minutes);
      updatedDate.setSeconds(0); // Reset seconds to zero
    
      // Update the formData state
      setFormData({
        ...formData,
        date: updatedDate, // Convert it back to an ISO string for consistency
      });
    }
    catch{}
  };


  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(date.getDate()).padStart(2, '0');
  
    return `${year}-${month}-${day}`;
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try{
      const newDate = e.target.value; // e.g., "2024-10-24" (YYYY-MM-DD format)
      
      // Split the new date into year, month, and day
      const [year, month, day] = newDate.split('-').map(Number);

      if (day < 1 || day > 31 || month < 1 || month > 12) {
        console.log("Invalid Date");
        return; // Exit the function if the date is invalid
      }
    
      // Update the date directly using a copy of formData.date
      const updatedDate = new Date(formData.date);
    
      // Set the year, month (note: month is 0-indexed in JavaScript), and day
      updatedDate.setFullYear(year);
      updatedDate.setMonth(month - 1); // Subtract 1 because months are 0-indexed
      updatedDate.setDate(day);
    
      // Update the formData state
      setFormData({
        ...formData,
        date: updatedDate,
      });
    }
    catch {}
  };

  


  const handleTyping = async (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    setFormData(prevData => {
      const next = { ...prevData, [name]: value };
      formDataRef.current = next;
      return next;
    });

    if (name === 'food_name') {
      // Clear any existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Use RRF-based autocomplete for better food matching
      if (!value.trim()) {
        setSuggestions([]);
        setShowSuggestions(false);
        markValidInput(false);
        return;
      }

      // Set a new debounce timer (300ms delay)
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const response = await request('/match/autocomplete' + '?prompt=' + value, 'POST', {}, 'JSON');
          if (response.body) {
            setSuggestions(response.body);
            setShowSuggestions(value.length > 0 && response.body.length > 0);
            markValidInput(response.body.some((item: {food_id: string, food_name: string}) => item.food_name === value));
          }
        } catch (error) {
          console.error('Error fetching autocomplete suggestions:', error);
          setSuggestions([]);
          setShowSuggestions(false);
          markValidInput(false);
        }
      }, 300); // 300ms debounce delay
    }
  };

  const handleSuggestionClick = (suggestion: {food_id: string, food_name: string}) => {
    markValidInput(true);
    // Cancel any pending debounce so stale results don't re-show the dropdown
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const updated = { ...formDataRef.current, food_name: suggestion.food_name, food_id: suggestion.food_id };
    formDataRef.current = updated;
    setFormData(updated);
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault() // prevent automatic submission
    e.stopPropagation(); // prevent event from bubbling up

    // Start the submission animation
    setIsSubmitting(true);

    // Notify parent component that animation has started
    if (onAnimationStart) {
      onAnimationStart();
    }

    // Add a delay to show the animation before submitting
    setTimeout(async () => {
      const current = formDataRef.current;
      const formDataObj = new FormData();
      formDataObj.append('log_id', _id);
      formDataObj.append('food_name', current.food_name);
      formDataObj.append('amount', current.amount);

      // If we have a food_id from autocomplete, pass it to the backend
      if (current.food_id) {
        formDataObj.append('food_id', current.food_id);
      }

      let response;

      // Check if we're editing a component or updating a log portion
      if (componentIndex !== undefined) {
        // Editing a component within a log
        formDataObj.append('component_index', String(componentIndex));
        response = await request('/logs/edit-component', 'POST', formDataObj);
        tutorialEvent('tutorial:component-added');
      } else {
        // Updating the entire log portion (legacy behavior)
        response = await request('/logs/update-portion', 'POST', formDataObj);
      }

      // If successful, update the grams in local state
      if (response.status === 200 && response.body) {
        setFormData(prev => ({
          ...prev,
          weight_in_grams: String(response.body.weight_in_grams)
        }));
      }

      refreshLogs();

      // Reset the submission state after a short delay to show the animation
      setTimeout(() => {
        setIsSubmitting(false);

        // Notify parent component that animation has ended
        if (onAnimationEnd) {
          onAnimationEnd();
        }

        // If we have an onCancel callback, call it to close edit mode
        if (onCancel) {
          onCancel();
        }
      }, 500);
    }, 800); // Delay before actual submission
  }

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault() // prevent automatic submission
    e.stopPropagation(); // prevent event from bubbling up
    
    // Start the deletion animation
    setIsDeleting(true);
    
    // Notify parent component that animation has started
    if (onAnimationStart) {
      onAnimationStart();
    }
    
    // Add a delay to show the animation before actually deleting
    setTimeout(async () => {
      await request(`/logs/delete?log_id=${_id}`, 'DELETE')
      console.log("Log deleted successfully");
      setDeleted(true)
      refreshLogs()
      setFormData({ ...formData, food_name: '', weight_in_grams : ''})
      
      // Reset the deletion state (though it won't be visible anymore)
      setIsDeleting(false);
      
      // Notify parent component that animation has ended
      if (onAnimationEnd) {
        onAnimationEnd();
      }
    }, 500); // Delay before actual deletion
  }

  const handleSelect = (date: Date) => {
    setFormData({...formData, date : date});
  };

  return (
    !deleted ? (
      <EditFormContainer
        id="edit-log-form"
        $submitting={isSubmitting}
        $deleting={isDeleting}
        onSubmit={handleSubmit}
        onMouseEnter={handleMouseEvent}
        onMouseLeave={handleMouseEvent}
        onMouseOver={handleMouseEvent}
        onMouseMove={handleMouseEvent}
        onClick={handleMouseEvent}
      >
        <DeleteLogButtonContainer $hide={isSubmitting}>
          <DeleteLogBtn type="button" onClick={handleDelete}>
            <Trashcan/>
          </DeleteLogBtn>
        </DeleteLogButtonContainer>

        <FormDropdownWrapper>
          <EditEntryFormBubble $active={showSuggestions}>
            <FoodNameSpace>
              <EditInputFoodName
                ref={textareaRef}
                name='food_name'
                placeholder='food'
                value={formData.food_name}
                onChange={handleTyping}
                onKeyDown={handleTextareaKeyDown}
                required
              />
            </FoodNameSpace>

            <FoodPortionSpace>
              <EditInputPortion
                name='amount'
                type='text'
                placeholder='1 cup'
                value={formData.amount}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
                required
              />
            </FoodPortionSpace>

            <FoodWeightSpace>
              {formData.weight_in_grams && (
                <EditGramsDisplay>
                  {Math.round(Number(formData.weight_in_grams))}g
                </EditGramsDisplay>
              )}
            </FoodWeightSpace>

            <FoodDateSpace>
              <EditInputDate
                name='date'
                type='date'
                onChange={handleDateChange}
                onKeyDown={handleKeyDown}
                value={formatDate(formData.date)}
                required
              />
            </FoodDateSpace>

            <FoodTimeSpace>
              <EditInputTimeWrapper>
                <input
                  name='time'
                  type='time'
                  onChange={handleTimeChange}
                  onKeyDown={handleKeyDown}
                  value={`${String(formData.date.getHours()).padStart(2, '0')}:${String(formData.date.getMinutes()).padStart(2, '0')}`}
                  required
                />
              </EditInputTimeWrapper>
            </FoodTimeSpace>
          </EditEntryFormBubble>

          {showSuggestions && (
            <SuggestionsContainer ref={suggestionsRef}>
              <SuggestionsList
                onMouseEnter={handleMouseEvent}
                onMouseLeave={handleMouseEvent}
                onMouseOver={handleMouseEvent}
                onMouseMove={handleMouseEvent}
              >
                {suggestions.map((suggestion, index) => (
                  <SuggestionItem
                    key={suggestion.food_id}
                    $selected={index === selectedSuggestionIndex}
                    onClick={() => handleSuggestionClick(suggestion)}
                    onMouseEnter={() => setSelectedSuggestionIndex(index)}
                  >
                    {suggestion.food_name}
                  </SuggestionItem>
                ))}
              </SuggestionsList>
            </SuggestionsContainer>
          )}

          {showCalendar && (
            <CalendarDropdownWrapper
              onMouseEnter={handleMouseEvent}
              onMouseLeave={handleMouseEvent}
              onMouseOver={handleMouseEvent}
              onMouseMove={handleMouseEvent}
            >
              <CalendarDay
                day={date}
                handleSelect={handleSelect}
                isOpen={showCalendar}
                setIsOpen={setShowCalendar}
              />
            </CalendarDropdownWrapper>
          )}
        </FormDropdownWrapper>

        <EditLogSubmitContainer>
          <EditLogSubmitBtn
            type="submit"
            $confirming={isSubmitting}
            disabled={!formData.food_name || !formData.amount || !validInput || isSubmitting}
            childrenOn={<YesOk/>}
            childrenOff={<IsOk/>}
          />
        </EditLogSubmitContainer>
      </EditFormContainer>
    ) :
    <div />
  )

}

export {EditLogForm}