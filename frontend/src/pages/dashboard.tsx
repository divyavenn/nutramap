/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect, useState, useRef } from 'react'
import { DateSelector , LogList, LogProps} from '../components/Logs'

import {doWithData} from '../components/LoadHtml'
import {Heading} from '../components/Title'
import {Header, MainSection, Button} from '../components/Sections'
import { NewLogForm } from '../components/AddLogForm' 
import { NutrientDash } from '../components/NutrientDash'

import AddLogButton from '../assets/images/new-log.svg?react'

interface KeyValue {
  id : number;
  name : string;
}

function Dashboard(){
  const [name, setName] = useState('user');
  const [logs, setLogs] = useState<LogProps[]>([])
  const [logEntryVisible, setLogEntryVisible] = useState<boolean>(false)
  const now = new Date();
  const [startDate, setStartDate] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), 1))
  const [endDate, setEndDate] = useState<Date>(now)

  const formRef = useRef<HTMLDivElement>(null); 

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

  const writeLogs = (logBook : LogProps[]) => {
    setLogs(logBook)
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
                + endDate.toISOString() + '', writeLogs);
  };

  useEffect(() => {
    refreshLogs();
  }, [startDate, endDate])

  useEffect(() => {
    console.log("executing shit")
    doWithData('/user/info', writeFirstName)
    refreshLogs()
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
  }, [logEntryVisible])

  return(
  <StrictMode>
  <Header/>
  <Heading words = {'Hello, ' + name}/>


  <MainSection>
  <DateSelector startDate={startDate} endDate={endDate} onNextMonth={handleNextMonth} onPreviousMonth={handlePreviousMonth} onDateChange={handleDateChange}/>
  </MainSection>

  <MainSection>
  <NutrientDash/>
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