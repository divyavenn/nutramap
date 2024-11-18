
import { DateRange } from 'react-date-range';
import {TimePeriod, RangeType} from './structures'
import DatePicker from 'react-datepicker';
import 'react-date-range/dist/styles.css'; // main style file
import 'react-date-range/dist/theme/default.css'; 
import 'react-datepicker/dist/react-datepicker.css';
import '../assets/css/date_picker.css'
import '../assets/css/dates.css'

import React, {useState, useEffect, useRef, forwardRef} from 'react'
import { DateSelectorProps, getCurrentPeriod } from './structures';

import {ImageButton} from '../components/Sections'
import RightArrow from '../assets/images/caret-right.svg?react'
import LeftArrow from '../assets/images/caret-left.svg?react'
import { dateRangeAtom, rangeTypeAtom } from './dashboard_states';
import { useRecoilState } from 'recoil';
import { useRefreshLogs, useRefreshRequirements } from './dashboard_states';


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
  range: TimePeriod;
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
    const handleClickOutside = (event: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
  
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside); // Cleanup on unmount
  }, [calendarRef, setIsOpen]);

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
            ranges={[{ startDate: range.start, endDate: range.end, key: 'selection' }]}
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



function DateSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const toggleCalendar = () => setIsOpen(!isOpen);
  const [rangeType, setRangeType] = useRecoilState(rangeTypeAtom)
  const [dateRange, setDateRange] = useRecoilState(dateRangeAtom)

  const refreshLogs = useRefreshLogs();
  const refreshRequirements = useRefreshRequirements()

  useEffect(() => {
    refreshRequirements()
    refreshLogs()
  }, [dateRange])

  const handleNextMonth = () => {
    if (rangeType === RangeType.default) {
      // Move to the next entire month
      setDateRange(new TimePeriod(
        new Date(dateRange.start.getFullYear(), dateRange.start.getMonth() + 1, 1),
        new Date(dateRange.start.getFullYear(), dateRange.start.getMonth() + 2, 0)
      ));
    }
    else if (rangeType === RangeType.custom) {
      // Calculate the difference between the start and end dates in milliseconds
      const rangeDuration = dateRange.end.getTime() - dateRange.start.getTime();
      // Move both start and end forward by the duration of the range
      setDateRange(new TimePeriod(
        new Date(dateRange.start.getTime() + rangeDuration),
        new Date(dateRange.end.getTime() + rangeDuration)
      ));
    }
  };
  
  const handlePreviousMonth = () => {
    if (rangeType === RangeType.default) {
      // Move to the previous entire month
      setDateRange({
        start: new Date(dateRange.start.getFullYear(), dateRange.start.getMonth() - 1, 1),
        end: new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), 0)
      });
    } else if (rangeType === RangeType.custom) {
      // Calculate the difference between the start and end dates in milliseconds
      const rangeDuration = dateRange.end.getTime() - dateRange.start.getTime();
      // Move both start and end backward by the duration of the range
      setDateRange(new TimePeriod(
        new Date(dateRange.start.getTime() - rangeDuration),
        new Date(dateRange.end.getTime() - rangeDuration)));
    }
  };

  const handleSelect = (ranges: { selection: { startDate: Date, endDate: Date } }) => {
    const { startDate, endDate } = ranges.selection;
    setRangeType(RangeType.custom);
    setDateRange(new TimePeriod(startDate, endDate));
  };

  return (
    <div className="dashboard-menu">
      <div className="range-selector">
      {!isOpen && (
      <div className="date-selector">
            <ImageButton className="month-arrow left" onClick={handlePreviousMonth}>
              <LeftArrow/>
            </ImageButton>
            <div className="range-text"  onClick = {toggleCalendar}>
              {formatDateRange(dateRange.start, dateRange.end)}
            </div>
            <ImageButton className="month-arrow" onClick={handleNextMonth}>
              <RightArrow/>
            </ImageButton>
          </div>)}
        {!isOpen && rangeType === RangeType.custom && (
          <div className="today" onClick = {() =>
            {
              setRangeType(RangeType.default)
              setDateRange(getCurrentPeriod())
            }
          }>today</div>
        )}
      </div>
      <CalendarRange
              range={dateRange}
              handleSelect={handleSelect}
              isOpen = {isOpen}
              setIsOpen={setIsOpen}
              clickToOpen = {<div className="range-text">{formatDateRange(dateRange.start, dateRange.end)}</div>}
            />
    </div>
  );
}


export {DateSelector, TimePeriod, RangeType, CalendarRange, Calendar, CalendarDay, getCurrentPeriod}