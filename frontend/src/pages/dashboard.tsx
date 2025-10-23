/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect } from 'react'
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

import {RecoilRoot, useRecoilValue} from 'recoil';

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

  useEffect(() => {
    const initializeDashboard = async () => {
      // Check authentication - redirect to login if expired
      if (isLoginExpired()) {
        navigate('/login');
        return;
      }

      // Load data for authenticated user
      refreshData();
      refreshAccountInfo();
    }

    initializeDashboard();
  }, []);
  
  const getGreeting = () => {
    return name ? 'Hello, ' + name : 'Hello, you!';
  }

  return(
  <StrictMode>
  <Header linkIcons = {[{to : '/account', img : <Account/>}, {to : '/myfoods', img : <Utensils/>}]}/>
  <Heading words = {getGreeting()}/>


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