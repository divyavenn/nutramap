/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect, useState, useRef } from 'react'
import { Log , LogList, LogProps} from '../components/Elems'

import {doWithData} from '../components/LoadHtml'
import {Heading} from '../components/Title'
import {Header, MainSection, Button} from '../components/Sections'
import { NewLogForm } from '../components/AddLogForm' 

import AddLogButton from '../assets/images/new-log.svg?react'

interface KeyValue {
  id : number;
  name : string;
}

function Dashboard(){
  const [name, setName] = useState('user');
  const [logs, setLogs] = useState<LogProps[]>([])
  const [logEntryVisible, setLogEntryVisible] = useState<boolean>(false)

  const formRef = useRef<HTMLDivElement>(null); 
  const logsRep = useRef<HTMLDivElement>(null); 

  // Function to close form if clicked outside
  const handleClickOutside = (event: MouseEvent) => {
    if (formRef.current && !formRef.current.contains(event.target as Node)) {
      setLogEntryVisible(false); // Close the form when clicking outside
    }
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
    doWithData('/user/logs', writeLogs);
  };

  useEffect(() => {
    console.log("executing shit")
    doWithData('/user/info', writeFirstName)
    doWithData('/user/logs', writeLogs)
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