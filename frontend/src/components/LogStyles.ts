import styled, { css, keyframes } from 'styled-components';

const logGroupExit = keyframes`
  0%   { opacity: 1; transform: scale(1)    translateY(0); }
  40%  { opacity: 0.6; transform: scale(0.99) translateY(0); }
  100% { opacity: 0; transform: scale(0.97) translateY(-4px); }
`;

// ── Column spaces (shared with edit forms) ────────────────────────────

export const FoodNameSpace = styled.div`
  padding-top: 12px;
  padding-bottom: 12px;
  padding-left: 27px;
  padding-right: 10px;
  width: var(--log-name-width);
  min-width: 0;
  font-family: Funnel Sans;
  font-size: 19px;
  color: oklch(0.924 0.063 295 / 92%);
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

export const FoodPortionSpace = styled.div`
  padding-top: 12px;
  padding-bottom: 12px;
  padding-left: 12px;
  width: var(--log-portion-width);
  min-width: 0;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  font-size: 19px;
  color: oklch(0.924 0.063 295 / 42%);
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
  padding-right: 20px;
  background: none;
  border: none;
  font-family: Inconsolata;
  text-align: right;
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
  font-family: 'Funnel Sans', sans-serif;
  color: oklch(0.637 0.185 295 / 65%);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  background-color: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s ease;

  &:hover {
    color: oklch(0.637 0.185 295 / 90%);
  }
`;

// ── Log wrappers ──────────────────────────────────────────────────────

export const DeletingWrapper = styled.div<{ $isDeleting?: boolean }>`
  width: 100%;
  max-width: calc(var(--modal-width) + 150px);
  margin: 0 auto;
  ${p => p.$isDeleting && css`
    animation: ${logGroupExit} 0.45s ease-in forwards;
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
  transition: all 0.1s ease;
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
  font-family: 'Inconsolata', monospace;
  color: #f5e6c8;
  font-size: 18px;
  font-style: italic;
  margin-top: 30%;
  align-self: center;
  text-align: center;
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
  font-family: Inconsolata;
  font-size: 19px;
  border-radius: 14px;
  background-color: transparent;
  color: var(--white);
  justify-content: flex-start;
  transition: all 0.1s ease;
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
  font-family: Inconsolata;
  font-size: 19px;
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
  color: oklch(0.924 0.063 295 / 25%);
  font-size: 20px;
  line-height: 1;
  padding: 0;
  width: 32px;
  flex-shrink: 0;
  margin-left: -32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, transform 0.2s ease;

  ${p => p.$expanded && css`
    transform: rotate(90deg);
    color: oklch(0.924 0.063 295 / 90%);
  `}

  &:hover {
    color: oklch(0.924 0.063 295 / 90%);
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
  font-size: 16px;
  line-height: 1;
  transition: color 0.15s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);

  &:hover {
    color: oklch(0.924 0.063 295 / 90%);
    transform: scale(1.3) rotate(90deg);
  }
`;

export const MealRowContainer = styled.div<{ $active?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  padding-left: 32px;
  padding-right: 28px;

  ${HoverDeleteBtn} {
    position: absolute;
    right: 4px;
    top: 0;
    bottom: 0;
    margin: auto;
    height: fit-content;
    opacity: 0;
    transition: opacity 0.15s ease, color 0.15s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  &:hover ${HoverDeleteBtn} {
    opacity: 1;
  }

  ${p => p.$active && css`
    ${HoverDeleteBtn} {
      opacity: 1;
    }
  `}
`;

export const ClickableMealName = styled.span`
  cursor: pointer;
  transition: opacity 0.15s ease;

  &:hover {
    opacity: 0.7;
    text-decoration: underline;
    text-underline-offset: 3px;
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
  font-family: Inconsolata;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  border-radius: 14px;
  background-color: oklch(0.279 0.075 295 / 75%);
  color: var(--white);
  justify-content: flex-start;
  transition: all 0.1s ease;
  box-sizing: border-box;
`;
