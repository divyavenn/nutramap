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

export const TodayButton = styled.div`
  justify-self: center;
  align-self: center;
  width: 70px;
  padding: 3px 5px;
  border: 1px solid #ffffff;
  border-radius: 20px;
  font-family: Inconsolata;
  color: #ffffff;
  font-size: 15px;
  font-weight: 400;
  text-align: center;
  cursor: pointer;

  &:hover {
    border-color: #a855f7;
    color: #a855f7;
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

export const RangeText = styled.div`
  padding: 10px;
  order: 1;
  color: #a855f7;
  font-size: 18px;
  font-family: Inconsolata;
  font-weight: 300;
  cursor: pointer;
`;

interface MonthArrowProps {
  $left?: boolean;
}

export const MonthArrow = styled(ImageButton)<MonthArrowProps>`
  display: block;
  padding-left: ${({ $left }) => ($left ? '10px' : '0px')};
  padding-right: ${({ $left }) => ($left ? '0px' : '10px')};
  clear: none;
  align-self: center;
  order: 1;
  flex-grow: 1;
  flex-shrink: 1;
  flex-basis: 0%;
  background: none;
  font-size: 10px;
  text-align: center;

  svg {
    fill: #a855f7;
    height: 20px;
  }

  &:hover svg {
    fill: #a855f7;
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
    color: #ffffff;
  }

  .rdrDayInMonth {
    opacity: 1 !important;
    color: #ffffff;
  }

  .rdrDayOutOfMonth {
    opacity: 0.5;
  }

  .rdrDayNumber span {
    color: #ffffff;
  }

  .rdrDayDisabled span {
    color: #ffffff9d;
    opacity: 0.5;
  }

  .rdrDayNumber span.rdrDayToday {
    background-color: #1e002e;
    color: #ffffff;
  }

  .rdrDayStartPreview,
  .rdrDayEndPreview {
    background-color: #5b2e8d;
  }

  .rdrMonthAndYearPickers select {
    color: #ffffff;
    background-color: #1e002e;
    display: flex;
    flex-direction: row;
    justify-content: center;
    text-align: center;
    justify-self: center;
  }

  .rdrNextPrevButton i {
    color: #ffffff;
  }

  .rdrNextPrevButton:hover i {
    color: #a29bfe;
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
    color: #fff;
  }

  ${CalendarPopup} .rdrDateDisplayWrapper {
    background-color: transparent;
  }

  ${CalendarPopup} .rdrDateDisplayWrapper input::placeholder,
  ${CalendarPopup} .rdrDateDisplayWrapper input {
    color: #ffffff;
    background-color: transparent;
    box-shadow: none;
  }

  ${CalendarPopup} .rdrDateInput {
    background-color: transparent;
  }

  ${CalendarPopup} .rdrDateDisplayItemActive {
    border: 1px solid white !important;
    box-shadow: none;
  }

  ${CalendarPopup} .rdrDateInput .rdrDateDisplayItem :active {
    color: #e20000;
    border-color: white;
    background-color: transparent;
  }

  ${CalendarPopup} .rdrNextPrevButton {
    background-color: transparent;
    border: none;
  }

  ${CalendarPopup} .rdrMonthAndYearWrapper {
    background-color: transparent;
    border: none;
    color: #fff;
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
    color: #fff;
  }

  ${CalendarPopup} .rdrMonthAndYearPickers {
    font-weight: 600;
    color: #fff;
  }

  ${CalendarPopup} .rdrWeekDays {
    background-color: transparent;
  }

  ${CalendarPopup} .rdrMonthAndYearWrapper,
  ${CalendarPopup} .rdrWeekDay,
  ${CalendarPopup} .rdrDayNumber {
    color: #ffffff;
  }

  ${CalendarPopup} .rdrDay:not(.rdrDayPassive):not(.rdrDayDisabled):hover .rdrInRange,
  ${CalendarPopup} .rdrDay:not(.rdrDayPassive):not(.rdrDayDisabled):hover .rdrDayNumber span {
    background-color: rgba(128, 128, 128, 0.3) !important;
    color: white !important;
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
    color: white !important;
    opacity: 1 !important;
  }

  ${CalendarPopup} .rdrDayStartSelected.rdrDayStartPreview,
  ${CalendarPopup} .rdrDayEndSelected.rdrDayEndPreview,
  ${CalendarPopup} .rdrDayInSelected.rdrDayInPreview {
    background-color: #ff69b4 !important;
    opacity: 1 !important;
    z-index: 5 !important;
  }

  ${CalendarPopup} .rdrDayStartSelected.rdrDayStartPreview span,
  ${CalendarPopup} .rdrDayEndSelected.rdrDayEndPreview span,
  ${CalendarPopup} .rdrDayInSelected.rdrDayInPreview span {
    color: white !important;
    font-weight: bold !important;
    opacity: 1 !important;
  }

  ${CalendarPopup} .rdrDaySelected:not(.rdrDayDisabled):not(.rdrDayPassive) .rdrInRange,
  ${CalendarPopup} .rdrDaySelected:not(.rdrDayDisabled):not(.rdrDayPassive) .rdrDayNumber span {
    background-color: #1e002e !important;
    color: white !important;
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
    color: white;
  }

  ${DatePickerPopup} .rdrDay {
    background: transparent;
    color: white;
    border-radius: 5px;
  }

  ${DatePickerPopup} .rdrDayInMonth {
    color: white;
  }

  ${DatePickerPopup} .rdrDayOutOfMonth {
    color: rgba(255, 255, 255, 0.5);
  }

  ${DatePickerPopup} .rdrNextPrevButton {
    background: none;
    border: none;
    color: white;
  }

  ${DatePickerPopup} .rdrNextPrevButton i {
    color: white;
  }

  ${DatePickerPopup} .rdrNextPrevButton:hover i {
    color: #a29bfe;
  }

  ${DatePickerPopup} .rdrDayToday span {
    background-color: #1e002e;
    color: white;
    border-radius: 50%;
  }

  ${DatePickerPopup} .rdrWeekDays {
    background-color: transparent;
    color: white;
  }

  ${DatePickerPopup} .rdrMonthAndYearPickers select {
    background-color: #1e002e;
    color: white;
  }

  /* --- Global react-datepicker overrides --- */
  .react-datepicker__day {
    color: white !important;
    font-weight: normal !important;
  }

  .react-datepicker__current-month,
  .react-datepicker__day-name {
    color: white !important;
  }

  .react-datepicker__day:hover {
    background-color: rgba(128, 128, 128, 0.3) !important;
    color: white !important;
    opacity: 1 !important;
  }

  .react-datepicker__day.selected-day {
    background-color: #ff69b4 !important;
    color: white !important;
    border-radius: 50% !important;
    font-weight: bold !important;
    box-shadow: 0 0 0 2px white !important;
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
    color: white;
    text-align: center;
  }

  .custom-datepicker .react-datepicker__day {
    background: transparent;
    color: white;
    border-radius: 5px;
  }

  .custom-datepicker .react-datepicker__day--in-range {
    background-color: #1e002e;
    color: white;
    border-radius: 50%;
  }

  .custom-datepicker .react-datepicker__navigation {
    background: none;
    color: white;
  }

  .custom-datepicker .react-datepicker__today-button {
    background-color: transparent;
    color: white;
  }

  /* --- DatePickerPopup-scoped react-datepicker overrides --- */
  ${DatePickerPopup} .react-datepicker__day:hover:not(.react-datepicker__day--selected):not(.react-datepicker__day--keyboard-selected):not(.selected-day) {
    background-color: rgba(128, 128, 128, 0.3) !important;
    color: white !important;
    opacity: 1 !important;
  }
`;
