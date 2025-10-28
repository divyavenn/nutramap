import React, { useState, useEffect, useRef, KeyboardEvent } from 'react'
import {request} from './endpoints';

import '../assets/css/variables.css';
import { useRefreshLogs } from './dashboard_states';
import * as S from './EditIngredient.styled';

interface Props {
  food_name: string;
  amount: string;
  weight_in_grams: number;
  componentIndex?: number; // Optional: index of component being edited
  recipeId?: string; // Optional: recipe ID if this component belongs to a recipe
  onSave?: () => void; // Optional: callback when save is successful
  onDelete?: () => void; // Optional: callback when delete is successful
  onCancel?: () => void; // Optional: callback when editing is cancelled
}

function EditIngredientForm({food_name, amount, weight_in_grams, componentIndex, recipeId, onSave, onDelete, onCancel} : Props){

  const [deleted, setDeleted] = useState(false)
  const [formData, setFormData] = useState({
    food_name : food_name,
    amount: amount || `${weight_in_grams}g`,
    weight_in_grams : String(weight_in_grams),
  })
  const [isSubmitting, setIsSubmitting] = useState(false); // Track submission animation state
  const [isDeleting, setIsDeleting] = useState(false); // Track deletion animation state

  const refreshLogs = useRefreshLogs();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null); // Timer for debouncing autocomplete

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


  const handleTyping = async (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    setFormData(prevData => ({
      ...prevData,
      [name]: value,
    }));

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
            markValidInput(response.body.includes(value));
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

  const handleSuggestionClick = (suggestion: string) => {
    markValidInput(true)
    // Update the formData with the selected suggestion
    setFormData({
      ...formData,
      food_name: suggestion,
    });
    setShowSuggestions(false); // Hide suggestions after selection
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault() // prevent automatic submission
    e.stopPropagation(); // prevent event from bubbling up

    // Start the submission animation
    setIsSubmitting(true);


    // Add a delay to show the animation before submitting
    setTimeout(async () => {
      const formDataObj = new FormData();
      formDataObj.append('food_name', formData.food_name);
      formDataObj.append('amount', formData.amount);

      let response;

      // Check if we're editing a recipe ingredient or a log component
      if (recipeId) {
        // Editing a recipe ingredient
        formDataObj.append('recipe_id', recipeId);
        formDataObj.append('component_index', String(componentIndex));
        response = await request('/recipes/edit-ingredient', 'POST', formDataObj);
      } else if (componentIndex !== undefined) {
        // Editing a component within a log
        formDataObj.append('component_index', String(componentIndex));
        response = await request('/logs/edit-component', 'POST', formDataObj);
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

      // Call optional onSave callback if provided
      if (onSave) {
        onSave();
      }

      // Reset the submission state after a short delay to show the animation
      setTimeout(() => {
        setIsSubmitting(false);
      }, 500);
    }, 800); // Delay before actual submission
  }

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault() // prevent automatic submission
    e.stopPropagation(); // prevent event from bubbling up
    
    // Start the deletion animation
    setIsDeleting(true);
    
    
    // Add a delay to show the animation before actually deleting
    setTimeout(async () => {
      // Check if we're deleting a recipe ingredient or a log
      if (recipeId) {
        // Deleting a recipe ingredient
        await request(`/recipes/delete-ingredient?recipe_id=${recipeId}&component_index=${componentIndex}`, 'DELETE');
        console.log("Recipe ingredient deleted successfully");
      } else {
        // Deleting a log
        await request(`/logs/delete?log_id=`, 'DELETE');
        console.log("Log deleted successfully");
      }
      setDeleted(true)
      refreshLogs()

      // Call optional onDelete callback if provided
      if (onDelete) {
        onDelete();
      }

      setFormData({ ...formData, food_name: '', weight_in_grams : ''})

      // Reset the deletion state (though it won't be visible anymore)
      setIsDeleting(false);

    }, 500); // Delay before actual deletion
  }
;

  return (
    !deleted ? (
      <S.FormContainer
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

        <S.FormDropdownWrapper>
          <S.IngredientBubble $active={showSuggestions}>
            <S.FoodNameSpace>
              <S.FoodNameInput
                ref={textareaRef}
                name='food_name'
                placeholder='food'
                value={formData.food_name}
                onChange={handleTyping}
                onKeyDown={handleTextareaKeyDown}
                required
              />
            </S.FoodNameSpace>

            <S.FoodPortionSpace>
              <S.PortionInput
                name='amount'
                type='text'
                placeholder='1 cup'
                value={formData.amount}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
                required
              />
            </S.FoodPortionSpace>

            <S.FoodWeightSpace>
                <S.GramsDisplay
                name='weight'
                type='text'
                placeholder='1 cup'
                value={formData.weight_in_grams}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
                required/>
                <S.AlignedText> g </S.AlignedText>
            </S.FoodWeightSpace>

          </S.IngredientBubble>

          {showSuggestions && (
            <S.SuggestionsContainer ref={suggestionsRef}>
              <S.SuggestionsList
                onMouseEnter={handleMouseEvent}
                onMouseLeave={handleMouseEvent}
                onMouseOver={handleMouseEvent}
                onMouseMove={handleMouseEvent}
              >
                {suggestions.map((suggestion, index) => (
                  <S.SuggestionItem
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    $selected={index === selectedSuggestionIndex}
                    onMouseEnter={() => setSelectedSuggestionIndex(index)}
                  >
                    {suggestion}
                  </S.SuggestionItem>
                ))}
              </S.SuggestionsList>
            </S.SuggestionsContainer>
          )}
        </S.FormDropdownWrapper>


        <S.DeleteButtonContainer $hide={isSubmitting}>
          <S.DeleteButton
            type="button"
            onClick={handleDelete}
            aria-label="Delete ingredient"
          >
            ×
          </S.DeleteButton>
        </S.DeleteButtonContainer>
        
      </S.FormContainer>
    ) :
    <div></div>
  )

}

export {EditIngredientForm}