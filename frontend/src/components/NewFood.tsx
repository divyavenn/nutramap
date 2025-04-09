import React, { useState, useRef, useEffect } from 'react';
import { request } from './endpoints';
import { HoverButton } from './Sections';
import Arrow from '../assets/images/arrow.svg?react';
import IsOk from '../assets/images/checkmark.svg?react';
import ImageIcon from '../assets/images/image.svg?react';
import '../assets/css/foods.css';

/**
 * NewFood component for adding custom foods
 * This component allows users to:
 * - Enter a food description
 * - Upload an image file or paste an image directly
 * - Submit the data to create a custom food
 */

function NewFood() {
  const [foodDescription, setFoodDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isJiggling, setIsJiggling] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
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
      if (foodDescription.trim()) {
        handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
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
    setImagePreview(previewUrl);
    setImageFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleImageSelected(files[0]);
    }
  };

  const clearImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(null);
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!foodDescription.trim()) return;
    console.log("Submitting...")
    
    setIsSubmitting(true);
    setIsJiggling(true);
    
    try {
      // Create form data for multipart/form-data request
      const formData = new FormData();
      formData.append('food_description', foodDescription);
      
      // Add image if available
      if (imageFile) {
        formData.append('food_image', imageFile);
      }
      
      // Make the API request
      let response = await request('/food/add_custom_food', 'POST', formData);
      
      if (response.status === 200) {
        // Reset form
        setFoodDescription('');
        clearImage();
        setSubmitSuccess(true);
      }
    } catch (error) {
      console.error('Error adding food:', error);
    } finally {
      setIsSubmitting(false);
      setIsJiggling(false);
    }
  };

  return (
    <>
      <form
        ref={formRef}
        className="form-elements-wrapper" 
        onSubmit={handleSubmit}
      >
        <div className="entry-form-bubble">
          <textarea
            ref={textareaRef}
            className={`input-journal ${isJiggling ? 'jiggle-text' : ''}`}
            placeholder="Describe your food (e.g., 'Homemade chocolate chip cookie with walnuts')"
            value={foodDescription}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            required
          />
          
          {/* Image upload button */}
          <div className="image-upload-container">
            <button
              type="button"
              className="image-upload-button"
              onClick={handleImageClick}
              disabled={isSubmitting}
              title="Upload or paste an image of your food"
            >
              <ImageIcon />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>
          
          {/* Submit button */}
          <div className='new-smart-log-button-container'>
            {!isSubmitting && foodDescription && (
              <HoverButton
                type="submit"
                className="new-log-button"
                childrenOn={<IsOk/>}
                childrenOff={<Arrow/>}
                disabled={isSubmitting}
              >
              </HoverButton>
            )}
          </div>
        </div>
        
        {/* Image preview */}
        {imagePreview && (
          <div className="image-preview-container">
            <img src={imagePreview} alt="Food preview" className="image-preview" />
            <button 
              type="button" 
              className="remove-image-button"
              onClick={clearImage}
              aria-label="Remove image"
            >
              ×
            </button>
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