import styled, { css } from 'styled-components';

// ── Column spaces (shared with edit forms) ────────────────────────────

export const FoodNameSpace = styled.div`
  padding-top: 12px;
  padding-bottom: 12px;
  padding-inline-start: 27px;
  padding-inline-end: 10px;
  width: var(--log-name-width);
  min-width: 0;
  font-family: var(--font-ui);
  font-size: var(--text-row);
  color: oklch(0.924 0.063 295 / 92%);
  display: flex;
  align-items: center;
  /* Wrap long names rather than clipping them: there's no other way to read them */
  overflow-wrap: anywhere;
`;

export const FoodPortionSpace = styled.div`
  /* Also rendered as the row's edit <button>, so reset button chrome */
  background: none;
  border: 0;
  font: inherit;
  text-align: start;
  cursor: inherit;
  padding-top: 12px;
  padding-bottom: 12px;
  padding-inline-start: 12px;
  width: var(--log-portion-width);
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  font-size: var(--text-row);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
`;

export const FoodWeightSpace = styled.div`
  width: var(--log-weight-width);
  display: flex;
  padding-top: 10px;
  padding-bottom: 10px;
  align-items: center;
`;

export const FoodDateSpace = styled.div`
  padding-top: 10px;
  padding-bottom: 10px;
  width: var(--log-date-width);
  display: flex;
  align-items: center;
`;

export const FoodTimeSpace = styled.div`
  display: flex;
  width: var(--log-time-width);
  padding-top: 10px;
  padding-bottom: 10px;
  justify-content: flex-end;
  align-items: center;
  padding-inline-end: 20px;
  background: none;
  border: none;
  font-family: var(--font-mono);
  text-align: end;
  flex-shrink: 0;
`;

// ── Date divider ──────────────────────────────────────────────────────

export const DateDividerEl = styled.div`
  width: 100%;
  max-width: calc(var(--modal-width) + 150px);
  margin-top: 28px;
  margin-bottom: 12px;
  border-bottom-style: solid;
  border-bottom-width: .5px;
  border-bottom-color: oklch(0.637 0.185 295 / 20%);
`;

export const DayButton = styled.button`
  margin-bottom: 4px;
  font-family: var(--font-ui);
  color: var(--color-accent-text);
  font-size: var(--text-label);
  font-weight: 500;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  background-color: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s ease, scale 150ms ease-out;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--color-11);
    }
  }
`;

// ── Log wrappers ──────────────────────────────────────────────────────

export const DeletingWrapper = styled.div<{ $isDeleting?: boolean }>`
  width: 100%;
  max-width: calc(var(--modal-width) + 150px);
  margin: 0 auto;
  transition: opacity 150ms ease;
  /* Dim while the delete request is in flight; the row's exit animation runs once it's gone */
  ${p => p.$isDeleting && css`
    opacity: 0.4;
    pointer-events: none;
  `}
`;

export const LogWrapper = styled.div`
  display: flex;
  width: 100%;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
`;

export const LogsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

export const LogListContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  list-style-type: none;
  padding: 0;
  margin-top: 20px;

  &::-webkit-scrollbar {
    display: none;
  }
`;

export const NoLogsMessage = styled.div`
  font-family: var(--font-mono);
  color: var(--white);
  font-size: var(--text-medium);
  margin-top: 30%;
  align-self: center;
  text-align: center;
`;

export const NoLogsHint = styled.p`
  margin: 8px 0 0;
  font-size: var(--text-body);
  color: var(--color-text-secondary);
`;

// ── Log bubbles ───────────────────────────────────────────────────────

export const LogBubble = styled.div`
  display: flex;
  width: 100%;
  max-width: calc(var(--modal-width) + 150px);
  margin-bottom: 20px;
  flex-direction: row;
  align-self: center;
  align-items: center;
  font-family: var(--font-mono);
  font-size: var(--text-row);
  border-radius: 14px;
  background-color: transparent;
  color: var(--white);
  justify-content: flex-start;
  transition: background-color 100ms ease, color 100ms ease;
  box-sizing: border-box;
`;

export const RecipeBubble = styled.div<{ $expanded?: boolean }>`
  display: flex;
  width: 100%;
  max-width: calc(var(--modal-width) + 150px);
  margin-bottom: 4px;
  flex-direction: row;
  align-self: center;
  align-items: center;
  font-family: var(--font-mono);
  font-size: var(--text-row);
  border-radius: 14px;
  background-color: transparent;
  color: var(--white);
  justify-content: flex-start;
  transition: background-color 0.2s ease;
  box-sizing: border-box;

  ${p => p.$expanded && css`
    background-color: oklch(0.279 0.075 295 / 75%);
    margin-bottom: 0;
  `}
`;

export const MealToggleBtn = styled.button<{ $expanded?: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: var(--text-large);
  line-height: 1;
  padding: 0;
  width: 32px;
  flex-shrink: 0;
  margin-inline-start: -32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, transform 0.2s ease, scale 150ms ease-out;

  svg {
    width: 1em;
    height: 1em;
    fill: currentColor;
  }

  ${p => p.$expanded && css`
    transform: rotate(90deg);
    color: oklch(0.924 0.063 295 / 90%);
  `}

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: oklch(0.924 0.063 295 / 90%);
    }
  }
`;

export const MealComponentsWrapper = styled.div<{ $standalone?: boolean }>`
  ${p => !p.$standalone && css`
    overflow: hidden;
  `}
`;

// ── Row container with hover-reveal delete button ─────────────────────

export const HoverDeleteBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 5px;
  flex-shrink: 0;
  color: oklch(0.924 0.063 295 / 40%);
  font-size: var(--text-body);
  line-height: 1;
  transition: opacity 150ms ease-out, color 150ms ease-out, scale 150ms ease-out;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: oklch(0.924 0.063 295 / 90%);
    }
  }
`;

export const MealRowContainer = styled.div<{ $active?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  padding-inline-start: 32px;
  padding-inline-end: 28px;

  ${HoverDeleteBtn} {
    position: absolute;
    inset-inline-end: 4px;
    top: 0;
    bottom: 0;
    margin: auto;
    height: fit-content;
    opacity: 0;
    transition: opacity 150ms ease-out, color 150ms ease-out, scale 150ms ease-out;
  }

  /* Revealed on hover, on keyboard focus, and always on touch screens (no hover there) */
  &:hover ${HoverDeleteBtn},
  &:focus-within ${HoverDeleteBtn} {
    opacity: 1;
  }

  @media (hover: none) {
    ${HoverDeleteBtn} {
      opacity: 1;
    }
  }

  ${p => p.$active && css`
    ${HoverDeleteBtn} {
      opacity: 1;
    }
  `}
`;

export const ClickableMealName = styled.button`
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: start;
  cursor: pointer;
  transition: opacity 0.15s ease, scale 150ms ease-out;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      opacity: 0.7;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
`;

// ── Loading bubble ─────────────────────────────────────────────────────

export const LoadingRecipeBubble = styled.div`
  display: flex;
  width: 100%;
  max-width: calc(var(--modal-width) + 150px);
  margin-bottom: 20px;
  flex-direction: row;
  align-self: center;
  align-items: start;
  font-family: var(--font-mono);
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  border-radius: 14px;
  background-color: oklch(0.279 0.075 295 / 75%);
  color: var(--white);
  justify-content: flex-start;
  transition: background-color 100ms ease, color 100ms ease;
  box-sizing: border-box;
`;
