import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { formatTime } from './utlis'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { request } from './endpoints';
import { useRefreshLogs } from './dashboard_states';
import { tutorialEvent } from './TryTutorial';
import { AnimatedText } from './AnimatedText';
import {
  RecipeBubble, MealToggleBtn,
  FoodNameSpace, FoodPortionSpace, FoodDateSpace,
  MealRowContainer, HoverDeleteBtn, ClickableMealName,
} from './LogStyles';
import {
  EditEntryFormBubble, EditInputPortion, EditInputDate,
} from './EditLogStyles';

interface MealHeaderProps {
  meal_name: string;
  servings: number;
  date: Date;
  log_id: string;
  recipe_id?: string | null;
  recipe_exists?: boolean;
  serving_size_label?: string;
  total_weight_grams: number;
  expanded: boolean;
  onToggle: () => void;
  onNameClick: () => void;
  onDeleteStart: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function MealHeader({
  meal_name, servings, date, log_id, recipe_id, recipe_exists,
  serving_size_label, total_weight_grams,
  expanded, onToggle, onNameClick, onDeleteStart, onMouseEnter, onMouseLeave,
}: MealHeaderProps) {
  const [isEditable, setIsEditable] = useState(false);
  const [savingField, setSavingField] = useState<'servings' | 'grams' | 'date' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [servingsInput, setServingsInput] = useState(String(servings));
  const [gramsInput, setGramsInput] = useState(String(Math.round(total_weight_grams)));
  const [dateInput, setDateInput] = useState(new Date(date));

  const containerRef = useRef<HTMLDivElement>(null);
  const refreshLogs = useRefreshLogs();

  const weightPerServing = servings > 0 ? total_weight_grams / servings : null;
  const canOpenRecipe = Boolean(recipe_id) && Boolean(recipe_exists);

  // Sync inputs from props when not in edit mode
  useEffect(() => {
    if (!isEditable) {
      setServingsInput(String(servings));
      setGramsInput(String(Math.round(total_weight_grams)));
      setDateInput(new Date(date));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servings, total_weight_grams, date.getTime(), isEditable]);

  // Click-outside to exit edit mode and discard unsaved changes
  useEffect(() => {
    if (!isEditable) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsEditable(false);
        setServingsInput(String(servings));
        setGramsInput(String(Math.round(total_weight_grams)));
        setDateInput(new Date(date));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditable, servings, total_weight_grams, date]);

  const saveToServer = async (field: 'servings' | 'grams' | 'date', currentDate: Date) => {
    setSavingField(field);
    try {
      let newServings = parseFloat(servingsInput);
      if (field === 'grams' && weightPerServing && weightPerServing > 0) {
        const g = parseFloat(gramsInput);
        if (!isNaN(g) && g > 0) newServings = g / weightPerServing;
      }
      if (isNaN(newServings) || newServings <= 0) newServings = servings;

      const fd = new FormData();
      fd.append('log_id', log_id);
      fd.append('servings', String(newServings));
      fd.append('date', currentDate.toISOString());
      await request('/logs/edit-recipe-log', 'POST', fd);
      refreshLogs();
    } catch (error) {
      console.error('Error saving field:', error);
      setServingsInput(String(servings));
      setGramsInput(String(Math.round(total_weight_grams)));
      setDateInput(new Date(date));
    } finally {
      setSavingField(null);
    }
  };

  const handleServingsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setServingsInput(val);
    if (weightPerServing != null) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0)
        setGramsInput(String(Math.round(parsed * weightPerServing)));
    }
  };

  const handleGramsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setGramsInput(val);
    if (weightPerServing != null && weightPerServing > 0) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) {
        const ns = parsed / weightPerServing;
        setServingsInput(ns.toFixed(2).replace(/\.?0+$/, ''));
      }
    }
  };

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

  const formatDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const mkKeyDown =
    (field: 'servings' | 'grams' | 'date') =>
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveToServer(field, dateInput);
      }
    };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleting(true);
    onDeleteStart();
    try {
      await request(`/logs/delete?log_id=${log_id}`, 'DELETE');
      refreshLogs();
    } catch (error) {
      console.error('Error deleting log:', error);
      setIsDeleting(false);
    }
  };

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNameClick();
  };

  // Display-mode portion text (always show servings, even without serving_size_label)
  const servingsValue = Number(servings);
  const safeServings = Number.isFinite(servingsValue) && servingsValue > 0 ? servingsValue : 1;
  const count = Number.isInteger(safeServings)
    ? String(safeServings)
    : safeServings.toFixed(1).replace(/\.0$/, "");
  const cleanedServingLabel = serving_size_label?.replace(/^\d+\.?\d*\s+/, "").trim();
  let unitText = cleanedServingLabel || "serving";
  if (safeServings !== 1 && unitText === "serving") {
    unitText = "servings";
  } else if (safeServings !== 1 && unitText && !unitText.endsWith("s")) {
    unitText = `${unitText}s`;
  }
  const portionText = `${count} ${unitText}`;

  if (isDeleting) return null;

  return (
    <MealRowContainer
      ref={containerRef}
      $active={isEditable}
      className={canOpenRecipe ? 'tutorial-meal-with-recipe' : 'tutorial-meal-without-recipe'}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <MealToggleBtn
        $expanded={expanded}
        className="tutorial-meal-toggle"
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onToggle();
          if (!expanded) tutorialEvent('tutorial:meal-expanded');
        }}
        aria-label={expanded ? 'Collapse' : 'Expand'}
      >
        ›
      </MealToggleBtn>

      {isEditable ? (
        <EditEntryFormBubble
          $active={false}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          style={{ marginBottom: 0 }}
        >
          <FoodNameSpace>
            <ClickableMealName
              className={canOpenRecipe ? 'tutorial-recipe-name-link' : undefined}
              onClick={handleNameClick}
            >
              {meal_name}
            </ClickableMealName>
          </FoodNameSpace>

          <FoodDateSpace>
            {savingField === 'date' ? (
              <AnimatedText text={formatDateStr(dateInput)} />
            ) : (
              <EditInputDate
                type="date"
                value={formatDateStr(dateInput)}
                onChange={handleDateChange}
                onKeyDown={mkKeyDown('date')}
              />
            )}
          </FoodDateSpace>

          <FoodPortionSpace style={{ gap: '4px', alignItems: 'baseline', flexWrap: 'nowrap' }}>
            {savingField === 'servings' ? (
              <AnimatedText text={servingsInput} />
            ) : (
              <EditInputPortion
                type="text"
                value={servingsInput}
                onChange={handleServingsChange}
                onKeyDown={mkKeyDown('servings')}
                style={{ width: `${Math.max(servingsInput.length, 1) + 1}ch`, flexShrink: 0 }}
              />
            )}
            <span>servings</span>
            {weightPerServing != null && (
              <>
                <span>(</span>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 0 }}>
                  {savingField === 'grams' ? (
                    <AnimatedText text={gramsInput} />
                  ) : (
                    <EditInputPortion
                      type="number"
                      min="0"
                      value={gramsInput}
                      onChange={handleGramsChange}
                      onKeyDown={mkKeyDown('grams')}
                      style={{ width: `${Math.max(gramsInput.length, 4) + 1}ch`, flexShrink: 0 }}
                    />
                  )}
                  <span>g)</span>
                </span>
              </>
            )}
          </FoodPortionSpace>
        </EditEntryFormBubble>
      ) : (
        <RecipeBubble
          $expanded={expanded}
          onClick={() => { setIsEditable(true); tutorialEvent('tutorial:log-clicked'); }}
          style={{ cursor: 'pointer' }}
        >
          <FoodNameSpace as="span">
            {meal_name}
          </FoodNameSpace>
          <FoodDateSpace />
          <FoodPortionSpace as="span">
            {portionText}{total_weight_grams > 0 ? ` (${Math.round(total_weight_grams)}g)` : ''}
          </FoodPortionSpace>
        </RecipeBubble>
      )}

      <HoverDeleteBtn onClick={handleDelete} aria-label="Delete meal">×</HoverDeleteBtn>
    </MealRowContainer>
  );
}

export { MealHeader };
