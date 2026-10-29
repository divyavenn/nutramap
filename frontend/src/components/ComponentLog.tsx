import React, { useState, useEffect, useRef, useId, KeyboardEvent } from 'react';
import { useNotify } from './StatusMessage';
import { AnimatePresence, motion } from 'framer-motion';
import { request } from './endpoints';
import { useRefreshLogs } from './dashboard_states';
import { SavingText } from './SavingText';
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
import { tutorialEvent } from './TryTutorial';
import { tolocalDateString } from './utlis';

interface ComponentLogProps {
  component: LogComponent;
  logId: string;
  componentIndex: number;
  isStandalone: boolean;
  hasRecipe?: boolean;
  logDate?: Date;
  logServings?: number;
  onDelete?: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ComponentLog({
  component, logId, componentIndex, isStandalone, hasRecipe = false,
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
  const notify = useNotify();
  const listId = useId();
  const optionId = (idx: number) => `${listId}-option-${idx}`;

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
  const logDateMs = logDate ? logDate.getTime() : null;
  useEffect(() => {
    if (!isEditable && logDateMs != null) setDateInput(new Date(logDateMs));
  }, [logDateMs, isEditable]);

  // Sync editable fields from props when not editing. Rows are keyed by index, so after a
  // servings change (components rescaled) or a sibling delete (indices shift) this instance
  // receives a different component; without this, edit mode would show (and re-save) stale values.
  useEffect(() => {
    if (isEditable) return;
    setFoodName(component.food_name);
    setFoodId(null);
    setAmountInput(component.amount || `${Math.round(component.weight_in_grams)}g`);
    setGramsDisplay(component.weight_in_grams);
  }, [component.food_name, component.amount, component.weight_in_grams, isEditable]);

  // Clear the optimistic "deleting" flag once the component in this slot changes
  // (the row at this index now represents the next component).
  useEffect(() => {
    setIsDeleting(false);
  }, [component]);

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
      if (!year || !month || !day || day < 1 || day > 31 || month < 1 || month > 12) return;
      const updated = new Date(dateInput);
      // Set all parts at once; sequential setMonth/setDate overflows (e.g. Jan 31 -> Feb -> Mar 3)
      updated.setFullYear(year, month - 1, day);
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
      // Log dates are stored as naive local time; toISOString() would shift by the UTC offset
      fd.append('date', tolocalDateString(dateInput));
      const response = await request('/logs/edit-recipe-log', 'POST', fd);
      if (response.status !== 200) throw new Error(`edit-recipe-log failed (${response.status})`);
      refreshLogs({ force: true });
    } catch (error) {
      console.error('Error saving date:', error);
      notify('date not saved. try again.');
      if (logDate) setDateInput(new Date(logDate));
    } finally {
      setIsSavingDate(false);
    }
  };

  const fetchSuggestions = async (value: string) => {
    if (!value.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    try {
      const response = await request('/match/autocomplete?prompt=' + encodeURIComponent(value), 'POST', {}, 'JSON');
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
    // Cancel any pending lookup so stale results don't re-open the dropdown
    if (debounceRef.current) clearTimeout(debounceRef.current);
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
      if (response.status !== 200) throw new Error(`edit-component failed (${response.status})`);
      if (response.body) {
        setGramsDisplay(response.body.weight_in_grams);
      }
      tutorialEvent('tutorial:component-added');
      refreshLogs({ force: true });
      setIsEditable(false);
    } catch (error) {
      console.error('Error saving component:', error);
      notify('ingredient not saved. check your connection and try again.');
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
          // Tab moves focus as usual; Enter accepts a suggestion
          setShowSuggestions(false);
          break;
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
      const response = isStandalone
        ? await request(`/logs/delete?log_id=${logId}`, 'DELETE')
        : await request(
            `/logs/delete-component?log_id=${logId}&component_index=${componentIndex}`,
            'DELETE'
          );
      if (response.status !== 200) throw new Error(`delete failed (${response.status})`);
      refreshLogs({ force: true });
      onDelete?.();
    } catch (error) {
      console.error('Error deleting component:', error);
      notify(`couldn't delete ${component.food_name}. try again.`);
      setIsDeleting(false);
    }
  };

  // Keyboard way out of edit mode (pointer users click outside)
  const cancelEdit = () => {
    setFoodName(component.food_name);
    setFoodId(null);
    setAmountInput(component.amount || `${Math.round(component.weight_in_grams)}g`);
    if (logDate) setDateInput(new Date(logDate));
    setShowSuggestions(false);
    setIsEditable(false);
  };

  if (isDeleting) return null;

  const portionText = component.amount
    ? `${component.amount} (${Math.round(component.weight_in_grams)}g)`
    : `${Math.round(component.weight_in_grams)}g`;

  return (
    <MealRowContainer
      ref={containerRef}
      $active={isEditable}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onMouseEnter}
      onBlur={onMouseLeave}
    >
      {isEditable ? (
        <FormDropdownWrapper>
          <EditEntryFormBubble
            $active={showSuggestions}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Escape' && !showSuggestions) cancelEdit(); }}
            style={{ marginBottom: 0 }}
          >
            <FoodNameSpace>
              {isSaving ? (
                <SavingText>{foodName}</SavingText>
              ) : (
                <EditInputFoodName
                  ref={textareaRef}
                  aria-label="food"
                  autoFocus
                  name="food_name"
                  placeholder="banana"
                  value={foodName}
                  onChange={handleFoodNameChange}
                        onKeyDown={handleFoodNameKeyDown}
                  role="combobox"
                  aria-expanded={showSuggestions}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={showSuggestions && selectedSuggestionIndex >= 0 ? optionId(selectedSuggestionIndex) : undefined}
                />
              )}
            </FoodNameSpace>
            <FoodDateSpace>
              {isStandalone && (
                isSavingDate ? (
                  <SavingText>{formatDateStr(dateInput)}</SavingText>
                ) : (
                  <EditInputDate
                    aria-label="log date"
                    type="date"
                    value={formatDateStr(dateInput)}
                    onChange={handleDateChange}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveDateToServer(); } }}
                  />
                )
              )}
            </FoodDateSpace>
            <FoodPortionSpace style={{ gap: '4px', alignItems: 'baseline' }}>
              {isSaving ? (
                <SavingText>{`${amountInput} (${Math.round(gramsDisplay)}g)`}</SavingText>
              ) : (
                <>
                  <EditInputPortion
                    aria-label="amount"
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
                  <SuggestionsList role="listbox" id={listId}>
                    {suggestions.map((s, idx) => (
                      <SuggestionItem
                        key={s.food_id}
                        $selected={idx === selectedSuggestionIndex}
                        id={optionId(idx)}
                        role="option"
                        aria-selected={idx === selectedSuggestionIndex}
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
        </FormDropdownWrapper>
      ) : (
        <LogBubble
          onClick={hasRecipe ? undefined : () => setIsEditable(true)}
          style={{ cursor: hasRecipe ? 'default' : 'pointer' }}
        >
          {/* Recipe-owned rows aren't editable here; muted text, not the accent that means "clickable" */}
          <FoodNameSpace style={hasRecipe ? { color: 'var(--color-text-secondary)' } : undefined}>{component.food_name}</FoodNameSpace>
          <FoodDateSpace />
          {hasRecipe ? (
            <FoodPortionSpace>{portionText}</FoodPortionSpace>
          ) : (
            // The keyboard path into edit mode; its click bubbles to the bubble's handler
            <FoodPortionSpace as="button" type="button" aria-label={`edit ${component.food_name}: ${portionText}`}>
              {portionText}
            </FoodPortionSpace>
          )}
        </LogBubble>
      )}

      {!hasRecipe && <HoverDeleteBtn onClick={handleDelete} aria-label={`delete ${component.food_name}`}>×</HoverDeleteBtn>}
    </MealRowContainer>
  );
}

export { ComponentLog };
