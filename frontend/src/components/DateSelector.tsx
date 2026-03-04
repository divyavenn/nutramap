import { DateRange } from 'react-date-range';
import {TimePeriod, RangeType} from './structures'
import DatePicker from 'react-datepicker';
import 'react-date-range/dist/styles.css'; // main style file
import 'react-date-range/dist/theme/default.css';
import 'react-datepicker/dist/react-datepicker.css';

import React, {useState, useEffect, useRef, forwardRef} from 'react'
import { DateSelectorProps, getCurrentPeriod } from './structures';
import { AnimatePresence, motion } from 'framer-motion';

import RightArrow from '../assets/images/caret-right.svg?react'
import LeftArrow from '../assets/images/caret-left.svg?react'
import {
  DateSelectorGlobalStyles,
  DashboardMenu,
  RangeSelector,
  TodayButton,
  DateSelectorEl,
  RangeText,
  MonthArrow,
  CalendarPopup,
  DatePickerPopup,
} from './DateSelector.styled';
import { dateRangeAtom, rangeTypeAtom } from './dashboard_states';
import { useRecoilState } from 'recoil';
import { useRefreshLogs, useRefreshRequirements } from './dashboard_states';
import { isLoginExpired } from './utlis';
import { LoginPrompt } from './LoginPrompt';
import { tutorialEvent } from './TryTutorial';


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

const calendarPopupTransition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1],
} as const;

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
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={ref || calendarRef}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={calendarPopupTransition}
            style={{ transformOrigin: 'top center' }}
          >
            <CalendarPopup>
              <DateRange
                ranges={selection}
                onChange={handleSelectRanges}
                moveRangeOnFirstSelection={false}
                editableDateInputs={false}
                showDateDisplay={false}
                showMonthAndYearPickers={true}
                rangeColors={['#1e002e8d']}
              />
            </CalendarPopup>
          </motion.div>
        )}
      </AnimatePresence>
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
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={ref || calendarRef}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={calendarPopupTransition}
            style={{ transformOrigin: 'top center' }}
          >
            <DatePickerPopup>
              <DatePicker
                selected={datePicked} // Pass the selected date
                onChange={handleDateChange} // Your date change handler
                inline
                dayClassName={date =>
                  date.getDate() === datePicked.getDate() &&
                  date.getMonth() === datePicked.getMonth() &&
                  date.getFullYear() === datePicked.getFullYear()
                    ? "selected-day"
                    : ""
                }
              />
            </DatePickerPopup>
          </motion.div>
        )}
      </AnimatePresence>
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
      <AnimatePresence>
        {isOpen && (
          // if the parent doesn't pass in a ref, use local ref
          <motion.div
            ref={ref || calendarRef}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={calendarPopupTransition}
            style={{ transformOrigin: 'top center' }}
          >
            <CalendarPopup>
              <DateRange
                ranges={[{ startDate: range.start, endDate: range.end, key: 'selection' }]}
                onChange={handleSelect}
                moveRangeOnFirstSelection={false}
                editableDateInputs={true}
                rangeColors={['#1e002e8d']}
              />
            </CalendarPopup>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});



function DateSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const toggleCalendar = () => setIsOpen(!isOpen);
  const [rangeType, setRangeType] = useRecoilState(rangeTypeAtom)
  const [dateRange, setDateRange] = useRecoilState(dateRangeAtom)

  const refreshLogs = useRefreshLogs();
  const refreshRequirements = useRefreshRequirements()
  const startMs = dateRange.start.getTime();
  const endMs = dateRange.end.getTime();

  useEffect(() => {
    refreshRequirements()
    refreshLogs()
  }, [startMs, endMs, refreshLogs, refreshRequirements])

  const handleNextMonth = () => {
    if (isLoginExpired()) {
      setShowLoginPrompt(true);
      return;
    }
    if (rangeType === RangeType.default) {
      // Move to the next entire month
      setDateRange(new TimePeriod(
        new Date(dateRange.start.getFullYear(), dateRange.start.getMonth() + 1, 1),
        new Date(dateRange.start.getFullYear(), dateRange.start.getMonth() + 2, 0)
      ));
      tutorialEvent('tutorial:range-changed');
    }
    else if (rangeType === RangeType.custom) {
      // Calculate the difference between the start and end dates in milliseconds
      const rangeDuration = dateRange.end.getTime() - dateRange.start.getTime();
      // Move both start and end forward by the duration of the range
      setDateRange(new TimePeriod(
        new Date(dateRange.start.getTime() + rangeDuration),
        new Date(dateRange.end.getTime() + rangeDuration)
      ));
      tutorialEvent('tutorial:range-changed');
    }
  };
  
  const handlePreviousMonth = () => {
    if (isLoginExpired()) {
      setShowLoginPrompt(true);
      return;
    }
    if (rangeType === RangeType.default) {
      // Move to the previous entire month
      setDateRange({
        start: new Date(dateRange.start.getFullYear(), dateRange.start.getMonth() - 1, 1),
        end: new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), 0)
      });
      tutorialEvent('tutorial:range-changed');
    } else if (rangeType === RangeType.custom) {
      // Calculate the difference between the start and end dates in milliseconds
      const rangeDuration = dateRange.end.getTime() - dateRange.start.getTime();
      // Move both start and end backward by the duration of the range
      setDateRange(new TimePeriod(
        new Date(dateRange.start.getTime() - rangeDuration),
        new Date(dateRange.end.getTime() - rangeDuration)));
      tutorialEvent('tutorial:range-changed');
    }
  };

  const handleSelect = (ranges: { selection: { startDate: Date, endDate: Date } }) => {
    if (isLoginExpired()) {
      setShowLoginPrompt(true);
      setIsOpen(false);
      return;
    }
    const { startDate, endDate } = ranges.selection;
    const didChange =
      startDate.getTime() !== dateRange.start.getTime() ||
      endDate.getTime() !== dateRange.end.getTime();
    const hasCompletedRange = startDate.getTime() !== endDate.getTime();

    if (!didChange) return;

    setRangeType(RangeType.custom);
    setDateRange(new TimePeriod(startDate, endDate));
    if (hasCompletedRange) {
      tutorialEvent('tutorial:range-changed');
    }
  };

  const handleTodayClick = () => {
    if (isLoginExpired()) {
      setShowLoginPrompt(true);
      return;
    }
    const current = getCurrentPeriod();
    const didChange =
      rangeType !== RangeType.default ||
      current.start.getTime() !== dateRange.start.getTime() ||
      current.end.getTime() !== dateRange.end.getTime();

    if (!didChange) return;

    setRangeType(RangeType.default);
    setDateRange(current);
    tutorialEvent('tutorial:range-changed');
  };

  return (
    <DashboardMenu>
      <DateSelectorGlobalStyles />
      <RangeSelector>
        {!isOpen && (
          <DateSelectorEl>
            <MonthArrow $left onClick={handlePreviousMonth}>
              <LeftArrow/>
            </MonthArrow>
            <RangeText onClick={toggleCalendar}>
              {formatDateRange(dateRange.start, dateRange.end)}
            </RangeText>
            <MonthArrow onClick={handleNextMonth}>
              <RightArrow/>
            </MonthArrow>
          </DateSelectorEl>
        )}
        {!isOpen && rangeType === RangeType.custom && (
          <TodayButton onClick={handleTodayClick}>today</TodayButton>
        )}
      </RangeSelector>
      <CalendarRange
        range={dateRange}
        handleSelect={handleSelect}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        clickToOpen={<RangeText>{formatDateRange(dateRange.start, dateRange.end)}</RangeText>}
      />
      <AnimatePresence>
        {showLoginPrompt && <LoginPrompt onClose={() => setShowLoginPrompt(false)} />}
      </AnimatePresence>
    </DashboardMenu>
  );
}


export {DateSelector, TimePeriod, RangeType, CalendarRange, Calendar, CalendarDay, getCurrentPeriod}
