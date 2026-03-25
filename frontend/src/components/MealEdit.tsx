import React, { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion';
import {request} from './endpoints';
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
  EditInputFoodName, EditInputPortion, EditInputDate, EditInputTimeWrapper,
  SuggestionsContainer, SuggestionsList, SuggestionItem,
  DeleteLogButtonContainer, DeleteLogBtn,
  EditLogSubmitContainer, EditLogSubmitBtn,
  CalendarDropdownWrapper,
} from './EditLogStyles';
import { FoodNameSpace, FoodPortionSpace, FoodWeightSpace, FoodDateSpace, FoodTimeSpace } from './LogStyles';

interface MealProps {
  meal_name: string;
  date: Date;
  servings: number;
  _id: string;
  totalWeightGrams?: number;
  onCancel: () => void;
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
  onDeleteStart?: () => void;
}

function MealEdit({meal_name, date, servings, _id, totalWeightGrams, onCancel, onAnimationStart, onAnimationEnd, onDeleteStart} : MealProps){

  // Mock food data for autocomplete
  const foodList = useRecoilValue(foodsAtom)
  const [deleted, setDeleted] = useState(false)
  const weightPerServing = (totalWeightGrams && servings > 0) ? totalWeightGrams / servings : null;
  const [formData, setFormData] = useState({
    meal_name : meal_name,
    servings: String(servings),
    date : date,
  })
  const [weightInput, setWeightInput] = useState(
    totalWeightGrams != null ? String(Math.round(totalWeightGrams)) : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false); // Track submission animation state
  const [isDeleting, setIsDeleting] = useState(false); // Track deletion animation state

  const refreshLogs = useRefreshLogs();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [suggestions, setSuggestions] = useState<string[]>([]); // State for filtered suggestions
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
  }, [formData.meal_name]);

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
        markValidInput(response.body.includes(value));
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
      handleAdvancedSearch(formData.meal_name);
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
        return;
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
        return;
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

    setFormData(prevData => ({
      ...prevData,
      [name]: value,
    }));

    if (name === 'servings' && weightPerServing != null) {
      const parsed = parseFloat(value);
      if (!isNaN(parsed) && parsed > 0) {
        setWeightInput(String(Math.round(parsed * weightPerServing)));
      }
    }

    if (name === 'food_name') {
      markValidInput(value in foodList)
      // Filter the foodList to match the input value
      const filteredFoods = Object.keys(foodList).filter(food =>
        food.toLowerCase().includes(value.toLowerCase())
      );

      // Show suggestions only if there are matches and the input isn't empty
      setSuggestions(filteredFoods);
      setShowSuggestions(value.length > 0 && filteredFoods.length > 0);
    }
  };

  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWeightInput(value);
    if (weightPerServing != null && weightPerServing > 0) {
      const parsed = parseFloat(value);
      if (!isNaN(parsed) && parsed > 0) {
        const newServings = parsed / weightPerServing;
        setFormData(prev => ({ ...prev, servings: newServings.toFixed(2).replace(/\.?0+$/, '') }));
      }
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    markValidInput(true)
    // Update the formData with the selected suggestion
    setFormData({
      ...formData,
      meal_name: suggestion,
    });
    setShowSuggestions(false); // Hide suggestions after selection
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
      // Create form data for recipe log update
      const formDataObj = new FormData();
      formDataObj.append('log_id', _id);
      formDataObj.append('servings', formData.servings);
      formDataObj.append('date', formData.date.toISOString());

      // Call edit-recipe-log endpoint
      await request('/logs/edit-recipe-log', 'POST', formDataObj);

      refreshLogs();

      // Reset the submission state after a short delay to show the animation
      setTimeout(() => {
        setIsSubmitting(false);

        // Notify parent component that animation has ended
        if (onAnimationEnd) {
          onAnimationEnd();
        }
        onCancel();
      }, 500);
    }, 800); // Delay before actual submission
  }

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault() // prevent automatic submission
    e.stopPropagation(); // prevent event from bubbling up
    
    // Start the deletion animation
    setIsDeleting(true);

    // Notify parent to animate the whole group out
    if (onDeleteStart) onDeleteStart();

    // Notify parent component that animation has started
    if (onAnimationStart) {
      onAnimationStart();
    }
    
    // Add a delay to show the animation before actually deleting
    setTimeout(async () => {
      await request(`/logs/delete?log_id=${_id}`, 'DELETE')
      setDeleted(true)
      refreshLogs()
      setFormData({ ...formData, meal_name: ''})
      
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
                value={formData.meal_name}
                onChange={handleTyping}
                onKeyDown={handleTextareaKeyDown}
                required
              />
            </FoodNameSpace>

            <FoodPortionSpace style={{gap: '6px', alignItems: 'baseline'}}>
              <EditInputPortion
                name='servings'
                type='text'
                placeholder='1'
                value={formData.servings}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
                style={{width: `${Math.max(String(formData.servings).length, 1) + 1}ch`, flexShrink: 0}}
                required
              />
              <span> servings </span>
            </FoodPortionSpace>

            <FoodWeightSpace style={{gap: '4px', alignItems: 'baseline'}}>
              {weightPerServing != null && (
                <>
                  <EditInputPortion
                    type='number'
                    min='0'
                    placeholder='0000'
                    value={weightInput}
                    onChange={handleWeightChange}
                    onKeyDown={handleKeyDown}
                    style={{width: `${Math.max(weightInput.length, 4) + 1}ch`, flexShrink: 0}}
                  />
                  <span> g </span>
                </>
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

          <AnimatePresence>
            {showSuggestions && (
              <motion.div
                key="suggestions"
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              >
                <SuggestionsContainer ref={suggestionsRef}>
                  <SuggestionsList
                    onMouseEnter={handleMouseEvent}
                    onMouseLeave={handleMouseEvent}
                    onMouseOver={handleMouseEvent}
                    onMouseMove={handleMouseEvent}
                  >
                    {suggestions.map((suggestion, index) => (
                      <SuggestionItem
                        key={suggestion}
                        $selected={index === selectedSuggestionIndex}
                        onClick={() => handleSuggestionClick(suggestion)}
                        onMouseEnter={() => setSelectedSuggestionIndex(index)}
                      >
                        {suggestion}
                      </SuggestionItem>
                    ))}
                  </SuggestionsList>
                </SuggestionsContainer>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showCalendar && (
              <motion.div
                key="calendar"
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </FormDropdownWrapper>

        <EditLogSubmitContainer>
          <EditLogSubmitBtn
            type="submit"
            $confirming={isSubmitting}
            disabled={!formData.meal_name || !formData.servings || !validInput || isSubmitting}
            childrenOn={<YesOk/>}
            childrenOff={<IsOk/>}
          />
        </EditLogSubmitContainer>
      </EditFormContainer>
    ) :
    <div />
  )

}

export {MealEdit}