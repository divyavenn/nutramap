/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect, useState } from 'react'
import { LogList} from '../components/Logs'
import { DateSelector} from '../components/DateSelector'

import {Heading} from '../components/Title'
import { MainSection, Header} from '../components/Sections'
import NewSmartLog from '../components/NewSmartLog'
import { NutrientDashboard} from '../components/NutrientDash'
import { useRefreshData } from '../components/dashboard_states'
import { useRefreshAccountInfo} from '../components/account_states'
import { initializeTrialUserIfNeeded, setupTrialUserCleanup } from '../components/trialUser'
import {RecoilRoot} from 'recoil';

function TryNutramapRoot(){
  return (<RecoilRoot>
          <TryNutramap/>
          </RecoilRoot>)
}

function TryNutramap(){
  const [isReady, setIsReady] = useState(false);
  const refreshAccountInfo = useRefreshAccountInfo();
  const refreshData = useRefreshData();

  useEffect(() => {
    const initializeTrialDashboard = async () => {
      try {
        // Initialize trial user (always creates a new one if none exists)
        await initializeTrialUserIfNeeded();

        // Setup cleanup for trial users when browser closes
        setupTrialUserCleanup();

        // Load data for trial user
        await refreshData();
        await refreshAccountInfo();

        // Mark as ready to render dashboard
        setIsReady(true);
      } catch (error) {
        console.error('Error initializing trial dashboard:', error);
      }
    }

    initializeTrialDashboard();
  }, []);

  if (!isReady) {
    return (
      <StrictMode>
        <Header linkIcons = {[]}/>
        <MainSection>
          <Heading words = "Loading..."/>
        </MainSection>
      </StrictMode>
    );
  }

  return(
  <StrictMode>
  <Header linkIcons = {[]}/>
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
