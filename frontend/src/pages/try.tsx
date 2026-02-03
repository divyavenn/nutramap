/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect } from 'react'
import { LogList} from '../components/Logs'
import { DateSelector} from '../components/DateSelector'

import {Heading} from '../components/Title'
import { MainSection, Header} from '../components/Sections'
import NewSmartLog from '../components/MealNew'
import { NutrientDashboard} from '../components/NutrientDash'
import { useRefreshData } from '../components/dashboard_states'
import { useRefreshAccountInfo} from '../components/account_states'
import { request } from '../components/endpoints'
import {RecoilRoot} from 'recoil';
import Utensils from '../assets/images/utensils-solid.svg?react'
import FoodBowl from '../assets/images/food_bowl.svg?react'

function TryNutramapRoot(){
  return (<RecoilRoot>
          <TryNutramap/>
          </RecoilRoot>)
}

function TryNutramap(){
  const refreshAccountInfo = useRefreshAccountInfo();
  const refreshData = useRefreshData();

  useEffect(() => {
    const initializeTrialDashboard = async () => {
      try {
        // Check if already logged in with valid token
        const token = localStorage.getItem('access_token');

        if (!token || isTokenExpired(token)) {
          // Login to trial account
          const response = await request('/trial/create', 'POST', null, 'JSON', false);

          if (response.status === 200) {
            const data = response.body;
            localStorage.setItem('access_token', data.access_token);

            // Load foods and nutrients in parallel (don't block rendering)
            Promise.all([
              request('/food/all', 'GET').then(res => localStorage.setItem('foods', JSON.stringify(res.body))),
              request('/nutrients/all', 'GET').then(res => localStorage.setItem('nutrients', JSON.stringify(res.body)))
            ]);
          }
        }

        // Load data in background (fire-and-forget, like regular dashboard)
        refreshData();
        refreshAccountInfo();
      } catch (error) {
        console.error('Error initializing trial dashboard:', error);
      }
    }

    // Helper function to check if token is expired
    const isTokenExpired = (token: string): boolean => {
      try {
        const [, payloadBase64] = token.split('.');
        const payload = JSON.parse(atob(payloadBase64));
        const currentTime = Math.floor(Date.now() / 1000);
        return payload.exp && payload.exp < currentTime;
      } catch {
        return true;
      }
    };

    initializeTrialDashboard();
  }, []);

  return(
  <StrictMode>
  <Header linkIcons = {[{to : '/myfoods', img : <Utensils/>}, {to : '/myrecipes', img : <FoodBowl/>}]}/>
  <Heading words = "Hello, you!"/>

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


export default TryNutramapRoot
