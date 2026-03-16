import { useState, useRef, useEffect } from 'react';
import { request } from './endpoints';
import Arrow from '../assets/images/arrow.svg?react';
import IsOk from '../assets/images/checkmark.svg?react';
import ImageIcon from '../assets/images/image.svg?react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { EntryFormBubble } from './LogNew.styled';
import {
  FoodFormWrapper,
  FoodJournalInput,
  ImageUploadContainer,
  ImageUploadButton,
  SmartLogButtonContainer,
  FoodLogButton,
  ImagesPreviewGrid,
  ImagePreviewContainer,
  ImagePreviewEl,
  RemoveImageButton,
} from './Foods.styled';
import { pendingCustomFoodsAtom, PendingCustomFood } from './account_states';
import { tutorialEvent } from './TryTutorial';
import { AnimatePresence, motion } from 'framer-motion';

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

  const pendingCustomFoods = useRecoilValue(pendingCustomFoodsAtom);
  const setPendingCustomFoods = useSetRecoilState(pendingCustomFoodsAtom);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);
  const knownFoodsCountRef = useRef<number | null>(null);
  const imageTransition = { type: 'spring', stiffness: 420, damping: 32, mass: 0.6 };

  const normalizeFoodName = (value: unknown): string => {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  };

  // Poll GET /food/custom-foods while foods are pending.
  // When a new food appears, remove the oldest pending entry.
  // Restarts automatically if the component remounts after navigation.
  useEffect(() => {
    if (pendingCustomFoods.length === 0) {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
      knownFoodsCountRef.current = null;
      return;
    }

    if (pollIntervalRef.current !== null) return; // already polling

    pollCountRef.current = 0;
    knownFoodsCountRef.current = null;

    pollIntervalRef.current = setInterval(async () => {
      pollCountRef.current++;
      try {
        const response = await request('/food/custom-foods', 'GET');
        if (response.body && Array.isArray(response.body)) {
          const existingFoodNames = new Set(
            response.body
              .map((food: any) => normalizeFoodName(food?.name ?? food?.food_name ?? ''))
              .filter(Boolean)
          );

          // Clear pending entries as soon as their names exist server-side.
          setPendingCustomFoods(prev => prev.filter((pending) => {
            const pendingName = normalizeFoodName(pending.name);
            if (!pendingName || pendingName === 'new food') return true;
            return !existingFoodNames.has(pendingName);
          }));

          const currentCount: number = response.body.length;
          if (knownFoodsCountRef.current === null) {
            knownFoodsCountRef.current = currentCount; // establish baseline
          } else if (currentCount > knownFoodsCountRef.current) {
            const added = currentCount - knownFoodsCountRef.current;
            knownFoodsCountRef.current = currentCount;
            try { localStorage.removeItem('custom_foods_cache'); } catch (e) {}
            // Fallback for image-only submissions where pending name is generic.
            // Remove up to `added` oldest generic pending entries.
            setPendingCustomFoods(prev => {
              let remainingToClear = added;
              return prev.filter((pending) => {
                if (remainingToClear <= 0) return true;
                const pendingName = normalizeFoodName(pending.name);
                if (!pendingName || pendingName === 'new food') {
                  remainingToClear--;
                  return false;
                }
                return true;
              });
            });
          }
        }
      } catch (e) { /* network error — keep polling */ }

      if (pollCountRef.current >= 10) {
        clearInterval(pollIntervalRef.current!);
        pollIntervalRef.current = null;
        if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current!); pollTimeoutRef.current = null; }
        try { localStorage.removeItem('custom_foods_cache'); } catch (e) {}
        setPendingCustomFoods([]);
      }
    }, 2000);

    pollTimeoutRef.current = setTimeout(() => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      try { localStorage.removeItem('custom_foods_cache'); } catch (e) {}
      setPendingCustomFoods([]);
      pollTimeoutRef.current = null;
    }, 30000);

    return () => {
      // Clear timers on unmount but leave atom intact so polling resumes on remount.
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCustomFoods.length]);

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

    if (!foodDescription.trim() && imageFiles.length === 0) return;

    const descriptionToProcess = foodDescription;
    const filesToProcess = [...imageFiles];
    const pendingName = descriptionToProcess.trim() || 'new food';

    setFoodDescription('');
    clearAllImages();
    setIsProcessing(true);
    setIsJiggling(true);

    const pendingItem: PendingCustomFood = {
      name: pendingName,
      timestamp: new Date().toISOString(),
    };
    setPendingCustomFoods(prev => [...prev, pendingItem]);

    try {
      const formData = new FormData();
      if (descriptionToProcess.trim()) {
        formData.append('description', descriptionToProcess);
      }
      filesToProcess.forEach(file => formData.append('images', file));

      // Backend returns immediately; all processing runs in a background task.
      const rawApiUrl = import.meta.env.VITE_API_URL;
      const apiBase = rawApiUrl
        ? rawApiUrl.trim().replace(/[‐‑‒–—−]/g, '--').replace(/\/+$/, '')
        : rawApiUrl;
      if (!apiBase || apiBase === 'undefined') {
        throw new Error('VITE_API_URL is not defined');
      }

      await fetch(`${apiBase}/food/process_and_add`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
        body: formData,
      });

      tutorialEvent('tutorial:food-created');
      // Polling (useEffect above) will detect the new food and clear the pending entry.
    } catch (error) {
      console.error('Error submitting food:', error);
      alert('Error submitting food. Please try again.');
      setPendingCustomFoods(prev => prev.filter(p => p.timestamp !== pendingItem.timestamp));
    } finally {
      setIsProcessing(false);
      setIsJiggling(false);
    }
  };

  return (
    <>
      <FoodFormWrapper ref={formRef} onSubmit={handleProcess} className="form-elements-wrapper">
        <EntryFormBubble>
          <FoodJournalInput
            ref={textareaRef}
            $jiggling={isJiggling}
            placeholder="Describe a food or drop a nutrition label image"
            value={foodDescription}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
          />

          {/* Image upload button */}
          <ImageUploadContainer>
            <ImageUploadButton
              type="button"
              onClick={handleImageClick}
              disabled={isProcessing}
              title="Upload or paste images"
            >
              <ImageIcon />
            </ImageUploadButton>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </ImageUploadContainer>

          {/* Submit button */}
          <SmartLogButtonContainer>
            {!isProcessing && (foodDescription || imageFiles.length > 0) && (
              <FoodLogButton
                type="submit"
                childrenOn={<IsOk/>}
                childrenOff={<Arrow/>}
                disabled={isProcessing}
              />
            )}
          </SmartLogButtonContainer>
        </EntryFormBubble>

        {/* Image previews */}
        {imagePreviews.length > 0 && (
          <motion.div layout transition={imageTransition}>
            <ImagesPreviewGrid>
              <AnimatePresence initial={false} mode="popLayout">
                {imagePreviews.map((preview, index) => (
                  <motion.div
                    key={`${preview}-${index}`}
                    layout
                    initial={{ opacity: 0, y: 8, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.9 }}
                    transition={imageTransition}
                  >
                    <ImagePreviewContainer>
                      <ImagePreviewEl src={preview} alt={`Preview ${index + 1}`} />
                      <RemoveImageButton
                        type="button"
                        onClick={() => clearImage(index)}
                        aria-label="Remove image"
                      >
                        ×
                      </RemoveImageButton>
                    </ImagePreviewContainer>
                  </motion.div>
                ))}
              </AnimatePresence>
            </ImagesPreviewGrid>
          </motion.div>
        )}
      </FoodFormWrapper>
    </>
  );
}

export default NewFood;
