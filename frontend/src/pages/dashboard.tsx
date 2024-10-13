import { StrictMode, useEffect, useState } from 'react'
import { Log , LogList, LogProps} from '../components/Elems'

import {doWithData} from '../components/LoadHtml'
import {Heading} from '../components/Title'
import {Header, MainSection } from '../components/Sections'

function Dashboard(){
  const [name, setName] = useState('user');
  const [logs, setLogs] = useState<LogProps[]>([])

  const writeFirstName = (userData : any) => {
    setName(userData.name.trim().split(' ')[0])
  }

  const writeLogs = (logBook : LogProps[]) => {
    setLogs(logBook)
  }

  useEffect(() => {
    doWithData('/user/info', writeFirstName)
    doWithData('/user/logs', writeLogs)
  })

  return(
  <StrictMode>
  <Header/>
  <Heading words = {'Hello, ' + name}/>
  <MainSection>
    <Log  foodName={'apples'}
          date = {new Date()}
          amount_in_grams = {5} ></Log>
  </MainSection>
  <MainSection>
    <LogList logs = {logs}></LogList>
  </MainSection>
  </StrictMode>)

}


export default Dashboard