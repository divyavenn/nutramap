import styled, { createGlobalStyle } from 'styled-components';
import { ImageButton } from './Sections';

export const DashboardMenu = styled.div`
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

export const RangeSelector = styled.div`
  display: flex;
  flex-direction: column;
  justify-items: center;
  align-items: center;
`;

export const TodayButton = styled.button`
  justify-self: center;
  align-self: center;
  width: 70px;
  padding: 3px 5px;
  background: none;
  border: 1px solid var(--white);
  border-radius: 20px;
  font-family: var(--font-mono);
  color: var(--white);
  font-size: var(--text-caption);
  font-weight: 400;
  text-align: center;
  cursor: pointer;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      border-color: var(--accent-purple);
      color: var(--color-accent-text);
    }
  }
`;

export const DateSelectorEl = styled.div`
  display: flex;
  width: auto;
  min-height: 30px;
  clear: none;
  flex-direction: row;
  justify-content: center;
  flex-wrap: nowrap;
  align-items: center;
  align-self: flex-end;
  border-radius: 20px;
  background-color: #19050500;
  object-fit: contain;
`;

export const RangeText = styled.button`
  padding: 10px;
  order: 1;
  background: none;
  border: 0;
  color: var(--color-accent-text);
  font-size: var(--text-medium);
  font-family: var(--font-mono);
  font-weight: 400;
  cursor: pointer;
`;

interface MonthArrowProps {
  $left?: boolean;
}

export const MonthArrow = styled(ImageButton)<MonthArrowProps>`
  display: block;
  padding-inline-start: ${({ $left }) => ($left ? '10px' : '0px')};
  padding-inline-end: ${({ $left }) => ($left ? '0px' : '10px')};
  clear: none;
  align-self: center;
  order: 1;
  flex-grow: 1;
  flex-shrink: 1;
  flex-basis: 0%;
  background: none;
  font-size: 0.625rem;
  text-align: center;

  svg {
    fill: var(--color-9);
    height: 20px;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover svg {
      fill: var(--color-11);
    }
  }
`;

export const CalendarPopup = styled.div`
  position: relative;
  z-index: 1000;
  background-color: transparent;
  border-radius: 20px;
  margin-bottom: 50px;
`;

// No base styles needed — only used as a scoping selector for library overrides
export const DatePickerPopup = styled.div``;

// Global styles: react-date-range and react-datepicker library overrides
export const DateSelectorGlobalStyles = createGlobalStyle`
  /* --- Global react-date-range overrides --- */
  .rdrDay {
    background: transparent;
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
    border: 0;
    padding: 0;
    line-height: 3.000em;
    height: 3.000em;
    text-align: center;
    color: var(--white);
  }

  .rdrDayInMonth {
    opacity: 1 !important;
    color: var(--white);
  }

  .rdrDayOutOfMonth {
    opacity: 0.5;
  }

  .rdrDayNumber span {
    color: var(--white);
  }

  .rdrDayDisabled span {
    color: #ffffff9d;
    opacity: 0.5;
  }

  .rdrDayNumber span.rdrDayToday {
    background-color: #1e002e;
    color: var(--white);
  }

  .rdrDayStartPreview,
  .rdrDayEndPreview {
    background-color: #5b2e8d;
  }

  .rdrMonthAndYearPickers select {
    color: var(--white);
    background-color: #1e002e;
    display: flex;
    flex-direction: row;
    justify-content: center;
    text-align: center;
    justify-self: center;
  }

  .rdrNextPrevButton i {
    color: var(--white);
  }

  .rdrNextPrevButton:hover i {
    color: var(--color-accent-text);
  }

  .rdrMonthPicker {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-content: center;
  }

  .rdrMonthAndYearWrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    width: 100%;
  }

  /* --- CalendarPopup-scoped react-date-range overrides --- */
  ${CalendarPopup} .rdrCalendarWrapper {
    border-radius: 20px;
    overflow: hidden;
    background-color: transparent;
    box-shadow: none;
  }

  ${CalendarPopup} .rdrInputRanges input {
    background-color: transparent;
    color: var(--white);
  }

  ${CalendarPopup} .rdrDateDisplayWrapper {
    background-color: transparent;
  }

  ${CalendarPopup} .rdrDateDisplayWrapper input::placeholder,
  ${CalendarPopup} .rdrDateDisplayWrapper input {
    color: var(--white);
    background-color: transparent;
    box-shadow: none;
  }

  ${CalendarPopup} .rdrDateInput {
    background-color: transparent;
  }

  ${CalendarPopup} .rdrDateDisplayItemActive {
    border: 1px solid var(--white) !important;
    box-shadow: none;
  }

  ${CalendarPopup} .rdrDateInput .rdrDateDisplayItem :active {
    color: #e20000;
    border-color: var(--white);
    background-color: transparent;
  }

  ${CalendarPopup} .rdrNextPrevButton {
    background-color: transparent;
    border: none;
  }

  ${CalendarPopup} .rdrMonthAndYearWrapper {
    background-color: transparent;
    border: none;
    color: var(--white);
    text-align: center;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    overflow: hidden;
  }

  ${CalendarPopup} .rdrDay {
    background-color: transparent;
  }

  ${CalendarPopup} .rdrDefinedRangesWrapper {
    background-color: transparent;
    border: none;
  }

  ${CalendarPopup} .rdrDateRangeWrapper {
    color: var(--white);
  }

  ${CalendarPopup} .rdrMonthAndYearPickers {
    font-weight: 600;
    color: var(--white);
  }

  ${CalendarPopup} .rdrWeekDays {
    background-color: transparent;
  }

  ${CalendarPopup} .rdrMonthAndYearWrapper,
  ${CalendarPopup} .rdrWeekDay,
  ${CalendarPopup} .rdrDayNumber {
    color: var(--white);
  }

  ${CalendarPopup} .rdrDay:not(.rdrDayPassive):not(.rdrDayDisabled):hover .rdrInRange,
  ${CalendarPopup} .rdrDay:not(.rdrDayPassive):not(.rdrDayDisabled):hover .rdrDayNumber span {
    background-color: rgba(128, 128, 128, 0.3) !important;
    color: var(--white) !important;
  }

  ${CalendarPopup} .rdrDayStartPreview,
  ${CalendarPopup} .rdrDayInPreview,
  ${CalendarPopup} .rdrDayEndPreview {
    background-color: rgba(128, 128, 128, 0.3) !important;
    opacity: 1 !important;
  }

  ${CalendarPopup} .rdrDayStartPreview span,
  ${CalendarPopup} .rdrDayInPreview span,
  ${CalendarPopup} .rdrDayEndPreview span,
  ${CalendarPopup} .rdrDay:hover span {
    color: var(--white) !important;
    opacity: 1 !important;
  }

  ${CalendarPopup} .rdrDayStartSelected.rdrDayStartPreview,
  ${CalendarPopup} .rdrDayEndSelected.rdrDayEndPreview,
  ${CalendarPopup} .rdrDayInSelected.rdrDayInPreview {
    background-color: var(--color-7) !important;
    opacity: 1 !important;
    z-index: 5 !important;
  }

  ${CalendarPopup} .rdrDayStartSelected.rdrDayStartPreview span,
  ${CalendarPopup} .rdrDayEndSelected.rdrDayEndPreview span,
  ${CalendarPopup} .rdrDayInSelected.rdrDayInPreview span {
    color: var(--white) !important;
    font-weight: bold !important;
    opacity: 1 !important;
  }

  ${CalendarPopup} .rdrDaySelected:not(.rdrDayDisabled):not(.rdrDayPassive) .rdrInRange,
  ${CalendarPopup} .rdrDaySelected:not(.rdrDayDisabled):not(.rdrDayPassive) .rdrDayNumber span {
    background-color: #1e002e !important;
    color: var(--white) !important;
    border-radius: 50% !important;
    opacity: 1 !important;
  }

  /* --- DatePickerPopup-scoped react-date-range overrides --- */
  ${DatePickerPopup} .rdrCalendarWrapper {
    border-radius: 20px;
    background-color: var(--purple);
    overflow: hidden;
  }

  ${DatePickerPopup} .rdrMonthAndYearWrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    background-color: var(--purple);
    color: var(--white);
  }

  ${DatePickerPopup} .rdrDay {
    background: transparent;
    color: var(--white);
    border-radius: 5px;
  }

  ${DatePickerPopup} .rdrDayInMonth {
    color: var(--white);
  }

  ${DatePickerPopup} .rdrDayOutOfMonth {
    color: rgba(255, 255, 255, 0.5);
  }

  ${DatePickerPopup} .rdrNextPrevButton {
    background: none;
    border: none;
    color: var(--white);
  }

  ${DatePickerPopup} .rdrNextPrevButton i {
    color: var(--white);
  }

  ${DatePickerPopup} .rdrNextPrevButton:hover i {
    color: var(--color-accent-text);
  }

  ${DatePickerPopup} .rdrDayToday span {
    background-color: #1e002e;
    color: var(--white);
    border-radius: 50%;
  }

  ${DatePickerPopup} .rdrWeekDays {
    background-color: transparent;
    color: var(--white);
  }

  ${DatePickerPopup} .rdrMonthAndYearPickers select {
    background-color: #1e002e;
    color: var(--white);
  }

  /* --- Global react-datepicker overrides --- */
  .react-datepicker__day {
    color: var(--white) !important;
    font-weight: normal !important;
  }

  .react-datepicker__current-month,
  .react-datepicker__day-name {
    color: var(--white) !important;
  }

  .react-datepicker__day:hover {
    background-color: rgba(128, 128, 128, 0.3) !important;
    color: var(--white) !important;
    opacity: 1 !important;
  }

  .react-datepicker__day.selected-day {
    background-color: var(--color-7) !important;
    color: var(--white) !important;
    border-radius: 50% !important;
    font-weight: bold !important;
    box-shadow: 0 0 0 2px var(--white) !important;
    position: relative !important;
    z-index: 5 !important;
    transform: scale(1.1) !important;
  }

  /* --- .custom-datepicker scoped react-datepicker overrides --- */
  .custom-datepicker .react-datepicker__month-container {
    border-radius: 20px;
    background-color: transparent;
  }

  .custom-datepicker .react-datepicker__header {
    background-color: transparent;
    color: var(--white);
    text-align: center;
  }

  .custom-datepicker .react-datepicker__day {
    background: transparent;
    color: var(--white);
    border-radius: 5px;
  }

  .custom-datepicker .react-datepicker__day--in-range {
    background-color: #1e002e;
    color: var(--white);
    border-radius: 50%;
  }

  .custom-datepicker .react-datepicker__navigation {
    background: none;
    color: var(--white);
  }

  .custom-datepicker .react-datepicker__today-button {
    background-color: transparent;
    color: var(--white);
  }

  /* --- DatePickerPopup-scoped react-datepicker overrides --- */
  ${DatePickerPopup} .react-datepicker__day:hover:not(.react-datepicker__day--selected):not(.react-datepicker__day--keyboard-selected):not(.selected-day) {
    background-color: rgba(128, 128, 128, 0.3) !important;
    color: var(--white) !important;
    opacity: 1 !important;
  }
`;
