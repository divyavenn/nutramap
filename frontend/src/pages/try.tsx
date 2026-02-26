/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect } from 'react'
import styled from 'styled-components'
import { LogList} from '../components/Logs'
import { DateSelector} from '../components/DateSelector'
import {Heading} from '../components/Title'
import { Header} from '../components/Sections'
import NewSmartLog from '../components/MealNew'
import { NutrientDashboard} from '../components/NutrientDash'
import { useRefreshData } from '../components/dashboard_states'
import { useRefreshAccountInfo} from '../components/account_states'
import { request } from '../components/endpoints'
import { useSetRecoilState } from 'recoil'
import { tutorialMachineAtom } from '../components/tutorial_machine'
import FoodBowl from '../assets/images/food_bowl.svg?react'
import RecipesIcon from '../assets/images/recipes.svg?react'
import DashboardIcon from '../assets/images/dashboard.svg?react'
import AccountIcon from '../assets/images/account.svg?react'

const BREAKPOINT = '1300px'

const TwoCol = styled.div`
  --modal-width: 700px;
  --dashboard-width: 700px;
  display: flex;
  flex-direction: row;
  width: 100%;
  box-sizing: border-box;
  gap: 40px;
  padding-left: 10%;
  padding-right: 10%;
  overflow: hidden;

  @media (max-width: ${BREAKPOINT}) {
    flex-direction: column;
    align-items: center;
    gap: 0;
    padding: 0;
    overflow: visible;
  }
`

const LeftCol = styled.div`
  flex: 1;
  min-width: 480px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  order: 1;
  position: sticky;
  top: 0;
  height: 100vh;

  @media (max-width: ${BREAKPOINT}) {
    position: static;
    height: auto;
    width: 100%;
    align-items: center;
    order: 2;
  }
`

const RightCol = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  order: 2;

  @media (max-width: ${BREAKPOINT}) {
    width: 100%;
    align-items: center;
    order: 1;
  }
`

const RightContent = styled.div`
  position: sticky;
  margin-top: 10%;
  display: flex;
  flex-direction: column;
  align-items: center;

  @media (max-width: ${BREAKPOINT}) {
    position: static;
    margin-top: 0;
    transform: none;
  }
`

const LeftContent = styled.div`
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
`

const LogScroller = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar { display: none; }
`

const Center = styled.div`
  display: flex;
  justify-content: center;
  width: 100%;
`

function TryFoodPanelRoot(){
  return <TryFoodPanel/>
}

function TryFoodPanel(){
  const refreshAccountInfo = useRefreshAccountInfo();
  const refreshData = useRefreshData();
  const setMachineState = useSetRecoilState(tutorialMachineAtom);

  useEffect(() => {
    sessionStorage.setItem('isTrial', 'true');
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

    // Auto-start tutorial for trial users
    setMachineState(prev => ({
      ...prev,
      isActive: true,
      stepIndex: 0,
      runId: prev.runId + 1,
    }));
  }, []);

  return(
  <StrictMode>
  <Header linkIcons = {[{to : '/dashboard', img : <DashboardIcon/>}, {to : '/account', img : <AccountIcon/>}, {to : '/myfoods', img : <FoodBowl/>}, {to : '/myrecipes', img : <RecipesIcon/>}]}/>
  <Heading words = "Hello, you!"/>
  <Center>
    <DateSelector/>
  </Center>

  <TwoCol>
    <LeftCol>
      <LeftContent>
        <LogScroller>
          <LogList/>
        </LogScroller>
      </LeftContent>
    </LeftCol>

    <RightCol>
      <RightContent>
        <NutrientDashboard/>
        <NewSmartLog />
      </RightContent>
    </RightCol>
  </TwoCol>
  </StrictMode>)

}


export default TryFoodPanelRoot
