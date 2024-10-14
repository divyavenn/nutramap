/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect, useState } from 'react'
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
  }, [])

  return(
  <StrictMode>
  <Header/>
  <Heading words = {'Hello, ' + name}/>

  <MainSection>
    <Button><AddLogButton/></Button>
  </MainSection>

  <MainSection>
    <NewLogForm callAfterSubmitting = {refreshLogs}/>
  </MainSection>

  <MainSection>
    <LogList logs = {logs}></LogList>
  </MainSection>
  </StrictMode>)

}


export default Dashboard