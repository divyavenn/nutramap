/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect, useState} from 'react'
import { LogList} from '../components/Logs'
import { DateSelector} from '../components/DateSelector'

import {Heading} from '../components/Title'
import { MainSection, Header} from '../components/Sections'
import NewSmartLog from '../components/NewSmartLog'
import { NutrientDashboard} from '../components/NutrientDash'
import { useRefreshData } from '../components/dashboard_states'
import Account from '../assets/images/account.svg?react'
import Utensils from '../assets/images/utensils-solid.svg?react'
import { isLoginExpired } from '../components/utlis'
import { useNavigate } from 'react-router-dom';
import { firstNameAtom, useRefreshAccountInfo} from '../components/account_states'
import { request } from '../components/endpoints'

import {RecoilRoot, useRecoilValue,} from 'recoil';

function DashboardRoot(){
  return (<RecoilRoot>
          <Dashboard/>
          </RecoilRoot>)
}

function Dashboard(){
  const name = useRecoilValue(firstNameAtom)
  const refreshAccountInfo = useRefreshAccountInfo();
  const refreshData = useRefreshData();
  const navigate = useNavigate(); 


  const addFoodsToLocalStorage = async () => {
    localStorage.setItem('foods', JSON.stringify(await (await request('/food/all', 'GET')).body))
  }

  const addNutrientsbyName = async () => {
    localStorage.setItem('nutrients', JSON.stringify(await (await request('/nutrients/all', 'GET')).body))
  }

  useEffect(() => {
    if (isLoginExpired()){
      navigate('/login')
    }
    refreshData()
    refreshAccountInfo()
  }, []);
  
  return(
  <StrictMode>
  <Header linkIcons = {[{to : '/account', img : <Account/>}, {to : '/foods', img : <Utensils/>}]}/>
  <Heading words = {'Hello, ' + name}/>


  <MainSection>
  <DateSelector/>
  </MainSection>

  <MainSection>
    <NutrientDashboard/>
  </MainSection>

  <MainSection>
    <NewSmartLog />
  </MainSection>

  <MainSection>
    <LogList/> 
  </MainSection>
  </StrictMode>) 

}


export default DashboardRoot