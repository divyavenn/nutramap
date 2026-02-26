import { useState } from 'react';
import { ImageButton } from './Sections';
import Trashcan from '../assets/images/trashcan.svg?react';
import '../assets/css/NutrientStats.css';
import '../assets/css/new_nutrient.css';
import { useRecoilValue } from 'recoil';
import { nutrientDetailsByNameAtom } from './account_states';
import { getNutrientInfo } from './utlis';
import { request } from './endpoints';
import { AnimatedText } from './AnimatedText';

interface NutrientInfo {
  nutrient_id: number;
  name: string;
  amount: number;
  unit: string;
}

interface NutrientPanelProps {
  itemId: string;
  itemType: 'food' | 'recipe';
  itemName: string;
  nutrients: NutrientInfo[];
  onUpdate: () => void;
}

interface EditNutrientFormProps {
  original?: NutrientInfo;
  itemId: string;
  itemType: 'food' | 'recipe';
  onUpdate: () => void;
}

interface EditableNutrient {
  nutrient_id: number;
  amt: number;
}

function normalizeEditableNutrients(rawNutrients: unknown): EditableNutrient[] {
  if (Array.isArray(rawNutrients)) {
    return rawNutrients
      .map((nutrient): EditableNutrient | null => {
        if (!nutrient || typeof nutrient !== 'object') return null;
        const nutrientId = Number((nutrient as any).nutrient_id);
        const amount = Number((nutrient as any).amt ?? (nutrient as any).amount);
        if (!Number.isFinite(nutrientId) || !Number.isFinite(amount)) return null;
        return { nutrient_id: nutrientId, amt: amount };
      })
      .filter((nutrient): nutrient is EditableNutrient => nutrient !== null);
  }

  if (rawNutrients && typeof rawNutrients === 'object') {
    return Object.entries(rawNutrients as Record<string, unknown>)
      .map(([nutrientId, amount]): EditableNutrient | null => {
        const parsedId = Number(nutrientId);
        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedId) || !Number.isFinite(parsedAmount)) return null;
        return { nutrient_id: parsedId, amt: parsedAmount };
      })
      .filter((nutrient): nutrient is EditableNutrient => nutrient !== null);
  }

  return [];
}

/**
 * Form component for editing/adding individual nutrients
 * Used for both custom foods and recipes
 */
function EditNutrientForm({ original, itemId, itemType, onUpdate }: EditNutrientFormProps): React.ReactNode {
  const nutrientList = useRecoilValue(nutrientDetailsByNameAtom);

  const [formData, setFormData] = useState({
    nutrient_name: original ? original.name : '',
    amount: original ? String(original.amount) : '',
  });

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [validInput, markValidInput] = useState(original ? true : false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && (!showSuggestions || suggestions.length === 0)) {
      e.preventDefault();

      if (formData.nutrient_name && formData.amount && validInput) {
        void submitForm();
      }
    }
  };

  const submitForm = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
    const endpoint = itemType === 'food'
      ? `/food/custom_foods/${itemId}`
      : `/recipe/${itemId}`;

    // Get current item data
    const response = await request(endpoint, 'GET');
    const currentItem = response.body;

    const nutrientId = Number(getNutrientInfo(formData.nutrient_name, false, nutrientList));
    const amount = parseFloat(formData.amount);
    if (!Number.isFinite(nutrientId) || !Number.isFinite(amount)) {
      return;
    }

    // Build updated nutrients array
    const updatedNutrients = normalizeEditableNutrients(currentItem.nutrients);

    // Check if this nutrient already exists
    const existingIndex = updatedNutrients.findIndex((n) => n.nutrient_id === nutrientId);

    if (existingIndex >= 0) {
      // Update existing
      updatedNutrients[existingIndex].amt = amount;
    } else {
      // Add new
      updatedNutrients.push({
        nutrient_id: nutrientId,
        amt: amount
      });
    }

    // Update the item with new nutrients
    const updateEndpoint = itemType === 'food'
      ? `/food/update-nutrients/${itemId}`
      : `/recipe/update-nutrients/${itemId}`;

    await request(updateEndpoint, 'PUT', {
      nutrients: JSON.stringify(updatedNutrients)
    }, 'URLencode');

    onUpdate();
    } finally {
      setIsSaving(false);
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setFormData({
      ...formData,
      [name]: value,
    });

    if (name === 'nutrient_name') {
      markValidInput(value in nutrientList);
      const filteredNutrients = Object.keys(nutrientList).filter(n =>
        n.toLowerCase().includes(value.toLowerCase())
      );

      setSuggestions(filteredNutrients);
      setShowSuggestions(value.length > 0 && filteredNutrients.length > 0);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    markValidInput(true);
    setFormData({
      ...formData,
      nutrient_name: suggestion,
    });
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await submitForm();
  };

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {

    const endpoint = itemType === 'food'
      ? `/food/custom_foods/${itemId}`
      : `/recipe/${itemId}`;

    const response = await request(endpoint, 'GET');
    const currentItem = response.body;

    const nutrientId = Number(getNutrientInfo(formData.nutrient_name, false, nutrientList));
    if (!Number.isFinite(nutrientId)) {
      return;
    }

    // Remove this nutrient from the list
    const updatedNutrients = normalizeEditableNutrients(currentItem.nutrients).filter(
      (n) => n.nutrient_id !== nutrientId
    );

    // Update the item
    const updateEndpoint = itemType === 'food'
      ? `/food/update-nutrients/${itemId}`
      : `/recipe/update-nutrients/${itemId}`;

    await request(updateEndpoint, 'PUT', {
      nutrients: JSON.stringify(updatedNutrients)
    }, 'URLencode');

    setIsDeleted(true);
    onUpdate();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    !isDeleted && (
      <form
        id="new-nutrient-form"
        className={`new-nutrient-wrapper ${showSuggestions ? 'active' : ''}`}
        onSubmit={handleSubmit}
      >
        <div className={`nutrient-form-bubble ${showSuggestions ? 'active' : ''}`}>
          <div className='delete-requirement-button-container'>
            {original && (
              <ImageButton
                type="button"
                onClick={handleDelete}
                className="delete-button"
                disabled={isSaving}
              >
                <Trashcan />
              </ImageButton>
            )}
          </div>

          <div className='new-nutrient-name-wrapper'>
            {isSaving && formData.nutrient_name ? (
              <AnimatedText
                text={formData.nutrient_name}
                className='new-requirement-nutrient-name nutrient-name-animated'
              />
            ) : (
              <input
                name='nutrient_name'
                className='new-requirement-nutrient-name'
                placeholder='nutrient'
                value={formData.nutrient_name}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
                disabled={isSaving}
                required
              />
            )}
          </div>


          <div className="input-requirement-amt-wrapper">
            <input
              name='amount'
              className='input-requirement-amt'
              type='number'
              step="0.01"
              placeholder='0'
              value={formData.amount}
              onChange={handleTyping}
              onKeyDown={handleKeyDown}
              disabled={isSaving}
              required
            />
            <span className="nutrient-unit">
              {formData.nutrient_name && validInput && getNutrientInfo(formData.nutrient_name, true, nutrientList)}
            </span>
          </div>

          <div className='new-nutrient-button-container'>
            <button type="submit" className="new-nutrient-button-hidden" tabIndex={-1} aria-hidden="true" />
          </div>
        </div>

        {showSuggestions && (
          <ul className="nutrient-suggestions-list">
            {suggestions.map(suggestion => (
              <li
                key={suggestion}
                className="nutrient-suggestion-item"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        )}
      </form>
    )
  );
}

/**
 * Main NutrientPanel component
 * Displays and edits nutrients for custom foods or recipes
 * Always in edit mode - clicking outside closes the panel
 */
function NutrientPanel({ itemId, itemType, itemName, nutrients, onUpdate }: NutrientPanelProps) {
  return (
    <div className="nutrient-dashboard">
      <div className="nutrient-panel-title">{itemName} (per 100 g)</div>

      <div className='requirement-edit-wrapper'>
        <div className='nutrient-edit-list-wrapper'>
          {nutrients.map(nutrient => (
            <EditNutrientForm
              key={nutrient.nutrient_id}
              original={nutrient}
              itemId={itemId}
              itemType={itemType}
              onUpdate={onUpdate}
            />
          ))}
          <EditNutrientForm
            itemId={itemId}
            itemType={itemType}
            onUpdate={onUpdate}
          />
        </div>
      </div>
    </div>
  );
}

// Export both the panel and the form for use in foods.tsx
export { NutrientPanel, EditNutrientForm as EditFoodNutrientForm };
