import { useState, useRef, useEffect } from 'react';
import { request } from './endpoints';
import { HoverButton } from './Sections';
import Arrow from '../assets/images/arrow.svg?react';
import IsOk from '../assets/images/checkmark.svg?react';
import ImageIcon from '../assets/images/image.svg?react';
import Trashcan from '../assets/images/trashcan.svg?react';
import '../assets/css/foods.css';

interface NutrientData {
  nutrient_id: number;
  name: string;
  amount: number;
  unit: string;
}

/**
 * NewFood component for adding custom foods
 * This component allows users to:
 * - Enter a food description (optional)
 * - Upload or paste multiple images
 * - Auto-extract nutrition from labels or estimate from food images
 * - Edit generated description and nutrition data before saving
 */

function NewFood() {
  const [foodDescription, setFoodDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isJiggling, setIsJiggling] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Generated data state
  const [generatedDescription, setGeneratedDescription] = useState('');
  const [nutritionData, setNutritionData] = useState<NutrientData[]>([]);
  const [showEditMode, setShowEditMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle paste events for direct image pasting
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.items) {
        // Look for image items in the clipboard
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) {
              handleImageSelected(file);
              e.preventDefault(); // Prevent default paste behavior
              break;
            }
          }
        }
      }
    };

    // Add the paste event listener to the document
    document.addEventListener('paste', handlePaste);

    // Clean up
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  // Reset success message after 3 seconds
  useEffect(() => {
    let timer: number | undefined;
    if (submitSuccess) {
      timer = window.setTimeout(() => {
        setSubmitSuccess(false);
        resetForm();
      }, 3000);
    }
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [submitSuccess]);

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFoodDescription(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit form on Enter without Shift key
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent newline
      if (foodDescription.trim() || imageFiles.length > 0) {
        handleProcess(e as unknown as React.FormEvent<HTMLFormElement>);
      }
    }
  };

  const handleImageClick = () => {
    // Trigger the hidden file input
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImageSelected = (file: File) => {
    // Validate file is an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Create a preview URL
    const previewUrl = URL.createObjectURL(file);
    setImagePreviews(prev => [...prev, previewUrl]);
    setImageFiles(prev => [...prev, file]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Add all selected files
      for (let i = 0; i < files.length; i++) {
        handleImageSelected(files[i]);
      }
    }
  };

  const clearImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
    setImageFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllImages = () => {
    imagePreviews.forEach(url => URL.revokeObjectURL(url));
    setImagePreviews([]);
    setImageFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleProcess = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!foodDescription.trim() && imageFiles.length === 0) {
      return;
    }

    setIsProcessing(true);
    setIsJiggling(true);

    try {
      // Create form data for multipart/form-data request
      const formData = new FormData();

      // Add description if provided
      if (foodDescription.trim()) {
        formData.append('description', foodDescription);
      }

      // Add all images
      imageFiles.forEach((file, index) => {
        formData.append('images', file);
      });

      // Process images with backend
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/food/process_images`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: formData
        }
      );

      if (!response.ok) {
        throw new Error('Failed to process images');
      }

      const data = await response.json();

      // Set generated data
      setGeneratedDescription(data.description || foodDescription);
      setNutritionData(data.nutrients || []);
      setShowEditMode(true);

    } catch (error) {
      console.error('Error processing food:', error);
      alert('Error processing food. Please try again.');
    } finally {
      setIsProcessing(false);
      setIsJiggling(false);
    }
  };

  const handleSubmitFinal = async () => {
    if (!generatedDescription.trim()) {
      alert('Please provide a food description');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await request('/food/add_custom_food', 'POST', {
        name: generatedDescription,
        nutrients: JSON.stringify(nutritionData)
      }, 'URLencode');

      if (response.status === 200) {
        // Dispatch event so Foods page can refresh
        window.dispatchEvent(new Event('food-added'));

        // Exit edit mode and show success message
        setShowEditMode(false);
        setSubmitSuccess(true);
      }
    } catch (error) {
      console.error('Error adding food:', error);
      alert('Error adding food. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFoodDescription('');
    clearAllImages();
    setGeneratedDescription('');
    setNutritionData([]);
    setShowEditMode(false);
  };

  const updateNutrient = (index: number, value: string) => {
    const updated = [...nutritionData];
    updated[index].amount = parseFloat(value) || 0;
    setNutritionData(updated);
  };

  const removeNutrient = (index: number) => {
    setNutritionData(nutritionData.filter((_, i) => i !== index));
  };

  if (showEditMode) {
    return (
      <div className="edit-food-container">
        <div className="edit-food-header">
          <h3>Review & Edit Food</h3>
          <button
            className="cancel-edit-button"
            onClick={() => setShowEditMode(false)}
          >
            ← Back
          </button>
        </div>

        <div className="edit-food-form">
          <div className="form-group">
            <label>Food Name</label>
            <input
              type="text"
              value={generatedDescription}
              onChange={(e) => setGeneratedDescription(e.target.value)}
              placeholder="Enter food name"
              className="edit-description-input"
            />
          </div>

          <div className="nutrition-edit-section">
            <h4>Nutritional Information (per 100g)</h4>
            {nutritionData.length === 0 ? (
              <p className="no-nutrition-message">
                No nutritional data available. You can proceed without nutrition data.
              </p>
            ) : (
              <div className="nutrients-list">
                {nutritionData.map((nutrient, index) => (
                  <div key={index} className="nutrient-edit-row">
                    <span className="nutrient-name">{nutrient.name}</span>
                    <div className="nutrient-input-group">
                      <input
                        type="number"
                        step="0.01"
                        value={nutrient.amount}
                        onChange={(e) => updateNutrient(index, e.target.value)}
                        className="nutrient-amount-input"
                      />
                      <span className="nutrient-unit">{nutrient.unit}</span>
                      <button
                        type="button"
                        onClick={() => removeNutrient(index)}
                        className="remove-nutrient-button"
                        title="Remove nutrient"
                      >
                        <Trashcan />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="edit-actions">
            <button
              onClick={handleSubmitFinal}
              disabled={isSubmitting || !generatedDescription.trim()}
              className="submit-food-button"
            >
              {isSubmitting ? 'Saving...' : 'Save Food'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <form
        ref={formRef}
        className="form-elements-wrapper"
        onSubmit={handleProcess}
      >
        <div className="entry-form-bubble">
          <textarea
            ref={textareaRef}
            className={`input-journal ${isJiggling ? 'jiggle-text' : ''}`}
            placeholder="Describe your food or upload images (nutrition label, food photo, etc.)"
            value={foodDescription}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
          />

          {/* Image upload button */}
          <div className="image-upload-container">
            <button
              type="button"
              className="image-upload-button"
              onClick={handleImageClick}
              disabled={isProcessing}
              title="Upload or paste images"
            >
              <ImageIcon />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* Submit button */}
          <div className='new-smart-log-button-container'>
            {!isProcessing && (foodDescription || imageFiles.length > 0) && (
              <HoverButton
                type="submit"
                className="new-log-button"
                childrenOn={<IsOk/>}
                childrenOff={<Arrow/>}
                disabled={isProcessing}
              >
              </HoverButton>
            )}
          </div>
        </div>

        {/* Image previews */}
        {imagePreviews.length > 0 && (
          <div className="images-preview-grid">
            {imagePreviews.map((preview, index) => (
              <div key={index} className="image-preview-container">
                <img src={preview} alt={`Preview ${index + 1}`} className="image-preview" />
                <button
                  type="button"
                  className="remove-image-button"
                  onClick={() => clearImage(index)}
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Success message */}
        {submitSuccess && (
          <div className="success-message">
            Food added successfully!
          </div>
        )}
      </form>
    </>
  );
}

export default NewFood;
