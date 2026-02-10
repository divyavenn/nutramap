import { useState, useRef, useEffect } from 'react';
import { request } from './endpoints';
import { HoverButton } from './Sections';
import Arrow from '../assets/images/arrow.svg?react';
import IsOk from '../assets/images/checkmark.svg?react';
import ImageIcon from '../assets/images/image.svg?react';
import '../assets/css/foods.css';
import { useSetRecoilState } from 'recoil';
import { foodsAtom } from './account_states';

/**
 * NewFood component for adding custom foods
 * This component allows users to:
 * - Enter a food description (optional)
 * - Upload or paste multiple images
 * - Auto-extract nutrition from labels or estimate from food images
 * - Submit directly without review modal
 */

function NewFood() {
  const [foodDescription, setFoodDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isJiggling, setIsJiggling] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const setFoods = useSetRecoilState(foodsAtom);

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
    // Revoke all object URLs to free memory
    imagePreviews.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Error revoking URL:', e);
      }
    });

    // Clear state
    setImagePreviews([]);
    setImageFiles([]);

    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    console.log('Cleared all images'); // Debug log
  };

  const handleProcess = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!foodDescription.trim() && imageFiles.length === 0) {
      return;
    }

    // Capture the current values before clearing
    const descriptionToProcess = foodDescription;
    const filesToProcess = [...imageFiles];

    // Clear UI immediately (before async operations)
    const pendingName = descriptionToProcess.trim() || 'new food';
    setFoodDescription('');
    clearAllImages();

    setIsProcessing(true);
    setIsJiggling(true);

    // Notify foods page to show a pending tag
    window.dispatchEvent(new CustomEvent('food-processing', { detail: { name: pendingName } }));

    try {
      // Create form data for multipart/form-data request
      const formData = new FormData();

      // Add description if provided
      if (descriptionToProcess.trim()) {
        formData.append('description', descriptionToProcess);
      }

      // Add all images (using captured files)
      filesToProcess.forEach((file) => {
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

      // Directly submit the food without review modal
      const generatedDescription = data.description || foodDescription;
      const nutritionData = data.nutrients || [];

      const addResponse = await request('/food/add_custom_food', 'POST', {
        name: generatedDescription,
        nutrients: JSON.stringify(nutritionData)
      }, 'URLencode');

      if (addResponse.status === 200) {
        // Update localStorage cache with new food
        const foodId = addResponse.body.food_id;
        if (foodId) {
          const foodsCache = JSON.parse(localStorage.getItem('foods') || '{}');
          foodsCache[generatedDescription] = parseInt(foodId);
          localStorage.setItem('foods', JSON.stringify(foodsCache));

          // Also update the Recoil atom so autocomplete works immediately
          setFoods(foodsCache);
        }

        // Dispatch event with the new food ID so Foods page can refresh and animate
        const event = new CustomEvent('food-added', { detail: { foodId } });
        window.dispatchEvent(event);
      }

    } catch (error) {
      console.error('Error processing food:', error);
      alert('Error processing food. Please try again.');
      window.dispatchEvent(new CustomEvent('food-processing-done'));
    } finally {
      setIsProcessing(false);
      setIsJiggling(false);
    }
  };

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

      </form>

    </>
  );
}

export default NewFood;
