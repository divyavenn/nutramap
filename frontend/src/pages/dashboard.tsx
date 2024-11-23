/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect, useState} from 'react'
import { LogList} from '../components/Logs'
import { DateSelector} from '../components/DateSelector'

import {doWithData} from '../components/endpoints'
import {Heading} from '../components/Title'
import { MainSection, Header} from '../components/Sections'
import { NewLogForm } from '../components/AddLogForm' 
import { NutrientDashboard} from '../components/NutrientDash'
import { useRefreshLogs, useRefreshRequirements, useRefreshData } from '../components/dashboard_states'
import Account from '../assets/images/account.svg?react'
import { isLoginExpired } from '../components/utlis'
import { useNavigate } from 'react-router-dom';
import { firstNameAtom, useRefreshAccountInfo} from '../components/account_states'

import {RecoilRoot, useRecoilValue,} from 'recoil';

function DashboardRoot(){
  return (<RecoilRoot>
          <Dashboard/>
          </RecoilRoot>)
}

function Dashboard(){
  const name = useRecoilValue(firstNameAtom)
  const refreshLogs = useRefreshLogs();
  const refreshRequirements = useRefreshRequirements();
  const refreshAccountInfo = useRefreshAccountInfo();
  const refreshData = useRefreshData();
  const navigate = useNavigate(); 


  const addFoodsToLocalStorage = (foods : Record<string, string>) => {
    localStorage.setItem('foods', JSON.stringify(foods))
  }

  const addNutrientsbyName = (nutrients : Record<string, {id : number, unit : string}>) => {
    localStorage.setItem('nutrients', JSON.stringify(nutrients))
  }

  const addNutrientsByID = (nutrients : Record<string, {id : number, unit : string}>) => {
    const idKeyedMap: Record<number, { name: string; unit: string }> = {};
    for (const [name, details] of Object.entries(nutrients)) {
      idKeyedMap[details.id] = { name, unit: details.unit };
    }
    localStorage.setItem('nutrients_by_id', JSON.stringify(idKeyedMap))
  }

  const addNutrientstoLocalStorage = (nutrients : Record<string, {id : number, unit : string}>) => {
    addNutrientsbyName(nutrients)
    addNutrientsByID(nutrients)
  }

  useEffect(() => {
    if (isLoginExpired()){
      navigate('/login')
    }
    refreshData()
    localStorage.getItem('foods') ? null : doWithData('/food/all', addFoodsToLocalStorage, 'GET')
    localStorage.getItem('nutrients') ? null : doWithData('/nutrients/all', addNutrientstoLocalStorage, 'GET')
    refreshLogs()
    refreshRequirements()
  }, []);
  
  return(
  <StrictMode>
  <Header linkIcons = {[{to : '/account', img : <Account/>}]}/>
  <Heading words = {'Hello, ' + name}/>


  <MainSection>
  <DateSelector/>
  </MainSection>

  <MainSection>
    <NutrientDashboard/>
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