/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect, useState, useRef } from 'react'
import { DateSelector , LogList, LogProps} from '../components/Logs'

import {doWithData} from '../components/LoadHtml'
import {Heading} from '../components/Title'
import {Header, MainSection, Button} from '../components/Sections'
import { NewLogForm } from '../components/AddLogForm' 
import { NutrientDashboard, NutrientStatsProps} from '../components/NutrientDash'

import AddLogButton from '../assets/images/new-log.svg?react'

interface KeyValue {
  id : number;
  name : string;
}

function Dashboard(){
  const [name, setName] = useState('user');

  /* for log list*/
  const [logs, setLogs] = useState<LogProps[]>([])
  const [logEntryVisible, setLogEntryVisible] = useState<boolean>(false)
  const formRef = useRef<HTMLDivElement>(null); 

  /* for date selector */
  const now = new Date();
  const [startDate, setStartDate] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), 1))
  const [endDate, setEndDate] = useState<Date>(now)

  /* for dashboard */
  const [currentDay, setCurrentDay] = useState<Date>(new Date()) 

  const [dayIntake, setDayIntake] = useState< {[key: string]: number}>({});
  const [averageIntake, setAverageIntake] = useState<{[key: string]: number}>({});
  const [nutrientInfo, setNutrientInfo] = useState<{[key: string]: any}>({});

  const [rowData, setRowData] = useState<NutrientStatsProps[]>([]);

  // Function to close form if clicked outside
  const handleClickOutside = (event: MouseEvent) => {
    if (formRef.current && !formRef.current.contains(event.target as Node)) {
      setLogEntryVisible(false); // Close the form when clicking outside
    }
  };
  const handleDateChange = ({ startDate, endDate }: { startDate: Date; endDate: Date }) => {
    setStartDate(startDate);
    setEndDate(endDate);
    // Call refreshLogs or any function that updates based on the new dates
  };
  const handleNextMonth = () => {
    setStartDate(new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1));
    setEndDate(new Date(startDate.getFullYear(), startDate.getMonth() + 2, 0));
  };
  const handlePreviousMonth = () => {
    setStartDate(new Date(startDate.getFullYear(), startDate.getMonth() - 1, 1));
    setEndDate(new Date(startDate.getFullYear(), startDate.getMonth(), 0));
  };
  // Function to toggle the form visibility
  const toggleFormVisibility = () => {
    setLogEntryVisible(!logEntryVisible);
  };

  const writeFirstName = (userData : any) => {
    setName(userData.name.trim().split(' ')[0])
  }

  const addFoodsToLocalStorage = (foods : Record<string, string>) => {
    localStorage.setItem('foods', JSON.stringify(foods))
  }

  const addNutrientsToLocalStorage = (nutrients : Record<string, string>) => {
    localStorage.setItem('nutrients', JSON.stringify(nutrients))
  }

  const refreshLogs = () => {
    doWithData('/user/logs?startDate=' 
                + startDate.toISOString() 
                + '&endDate=' 
                + endDate.toISOString() + '', setLogs);
  };

  const refreshDayIntake = () => {
    doWithData('/user/day_intake?date=' 
                + currentDay.toISOString(), setDayIntake);
  }
  

  const refreshAverageIntake = () => {
    doWithData('/user/range_intake?startDate=' 
                + startDate.toISOString() 
                + '&endDate=' 
                + endDate.toISOString() + '', setAverageIntake);
  }

  const refreshNutrientInfo = () => {
    doWithData('/user/requirement_info', setNutrientInfo);
  }

  // update row data if info, day intake, or averaged intake changes
  useEffect(() => {
    // Check if both pieces of data are available before combining
    if (Object.keys(nutrientInfo).length > 0) {
      const combined = Object.keys(nutrientInfo).map((nutrientId) => {
        const info = nutrientInfo[nutrientId]
        const day = dayIntake[nutrientId];
        const average = averageIntake[nutrientId];
  
        return {
          name: info.name,
          target: info.target,
          dayIntake: day,
          avgIntake: average,
          shouldExceed: info.should_exceed,
          units: info.units,
        };
      });
  
      setRowData(combined);
    }
  }, [dayIntake, averageIntake, nutrientInfo]);

  // if current Day changes, refresh the nutrition dashbarod
  useEffect(() => {
    refreshDayIntake();
  }, [currentDay])

  // if start date or end date changes, refresh logs
  useEffect(() => {
    refreshAverageIntake();
    refreshLogs();
  }, [startDate, endDate])

  useEffect(() => {
    console.log("executing shit")
    doWithData('/user/info', writeFirstName)
    refreshLogs()
    refreshNutrientInfo()
    refreshAverageIntake()
    refreshDayIntake()
    doWithData('/food/all_foods', addFoodsToLocalStorage, undefined, undefined, false, false)
    doWithData('/food/all_nutrients', addNutrientsToLocalStorage)
    if (logEntryVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside); // Cleanup
    };
  }, [logEntryVisible, logs]);
  

  return(
  <StrictMode>
  <Header/>
  <Heading words = {'Hello, ' + name}/>


  <MainSection>
  <DateSelector startDate={startDate} endDate={endDate} onNextMonth={handleNextMonth} onPreviousMonth={handlePreviousMonth} onDateChange={handleDateChange}/>
  </MainSection>

  <MainSection>
    <NutrientDashboard nutrientStats={rowData} currentDay={currentDay}/>
  </MainSection>

  <MainSection>
    {/* Toggle between button and form */}
    {!logEntryVisible ? (
          <Button onClick={toggleFormVisibility}>
            <AddLogButton />
          </Button>
        ) : (
          <div ref={formRef}>
            <NewLogForm callAfterSubmitting={refreshLogs} />
          </div>
        )}
  </MainSection>


  <MainSection>
    <LogList logs = {logs}></LogList>
  </MainSection>
  </StrictMode>) 

}


export default Dashboard