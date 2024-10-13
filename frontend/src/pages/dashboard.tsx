/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect, useState } from 'react'
import { Log , LogList, LogProps} from '../components/Elems'

import {doWithData} from '../components/LoadHtml'
import {Heading} from '../components/Title'
import {Header, MainSection, Button} from '../components/Sections'

import AddLogButton from '../assets/images/new-log.svg?react'

function Dashboard(){
  const [name, setName] = useState('user');
  const [logs, setLogs] = useState<LogProps[]>([])

  const writeFirstName = (userData : any) => {
    setName(userData.name.trim().split(' ')[0])
  }

  const writeLogs = (logBook : LogProps[]) => {
    console.log(logBook[0])
    setLogs(logBook)
  }

  useEffect(() => {
    doWithData('/user/info', writeFirstName)
    doWithData('/user/logs', writeLogs)
  }, [])

  return(
  <StrictMode>
  <Header/>
  <Heading words = {'Hello, ' + name}/>

  <MainSection>
    <Button><AddLogButton/></Button>
  </MainSection>

  <MainSection>
    <LogList logs = {logs}></LogList>
  </MainSection>
  </StrictMode>)

}


export default Dashboard