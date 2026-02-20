import React, { useState, useEffect, useRef, KeyboardEvent } from 'react'
import {request} from './endpoints';

import '../assets/css/variables.css';
import { useRefreshLogs } from './dashboard_states';
import * as S from './IngredientEdit.styled';
import { AnimatedText } from './AnimatedText';

interface Props {
  food_name?: string;
  amount?: string;
  weight_in_grams?: number;
  food_id?: string | number; // Optional: food ID to avoid re-matching
  componentIndex?: number; // Optional: index of component being edited
  recipeId: string; 
  onSave?: () => void; // Optional: callback when save is successful
  onDelete?: () => void; // Optional: callback when delete is successful
  onCancel?: () => void; // Optional: callback when editing is cancelled
}

function EditIngredientForm({food_name, amount, weight_in_grams, food_id, componentIndex, recipeId, onSave, onDelete, onCancel} : Props){

  const [deleted, setDeleted] = useState(false)
  const [formData, setFormData] = useState({
    food_name : food_name,
    amount: amount || '' || `${weight_in_grams}g`,
    weight_in_grams : String(weight_in_grams) || '',
    food_id: food_id ? String(food_id) : undefined, // Track the food_id
  })
  const [isSubmitting, setIsSubmitting] = useState(false); // Track submission animation state
  const [isDeleting, setIsDeleting] = useState(false); // Track deletion animation state
  const [isSavingWeight, setIsSavingWeight] = useState(false); // Track weight save animation

  const refreshLogs = useRefreshLogs();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null); // Timer for debouncing autocomplete

  const [suggestions, setSuggestions] = useState<Array<{food_id: string, food_name: string}>>([]); // State for filtered suggestions
  const [showSuggestions, setShowSuggestions] = useState(false); // Control the visibility of suggestions
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1); // Track selected suggestion

  // Create a ref for the suggestions container
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Sync form state with props when they change (e.g., after parent refreshes data)
  useEffect(() => {
    setFormData({
      food_name: food_name,
      amount: amount || '' || `${weight_in_grams}g`,
      weight_in_grams: String(weight_in_grams) || '',
      food_id: food_id ? String(food_id) : undefined,
    });
  }, [food_name, amount, weight_in_grams, food_id]);

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
      }
    } catch (error) {
      console.error('Error fetching autocomplete suggestions:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };
  
  // Handle keyboard navigation for suggestions
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!showSuggestions) return;
    
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleAdvancedSearch(formData.food_name || '');
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

  // Prevent Enter key from creating new lines in textarea
  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Call the general key handler first
    handleKeyDown(e);

    // Prevent Enter from creating a new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();

      // If no suggestions are shown or none selected, submit the form
      if (!showSuggestions || selectedSuggestionIndex < 0) {
        handleSubmit(e as any);
      }
    }
  };

  // Handle Enter key on regular input fields
  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  // Handle Enter key on weight field - submit with manual weight
  const handleWeightKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Trigger blur to save the manual weight
      (e.target as HTMLInputElement).blur();
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
        return;
      }

      // Set a new debounce timer (300ms delay)
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const response = await request('/match/autocomplete' + '?prompt=' + value, 'POST', {}, 'JSON');
          if (response.body) {
            setSuggestions(response.body);
            setShowSuggestions(value.length > 0 && response.body.length > 0);
          }
        } catch (error) {
          console.error('Error fetching autocomplete suggestions:', error);
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }, 300); // 300ms debounce delay
    }
  };

  // Handle blur event on weight input to trigger update
  const handleWeightBlur = async () => {
    // Only submit if we have a valid recipe context
    if (recipeId && componentIndex !== undefined) {
      setIsSavingWeight(true);
      const formDataObj = new FormData();
      formDataObj.append('recipe_id', recipeId);
      formDataObj.append('component_index', String(componentIndex));
      formDataObj.append('food_name', formData.food_name || '');
      formDataObj.append('amount', formData.amount);
      formDataObj.append('weight_in_grams', formData.weight_in_grams);
      if (formData.food_id) {
        formDataObj.append('food_id', formData.food_id); // Send food_id to skip RRF matching
      }

      try {
        const response = await request('/recipes/edit-ingredient', 'POST', formDataObj);

        if (response.status === 200 && response.body) {
          // Update with the confirmed weight from backend
          setFormData(prev => ({
            ...prev,
            weight_in_grams: String(response.body.weight_in_grams)
          }));

          // Notify parent so it refreshes recipe data
          if (onSave) {
            await onSave();
          }

          refreshLogs();
        }
      } catch (error) {
        console.error('Error updating weight:', error);
      } finally {
        setIsSavingWeight(false);
      }
    }
  };

  const handleSuggestionClick = (suggestion: {food_id: string, food_name: string}) => {
    // Update the formData with the selected suggestion, including the food_id
    setFormData({
      ...formData,
      food_name: suggestion.food_name,
      food_id: suggestion.food_id, // Store the food_id to avoid re-matching
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
      formDataObj.append('food_name', formData.food_name || '');
      formDataObj.append('amount', formData.amount);
      // Don't send weight_in_grams - let the backend estimate it from amount
      // The weight field is only used for display and manual blur updates
      if (formData.food_id) {
        formDataObj.append('food_id', formData.food_id); // Send food_id to skip RRF matching
      }

      let response: any = undefined;

      // Editing or adding a recipe ingredient
      if (recipeId) {
        formDataObj.append('recipe_id', recipeId);

        if (componentIndex !== undefined) {
          // Editing existing ingredient
          formDataObj.append('component_index', String(componentIndex));
          response = await request('/recipes/edit-ingredient', 'POST', formDataObj);
        } else {
          // Adding new ingredient
          response = await request('/recipes/add-ingredient', 'POST', formDataObj);
        }
      }

      // If successful, update the grams in local state
      if (response && response.status === 200 && response.body) {
        // Call optional onSave callback FIRST to refresh parent component
        if (onSave) {
          await onSave();
        }

        // For new ingredients, clear the form
        // For existing ingredients, the parent refresh will update the display
        if (componentIndex === undefined) {
          setFormData({
            food_name: '',
            amount: '',
            weight_in_grams: '',
            food_id: undefined
          });
        }
      }

      refreshLogs();

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
              {isSubmitting ? (
                <S.AnimatedFoodName>
                  <AnimatedText text={formData.food_name || ''} />
                </S.AnimatedFoodName>
              ) : (
                <S.FoodNameInput
                  ref={textareaRef}
                  name='food_name'
                  placeholder='food'
                  value={formData.food_name}
                  onChange={handleTyping}
                  onKeyDown={handleTextareaKeyDown}
                  required
                />
              )}
            </S.FoodNameSpace>

            <S.FoodPortionSpace>
              <S.PortionInput
                name='amount'
                type='text'
                placeholder='1 cup'
                value={formData.amount}
                onChange={handleTyping}
                onKeyDown={handleInputKeyDown}
                required
              />
            </S.FoodPortionSpace>

            <S.FoodWeightSpace>
                {isSavingWeight ? (
                  <S.AnimatedWeightText>
                    <AnimatedText text={`${formData.weight_in_grams} g`} />
                  </S.AnimatedWeightText>
                ) : (
                  <>
                    <S.GramsDisplay
                      name='weight_in_grams'
                      type='text'
                      placeholder='0'
                      value={formData.weight_in_grams}
                      onChange={handleTyping}
                      onBlur={handleWeightBlur}
                      onKeyDown={handleWeightKeyDown}
                      required/>
                    <S.AlignedText> g </S.AlignedText>
                  </>
                )}
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
                    key={suggestion.food_id}
                    onClick={() => handleSuggestionClick(suggestion)}
                    $selected={index === selectedSuggestionIndex}
                    onMouseEnter={() => setSelectedSuggestionIndex(index)}
                  >
                    {suggestion.food_name}
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