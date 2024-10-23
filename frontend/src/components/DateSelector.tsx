
import '../assets/css/dates.css'
import { DateRange } from 'react-date-range';
import 'react-date-range/dist/styles.css'; // main style file
import 'react-date-range/dist/theme/default.css'; 

import {useState, useEffect, useRef} from 'react'

import {ImageButton} from '../components/Sections'
import RightArrow from '../assets/images/caret-right.svg?react'
import LeftArrow from '../assets/images/caret-left.svg?react'


function formatDateRange(startDate: Date, endDate: Date) {
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  if (startYear === endYear) {
    const startMonth = startDate.toLocaleString('en-US', { month: 'long' });
    const endMonth = endDate.toLocaleString('en-US', { month: 'long' });
    if (startMonth === endMonth) return `${startMonth}`;
    else return `${startMonth} to ${endMonth}`;
  } 
  // If different years
  else {
    const startMonthShort = startDate.toLocaleString('en-US', { month: 'short' });
    const endMonthShort = endDate.toLocaleString('en-US', { month: 'short' });
    return `${startMonthShort} ${startYear} to ${endMonthShort} ${endYear}`;
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
    this.start = start;
    this.end = end;
  }
}

interface DateSelectorProps {
  startDate: Date;
  endDate: Date;
  rangeType: RangeType;
  onDateChange: (range: TimePeriod) => void
  onNextMonth: () => void;
  onPreviousMonth: () => void;
}

function DateSelector({startDate, endDate, rangeType, onNextMonth, onPreviousMonth, onDateChange} : DateSelectorProps){
  const [isOpen, setIsOpen] = useState(false); // To control the visibility of the calendar
  const [range, setRange] = useState([
    {
      startDate: startDate,
      endDate: endDate,
      key: 'selection',
    },
  ]);

  const toggleCalendar = () => setIsOpen(!isOpen);

  const handleSelect = (ranges: any) => {
    const { startDate, endDate } = ranges.selection;
    setRange([ranges.selection]);
    onDateChange(new TimePeriod(startDate, endDate)); // Pass the selected dates to the parent component
  };

  const formRef = useRef<HTMLDivElement>(null); 

  // Function to close form if clicked outside
  const handleClickOutside = (event: MouseEvent) => {
    if (formRef.current // check if not null
        && !formRef.current.contains(event.target as Node)) { //  checks if the element that was clicked (event.target) is not a child of or the calendar component itself.
      setIsOpen(false); // Close the form when clicking outside
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
    <div className="dashboard-menu">
      <div className = "range-selector">

        {!isOpen && (
          <div className="date-selector">
            <ImageButton className="month-arrow left" onClick={onPreviousMonth}> <LeftArrow/> </ImageButton>
            <div className="range-text" onClick = {toggleCalendar}>{formatDateRange(startDate, endDate)}</div>
            <ImageButton className="month-arrow" onClick={onNextMonth}> <RightArrow/> </ImageButton>
          </div>
        )}

        {!isOpen && rangeType==RangeType.custom && (
            <div className = "today">today</div>
        )}

      </div>  
      {isOpen && (
          <div ref={formRef} className = 'calendar-popup'>
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
  )
}

export {DateSelector, TimePeriod, RangeType}