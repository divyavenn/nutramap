
import { DateRange } from 'react-date-range';
import DatePicker from 'react-datepicker';
import 'react-date-range/dist/styles.css'; // main style file
import 'react-date-range/dist/theme/default.css'; 
import 'react-datepicker/dist/react-datepicker.css';
import '../assets/css/date_picker.css'
import '../assets/css/dates.css'

import React, {useState, useEffect, useRef, forwardRef} from 'react'

import {ImageButton} from '../components/Sections'
import RightArrow from '../assets/images/caret-right.svg?react'
import LeftArrow from '../assets/images/caret-left.svg?react'

function formatDateRange(startDate: Date, endDate: Date) {
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();
  const startMonth = startDate.toLocaleString('en-US', { month: 'short' });
  const endMonth = endDate.toLocaleString('en-US', { month: 'short' });
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();

  if (startYear === endYear) {
      // If the same year but different months
      return `${startMonth} ${startDay} to ${endMonth} ${endDay}`;
  } else {
    // If different years
    return `${startMonth} ${startDay}, ${startYear} to ${endMonth} ${endDay}, ${endYear}`;
  }
}

// the default screen shows the beginning of the month to the current time
// clicking the arrows takes you to other (entire) months
enum RangeType {
  default, //start of period (month) to current time + other entire periods with arrow keys
  custom 
  /*any datetime to any datetime, arrows keys increment/decrement by same size as range
    Sept 2021 to Sept 2022 <- Sept 2022 to Sept 2022 -> Sept 2023 to Sept 2024
    July 2023 to Dec 2023 <- Jan 2024 to June 2024 -> July 2024 to Dec 2024
  */
}

class TimePeriod{
  public start : Date;
  public end: Date;

  constructor(start: Date, end: Date) {
    if (start > end) {
      throw new Error("startDate must be before or equal to endDate.");
    }
    // Set the start date to the beginning of the day (hour 0, minute 0, second 0, millisecond 0)
    this.start = new Date(start);
    this.start.setHours(0, 0, 0, 0);

    // Set the end date to the end of the day (hour 23, minute 59, second 59, millisecond 999)
    this.end = new Date(end);
    this.end.setHours(23, 59, 59, 999);
  }
}


interface CalendarProps {
  day: Date;
  handleSelect: (day: any) => void;
  isOpen : boolean;
  setIsOpen : (b :  boolean) => void;
}

const Calendar = forwardRef<HTMLDivElement, CalendarProps>(({ day, handleSelect, isOpen, setIsOpen }, ref) => {
  const calendarRef = ref as React.RefObject<HTMLDivElement> || useRef<HTMLDivElement>(null);
    // Function to close form if clicked outside
  const handleClickOutside = (event: MouseEvent) => {
    if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };
  const [selection, setSelection] = useState([
    {
      startDate: day,
      endDate: day,
      key: 'selection',
    }]);

  const handleSelectRanges = (ranges: any) => {
    // Always set endDate equal to startDate to prevent range selection
    const { day } = ranges.selection;
    setSelection([{
      ...selection[0],
      startDate : day,
      endDate: day, // Force the endDate to be the same as startDate
      key: 'selection',
    }]);
  };

  return (
    <div>
      {isOpen && (
        <div ref={ref || calendarRef} className="calendar-popup">
          <DateRange
            ranges={selection}
            onChange={handleSelectRanges}
            moveRangeOnFirstSelection={false}
            editableDateInputs={false}
            showDateDisplay={false}
            showMonthAndYearPickers={true}
            rangeColors={['#1e002e8d']}
          />
        </div>
      )}
    </div>
  );
});

const CalendarDay = forwardRef<HTMLDivElement, CalendarProps>(({ day, handleSelect, isOpen, setIsOpen }, ref) => {
  const calendarRef = ref as React.RefObject<HTMLDivElement> || useRef<HTMLDivElement>(null);
    // Function to close form if clicked outside
  const handleClickOutside = (event: MouseEvent) => {
    if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };

  const [datePicked, setDay] = useState(day);


  const handleDateChange = (day : any) => {
      setDay(day);
      handleSelect(datePicked); // Call parent function with selected date
  };

  return (
    <div>
      {isOpen && (
        <div ref={ref || calendarRef} className="date-picker-popup">
          <DatePicker
            selected={datePicked} // Pass the selected date
            onChange={handleDateChange} // Your date change handler
            inline
          />
        </div>
      )}
    </div>
  );
})

/*---------------------------------------------------------------------------------*/

interface CalendarRangeProps {
  range: any;
  handleSelect: (ranges: any) => void;
  isOpen : boolean;
  setIsOpen : (b :  boolean) => void;
  clickToOpen : React.ReactNode
}

const CalendarRange = forwardRef<HTMLDivElement, CalendarRangeProps>(({ range, handleSelect, isOpen, setIsOpen, clickToOpen }, ref) => {
  const calendarRef = (ref as React.RefObject<HTMLDivElement>)|| useRef<HTMLDivElement>(null);


  // Function to close form if clicked outside
  const handleClickOutside = (event: MouseEvent) => {
    if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Attach event listener when the calendar opens
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      // Remove event listener when the calendar closes
      document.removeEventListener('mousedown', handleClickOutside);
    }
    // Cleanup function to remove the event listener when the component unmounts
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div>
      {isOpen && (
        // if the parent doesn't pass in a ref, use local ref
        <div ref={ref || calendarRef} className="calendar-popup">
          <DateRange
            ranges={range}
            onChange={handleSelect}
            moveRangeOnFirstSelection={false}
            editableDateInputs={true}
            rangeColors={['#1e002e8d']}
          />
        </div>
      )}
    </div>
  );
});


interface DateSelectorProps {
  startDate: Date;
  endDate: Date;
  rangeType: RangeType;
  setRangeType: (r: RangeType) => void;
  onDateChange: (range: TimePeriod) => void
  onNextMonth: () => void;
  onPreviousMonth: () => void;
}

const getCurrentPeriod = () => {
  let now = new Date()
  return new TimePeriod(
    (new Date(now.getFullYear(), now.getMonth(), 1)), 
    (new Date(now.getFullYear(), now.getMonth() + 1, 0))
  )
}

function DateSelector({ startDate, endDate, rangeType, setRangeType, onNextMonth, onPreviousMonth, onDateChange }: DateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const toggleCalendar = () => setIsOpen(!isOpen);

  const [range, setRange] = useState([
    {
      startDate: startDate,
      endDate: endDate,
      key: 'selection',
    },
  ]);

  const handleSelect = (ranges: any) => {
    const { startDate, endDate } = ranges.selection;
    setRange([ranges.selection]);
    setRangeType(RangeType.custom)
    onDateChange(new TimePeriod(startDate, endDate)); // Pass the selected dates to the parent component
  };

  return (
    <div className="dashboard-menu">
      <div className="range-selector">
      {!isOpen && (
      <div className="date-selector">
            <ImageButton className="month-arrow left" onClick={onPreviousMonth}> <LeftArrow/> </ImageButton>
            <div className="range-text"  onClick = {toggleCalendar} >{formatDateRange(startDate, endDate)}</div>
            <ImageButton className="month-arrow" onClick={onNextMonth}> <RightArrow/> </ImageButton>
          </div>)}
        {!isOpen && rangeType === RangeType.custom && (
          <div className="today" onClick = {() =>
            {
              setRangeType(RangeType.default)
              onDateChange(getCurrentPeriod())
            }
          }>today</div>
        )}
      </div>
      <CalendarRange
              range={range}
              handleSelect={handleSelect}
              isOpen = {isOpen}
              setIsOpen={setIsOpen}
              clickToOpen = {<div className="range-text">{formatDateRange(startDate, endDate)}</div>}
            />
    </div>
  );
}


export {DateSelector, TimePeriod, RangeType, CalendarRange, Calendar, CalendarDay, getCurrentPeriod}