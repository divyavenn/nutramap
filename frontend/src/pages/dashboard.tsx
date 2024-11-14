/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect, useState} from 'react'
import { LogList} from '../components/Logs'
import { DateSelector} from '../components/DateSelector'

import {doWithData} from '../components/endpoints'
import {Heading} from '../components/Title'
import { MainSection, Header} from '../components/Sections'
import { NewLogForm } from '../components/AddLogForm' 
import { NutrientDashboard} from '../components/NutrientDash'
import { useRefreshLogs, useRefreshRequirements } from '../components/dashboard_states'
import Account from '../assets/images/account.svg?react'

import {
  RecoilRoot,
} from 'recoil';

function DashboardRoot(){
  return (<RecoilRoot>
    <Dashboard/>
  </RecoilRoot>)
}

function Dashboard(){
  const [name, setName] = useState('user');
  const refreshLogs = useRefreshLogs();
  const refreshRequirements = useRefreshRequirements()
;

  const writeFirstName = (userData : any) => {
    setName(userData.name.trim().split(' ')[0])
  }

  const addFoodsToLocalStorage = (foods : Record<string, string>) => {
    localStorage.setItem('foods', JSON.stringify(foods))
  }

  const addNutrientsToLocalStorage = (nutrients : Record<string, string>) => {
    console.log("number of nutrients: " + String(Object.keys(nutrients).length))
    localStorage.setItem('nutrients', JSON.stringify(nutrients))
  }

  // const refreshDayIntake = () => {
  //   let query = '/logs/day_intake?date=' 
  //               + tolocalDateString(currentDay)
  //   doWithData(query, setDayIntake);
  // }
  
  // const refreshAverageIntake = () => {
  //   doWithData('/logs/range_intake?startDate=' 
  //               + tolocalDateString(dateRange.start)
  //               + '&endDate=' 
  //               + tolocalDateString(dateRange.end) + '', setAverageIntake);
  // }
  useEffect(() => {
    doWithData('/user/info', writeFirstName)
    refreshLogs()
    refreshRequirements()
    doWithData('/food/all_foods', addFoodsToLocalStorage, undefined, undefined, false)
    doWithData('/food/all_nutrients', addNutrientsToLocalStorage)
  }, []);
  
  // // update row data if info, day intake, or averaged intake changes
  // useEffect(() => {
  //   combineData()
  // }, [dayIntake, averageIntake, nutrientInfo, currentDay, logs]);

  // // if current Day changes, refresh the nutrition dashbarod
  // useEffect(() => {
  //   refreshDayIntake();
  //   refreshAverageIntake();
  // }, [currentDay, logs])

  // // if start date or end date changes, refresh logs
  // useEffect(() => {
  //   refreshAverageIntake();
  //   refreshLogs();
  // }, [dateRange.start, dateRange.end])
  


  return(
  <StrictMode>
  <Header linkIcons = {[{to : '/account', img : <Account/>}]}/>
  <Heading words = {'Hello, ' + name}/>


  <MainSection>
  <DateSelector/>
  </MainSection>

  <MainSection>
    {/* <Suspense fallback={<div>Loading...</div>}> */}
    <NutrientDashboard/>
    {/* </Suspense> */}
  </MainSection>

  <MainSection>
    <div>
    <NewLogForm />
   </div>
  </MainSection>

  <MainSection>
    <LogList/> 
  </MainSection>
  </StrictMode>) 

}


export default DashboardRoot