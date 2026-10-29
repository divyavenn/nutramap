import styled, { createGlobalStyle } from 'styled-components';
import { SvgButton } from './Sections.styled';

export const LogNewGlobalStyles = createGlobalStyle`
  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  input[type="number"] {
    -moz-appearance: textfield;
  }

  input, textarea {
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    color: var(--white);
    background-color: transparent;
    border: none;
    outline: none;
    transition: color 150ms ease, background-color 150ms ease;
  }

  ::placeholder {
    color: var(--color-text-placeholder) !important;
    opacity: 1 !important;
  }

  :-ms-input-placeholder {
    color: var(--color-text-placeholder) !important;
  }

  ::-ms-input-placeholder {
    color: var(--color-text-placeholder) !important;
  }
`;

// .form-elements-wrapper — keep className="form-elements-wrapper" for tutorial selector
export const FormElementsWrapper = styled.form`
  width: 100%;
  max-width: var(--modal-width);
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  position: relative;
`;

// .entry-form-bubble — keep className="entry-form-bubble" for nested hover selectors
export const EntryFormBubble = styled.div`
  display: flex;
  padding: 18px 22px;
  border-radius: 14px;
  align-items: center;
  color: var(--white);
  transition: background-color 150ms ease, box-shadow 150ms ease;
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  opacity: 1;
  background-color: oklch(0.924 0.063 295 / 7%);
  border: none;
  box-shadow: 0 2px 20px oklch(0 0 0 / 35%), inset 0 1px 0 oklch(0.924 0.063 295 / 5%);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  justify-content: space-between;

  /* A light lift on hover; focus is the state that matters, so it gets the clear ring */
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: oklch(0.924 0.063 295 / 10%);
    }
  }

  &:focus-within {
    background-color: oklch(0.924 0.063 295 / 12%);
    box-shadow: 0 2px 20px oklch(0 0 0 / 35%), 0 0 0 2px var(--accent-purple);
  }
`;

export const NewLogInputJournal = styled.textarea`
  width: calc(100% - 60px);
  resize: none;
  font-family: var(--font-mono);
  font-size: var(--text-body);
  line-height: 1.5;
  color: inherit;
  background: none;
  padding-top: 4px;
  padding-bottom: 4px;
  padding-inline-start: 4px;
  border: none;
  outline: none;
  transition: background-color 150ms ease, color 150ms ease, opacity 150ms ease-out;

  &::placeholder {
    text-align: start;
    color: var(--color-text-placeholder);
  }

  /* Submitting: stays focusable (read-only), dimmed until the parse returns */
  &[aria-disabled="true"] {
    opacity: 0.5;
  }
`;

// Styled submit button for the log form — overrides SvgButton sizing/colors
export const NewLogButton = styled(SvgButton)`
  align-items: center;
  justify-content: center;
  margin-inline-end: 2px;
  order: 1;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background-color: oklch(0.637 0.185 295 / 15%);
  transition: background-color 0.18s ease, scale 150ms ease-out;
  flex-shrink: 0;

  svg {
    fill: oklch(0.924 0.063 295 / 80%);
    width: 18px;
    height: 18px;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: oklch(0.637 0.185 295 / 30%);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover svg {
      fill: oklch(0.214 0.038 295);
      width: 18px;
      height: 18px;
    }
  }
`;
