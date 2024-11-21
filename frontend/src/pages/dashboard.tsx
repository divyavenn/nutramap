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
  const navigate = useNavigate(); 


  const addFoodsToLocalStorage = (foods : Record<string, string>) => {
    localStorage.setItem('foods', JSON.stringify(foods))
  }

  const addNutrientsToLocalStorage = (nutrients : Record<string, string>) => {
    console.log("number of nutrients: " + String(Object.keys(nutrients).length))
    localStorage.setItem('nutrients', JSON.stringify(nutrients))
  }
  useEffect(() => {
    console.log("arstartsrast")
    refreshAccountInfo();
    if (isLoginExpired()){
      navigate('/login')
    }
    refreshLogs()
    refreshRequirements()
    doWithData('/food/all_foods', addFoodsToLocalStorage, 'GET', undefined, undefined, false)
    doWithData('/food/all_nutrients', addNutrientsToLocalStorage)
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