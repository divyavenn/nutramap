import React, { useState } from 'react';
import { request } from './endpoints';
import { useRefreshLogs } from './dashboard_states';
import { AnimatedText } from './AnimatedText';
import styled from 'styled-components';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9000;
`;

const Modal = styled.div`
  background: #1c002b;
  border-radius: 16px;
  padding: 40px;
  max-width: 480px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Title = styled.h2`
  font-family: 'Abyssinica SIL', Georgia, Times, 'Times New Roman', serif;
  font-size: 22px;
  font-weight: normal;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
`;

const Subtitle = styled.p`
  font-family: 'Ubuntu', sans-serif;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
  margin: -16px 0 0;
`;

const NameInput = styled.input`
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  color: rgba(255, 245, 220, 0.9);
  font-family: Inconsolata, monospace;
  font-size: 18px;
  outline: none;
  padding: 4px 2px 6px;
  width: 100%;
  box-sizing: border-box;

  &::placeholder {
    color: rgba(255, 255, 255, 0.25);
  }
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const CancelBtn = styled.button`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-family: 'Ubuntu', sans-serif;
  font-size: 13px;
  cursor: pointer;
  padding: 8px 12px;

  &:hover {
    color: rgba(255, 255, 255, 0.8);
  }
`;

const SubmitBtn = styled.button`
  background: rgba(140, 60, 255, 0.7);
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'Ubuntu', sans-serif;
  font-size: 13px;
  cursor: pointer;
  padding: 8px 20px;
  transition: background-color 0.15s ease;
  min-width: 120px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) {
    background: rgba(140, 60, 255, 0.95);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

interface CreateRecipeModalProps {
  logId: string;
  mealName: string;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateRecipeModal({ logId, mealName, onClose, onSuccess }: CreateRecipeModalProps) {
  const [recipeName, setRecipeName] = useState(mealName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const refreshLogs = useRefreshLogs();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('log_id', logId);
      fd.append('recipe_name', recipeName.trim());
      await request('/recipes/create-from-meal', 'POST', fd);
      try { localStorage.removeItem('recipes_cache'); } catch {}
      refreshLogs();
      onSuccess();
    } catch (error) {
      console.error('Error creating recipe:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Title>save as recipe</Title>
        <Subtitle>this meal will be linked to a new recipe you can reuse later</Subtitle>
        <form onSubmit={handleSubmit}>
          <NameInput
            value={recipeName}
            onChange={(e) => setRecipeName(e.target.value)}
            placeholder="recipe name"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          />
          <ButtonRow style={{ marginTop: 24 }}>
            <CancelBtn type="button" onClick={onClose}>cancel</CancelBtn>
            <SubmitBtn type="submit" disabled={!recipeName.trim() || isSubmitting}>
              {isSubmitting ? <AnimatedText text="saving" /> : 'create recipe'}
            </SubmitBtn>
          </ButtonRow>
        </form>
      </Modal>
    </Overlay>
  );
}

export { CreateRecipeModal };
