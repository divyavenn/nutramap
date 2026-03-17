import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import styled from 'styled-components';
import { request } from './endpoints';
import { useRefreshLogs } from './dashboard_states';
import { tutorialEvent } from './TryTutorial';
import {
  FoodNameSpace, FoodPortionSpace, FoodDateSpace,
} from './LogStyles';
import {
  EditEntryFormBubble, EditInputFoodName, EditInputPortion,
  SuggestionsContainer, SuggestionsList, SuggestionItem, FormDropdownWrapper,
} from './EditLogStyles';

const AddFormBubble = styled(EditEntryFormBubble)`
  background-color: transparent;
  &:hover {
    background-color: transparent;
    color: var(--white);
  }
`;

const AddFormInputName = styled(EditInputFoodName)`
  &::placeholder { color: rgba(190, 140, 255, 0.5); }
`;

const AddFormInputPortion = styled(EditInputPortion)`
  &::placeholder { color: rgba(190, 140, 255, 0.5); }
`;

const AddFormDropdown = styled(FormDropdownWrapper)`
  background-color: transparent;
`;

interface AddComponentFormProps {
  logId: string;
  onAdd: () => void;
}

function AddComponentForm({ logId, onAdd }: AddComponentFormProps) {
  const [foodName, setFoodName] = useState('');
  const [foodId, setFoodId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [suggestions, setSuggestions] = useState<Array<{ food_id: string; food_name: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const refreshLogs = useRefreshLogs();

  // Auto-adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [foodName]);

  // Reset suggestion index when suggestions change
  useEffect(() => {
    setSelectedSuggestionIndex(suggestions.length > 0 ? 0 : -1);
  }, [suggestions]);

  // Scroll selected suggestion into view
  useEffect(() => {
    if (selectedSuggestionIndex >= 0 && suggestionsRef.current) {
      const cont = suggestionsRef.current;
      const el = cont.querySelector(
        `.suggestion-item:nth-child(${selectedSuggestionIndex + 1})`
      ) as HTMLElement;
      if (el) {
        const contTop = cont.scrollTop;
        const contBottom = contTop + cont.clientHeight;
        const elTop = el.offsetTop;
        const elBottom = elTop + el.offsetHeight;
        if (elTop < contTop) cont.scrollTop = elTop;
        else if (elBottom > contBottom) cont.scrollTop = elBottom - cont.clientHeight;
      }
    }
  }, [selectedSuggestionIndex]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const fetchSuggestions = async (value: string) => {
    if (!value.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    try {
      const response = await request('/match/autocomplete?prompt=' + value, 'POST', {}, 'JSON');
      if (response.body) {
        setSuggestions(response.body);
        setShowSuggestions(value.length > 0 && response.body.length > 0);
      }
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleFoodNameChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setFoodName(val);
    setFoodId(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    fetchSuggestions(val);
  };

  const handleSuggestionClick = (s: { food_id: string; food_name: string }) => {
    setFoodName(s.food_name);
    setFoodId(s.food_id);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleSubmit = async () => {
    if (!foodName.trim() || !amount.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setShowSuggestions(false);
    try {
      const fd = new FormData();
      fd.append('log_id', logId);
      fd.append('food_name', foodName);
      fd.append('amount', amount);
      if (foodId) fd.append('food_id', foodId);
      await request('/logs/add-component', 'POST', fd);
      tutorialEvent('tutorial:component-added');
      refreshLogs({ force: true });
      onAdd();
      setFoodName('');
      setFoodId(null);
      setAmount('');
    } catch (error) {
      console.error('Error adding component:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFoodNameKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedSuggestionIndex(prev => prev < suggestions.length - 1 ? prev + 1 : prev);
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : prev);
          return;
        case 'Tab':
          e.preventDefault();
          if (selectedSuggestionIndex >= 0) handleSuggestionClick(suggestions[selectedSuggestionIndex]);
          return;
        case 'Enter':
          if (selectedSuggestionIndex >= 0) {
            e.preventDefault();
            handleSuggestionClick(suggestions[selectedSuggestionIndex]);
            return;
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowSuggestions(false);
          return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Enter on food name only selects a suggestion, never submits
    }
  };

  const handleAmountKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <AddFormDropdown style={{ opacity: isSubmitting ? 0.5 : 1 }}>
      <AddFormBubble $active={showSuggestions}>
        <FoodNameSpace>
          <AddFormInputName
            ref={textareaRef}
            name="food_name"
            placeholder="add ingredient..."
            value={foodName}
            onChange={handleFoodNameChange}
            onKeyDown={handleFoodNameKeyDown}
            disabled={isSubmitting}
          />
        </FoodNameSpace>
        <FoodDateSpace />
        <FoodPortionSpace>
          <AddFormInputPortion
            name="amount"
            type="text"
            placeholder="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={handleAmountKeyDown}
            disabled={isSubmitting}
          />
        </FoodPortionSpace>
      </AddFormBubble>

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
              <SuggestionsList>
                {suggestions.map((s, idx) => (
                  <SuggestionItem
                    key={s.food_id}
                    $selected={idx === selectedSuggestionIndex}
                    className="suggestion-item"
                    onClick={() => handleSuggestionClick(s)}
                    onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                  >
                    {s.food_name}
                  </SuggestionItem>
                ))}
              </SuggestionsList>
            </SuggestionsContainer>
          </motion.div>
        )}
      </AnimatePresence>
    </AddFormDropdown>
  );
}

export { AddComponentForm };
