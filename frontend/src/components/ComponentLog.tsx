import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { request } from './endpoints';
import { useRefreshLogs } from './dashboard_states';
import { AnimatedText } from './AnimatedText';
import {
  LogBubble, FoodNameSpace, FoodPortionSpace, FoodDateSpace,
  MealRowContainer, HoverDeleteBtn,
} from './LogStyles';
import {
  EditEntryFormBubble, EditInputFoodName, EditInputPortion, EditGramsDisplay,
  EditInputDate,
  SuggestionsContainer, SuggestionsList, SuggestionItem, FormDropdownWrapper,
} from './EditLogStyles';
import type { LogComponent } from './structures';

interface ComponentLogProps {
  component: LogComponent;
  logId: string;
  componentIndex: number;
  isStandalone: boolean;
  logDate?: Date;
  logServings?: number;
  onDelete?: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ComponentLog({
  component, logId, componentIndex, isStandalone,
  logDate, logServings,
  onDelete, onMouseEnter, onMouseLeave,
}: ComponentLogProps) {
  const [isEditable, setIsEditable] = useState(false);
  const [foodName, setFoodName] = useState(component.food_name);
  const [foodId, setFoodId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState(
    component.amount || `${Math.round(component.weight_in_grams)}g`
  );
  const [gramsDisplay, setGramsDisplay] = useState(component.weight_in_grams);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDate, setIsSavingDate] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dateInput, setDateInput] = useState<Date>(logDate ? new Date(logDate) : new Date());

  // Autocomplete
  const [suggestions, setSuggestions] = useState<Array<{ food_id: string; food_name: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
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

  // Sync dateInput when logDate prop changes
  useEffect(() => {
    if (!isEditable && logDate) setDateInput(new Date(logDate));
  }, [logDate, isEditable]);

  // Click-outside to exit edit mode
  useEffect(() => {
    if (!isEditable) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsEditable(false);
        setFoodName(component.food_name);
        setFoodId(null);
        setAmountInput(component.amount || `${Math.round(component.weight_in_grams)}g`);
        if (logDate) setDateInput(new Date(logDate));
        setSuggestions([]);
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditable, component, logDate]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const formatDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const [year, month, day] = e.target.value.split('-').map(Number);
      if (day < 1 || day > 31 || month < 1 || month > 12) return;
      const updated = new Date(dateInput);
      updated.setFullYear(year);
      updated.setMonth(month - 1);
      updated.setDate(day);
      setDateInput(updated);
    } catch {}
  };

  const saveDateToServer = async () => {
    if (logServings == null) return;
    setIsSavingDate(true);
    try {
      const fd = new FormData();
      fd.append('log_id', logId);
      fd.append('servings', String(logServings));
      fd.append('date', dateInput.toISOString());
      await request('/logs/edit-recipe-log', 'POST', fd);
      refreshLogs();
    } catch (error) {
      console.error('Error saving date:', error);
      if (logDate) setDateInput(new Date(logDate));
    } finally {
      setIsSavingDate(false);
    }
  };

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
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSuggestionClick = (s: { food_id: string; food_name: string }) => {
    setFoodName(s.food_name);
    setFoodId(s.food_id);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const saveComponent = async () => {
    if (!foodName.trim()) return;
    setIsSaving(true);
    setShowSuggestions(false);
    setSuggestions([]);
    try {
      const fd = new FormData();
      fd.append('log_id', logId);
      fd.append('component_index', String(componentIndex));
      fd.append('food_name', foodName);
      fd.append('amount', amountInput);
      if (foodId) fd.append('food_id', foodId);
      const response = await request('/logs/edit-component', 'POST', fd);
      if (response.status === 200 && response.body) {
        setGramsDisplay(response.body.weight_in_grams);
      }
      refreshLogs();
      setIsEditable(false);
    } catch (error) {
      console.error('Error saving component:', error);
      setFoodName(component.food_name);
      setFoodId(null);
      setAmountInput(component.amount || `${Math.round(component.weight_in_grams)}g`);
    } finally {
      setIsSaving(false);
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
      e.preventDefault();
      if (!showSuggestions || selectedSuggestionIndex < 0) saveComponent();
    }
  };

  const handleAmountKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveComponent();
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleting(true);
    try {
      if (isStandalone) {
        await request(`/logs/delete?log_id=${logId}`, 'DELETE');
      } else {
        await request(
          `/logs/delete-component?log_id=${logId}&component_index=${componentIndex}`,
          'DELETE'
        );
      }
      refreshLogs();
      onDelete?.();
    } catch (error) {
      console.error('Error deleting component:', error);
      setIsDeleting(false);
    }
  };

  if (isDeleting) return null;

  return (
    <MealRowContainer
      ref={containerRef}
      $active={isEditable}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {isEditable ? (
        <FormDropdownWrapper>
          <EditEntryFormBubble
            $active={showSuggestions}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{ marginBottom: 0 }}
          >
            <FoodNameSpace>
              {isSaving ? (
                <AnimatedText text={foodName} />
              ) : (
                <EditInputFoodName
                  ref={textareaRef}
                  name="food_name"
                  placeholder="food"
                  value={foodName}
                  onChange={handleFoodNameChange}
                  onKeyDown={handleFoodNameKeyDown}
                />
              )}
            </FoodNameSpace>
            <FoodDateSpace>
              {isStandalone && (
                isSavingDate ? (
                  <AnimatedText text={formatDateStr(dateInput)} />
                ) : (
                  <EditInputDate
                    type="date"
                    value={formatDateStr(dateInput)}
                    onChange={handleDateChange}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveDateToServer(); } }}
                  />
                )
              )}
            </FoodDateSpace>
            <FoodPortionSpace style={{ gap: '4px', alignItems: 'baseline', flexWrap: 'nowrap' }}>
              {isSaving ? (
                <AnimatedText text={`${amountInput} (${Math.round(gramsDisplay)}g)`} />
              ) : (
                <>
                  <EditInputPortion
                    name="amount"
                    type="text"
                    placeholder="1 cup"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    onKeyDown={handleAmountKeyDown}
                    style={{ width: `${Math.max(amountInput.length, 3) + 1}ch`, flexShrink: 0 }}
                  />
                  <EditGramsDisplay>({Math.round(gramsDisplay)}g)</EditGramsDisplay>
                </>
              )}
            </FoodPortionSpace>
          </EditEntryFormBubble>

          {showSuggestions && (
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
          )}
        </FormDropdownWrapper>
      ) : (
        <LogBubble onClick={() => setIsEditable(true)} style={{ cursor: 'pointer' }}>
          <FoodNameSpace>{component.food_name}</FoodNameSpace>
          <FoodDateSpace />
          <FoodPortionSpace>
            {component.amount
              ? `${component.amount} (${Math.round(component.weight_in_grams)}g)`
              : `${Math.round(component.weight_in_grams)}g`}
          </FoodPortionSpace>
        </LogBubble>
      )}

      <HoverDeleteBtn onClick={handleDelete} aria-label="Delete">×</HoverDeleteBtn>
    </MealRowContainer>
  );
}

export { ComponentLog };
