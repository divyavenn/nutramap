/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect } from 'react'
import styled from 'styled-components'
import { LogList } from '../components/Logs'
import { DateSelector } from '../components/DateSelector'
import { Heading } from '../components/Title'
import { Header } from '../components/Sections'
import NewSmartLog from '../components/MealNew'
import { NutrientDashboard } from '../components/NutrientDash'
import { useRefreshData } from '../components/dashboard_states'
import AccountIcon from '../assets/images/account.svg?react'
import DashboardIcon from '../assets/images/dashboard.svg?react'
import FoodBowl from '../assets/images/food_bowl.svg?react'
import RecipesIcon from '../assets/images/recipes.svg?react'
import { isLoginExpired } from '../components/utlis'
import { firstNameAtom, useRefreshAccountInfo } from '../components/account_states'
import { useRecoilValue } from 'recoil'

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
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  order: 1;
  height: 100vh;
  align-self: flex-start;

  @media (max-width: ${BREAKPOINT}) {
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

/* Sticky-centered: pins its visual center to 50vh regardless of document offset */
const RightContent = styled.div`
  position: sticky;
  margin-top: 10%;
  display: flex;
  flex-direction: column;
  align-items: center;

  body[data-tutorial-active='true'] & {
    position: static;
  }

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
  overflow: hidden;

  @media (max-width: ${BREAKPOINT}) {
    flex: none;
    min-height: auto;
    overflow: visible;
  }
`

const LogScroller = styled.div`
  flex: 1 1 0;
  height: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  width: 100%;
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar { display: none; }

  @media (max-width: ${BREAKPOINT}) {
    flex: none;
    height: auto;
    overflow: visible;
    overscroll-behavior-y: auto;
  }
`

const DesktopOnly = styled.div`
  @media (max-width: ${BREAKPOINT}) { display: none; }
`

const Center = styled.div`
    display: flex;
    justify-content: center;
    width: 100%;
`
const MobileOnly = styled.div`
  display: none;
  @media (max-width: ${BREAKPOINT}) {
    display: flex;
    justify-content: center;
    width: 100%;
  }
`

/* ── Page ────────────────────────────────────────────────────── */

function DashboardRoot() {
  return <Dashboard />
}

function Dashboard() {
  const name = useRecoilValue(firstNameAtom)
  const refreshAccountInfo = useRefreshAccountInfo()
  const refreshData = useRefreshData()
  const isLoggedIn = !isLoginExpired()

  useEffect(() => {
    const init = async () => {
      // Dashboard is viewable while logged out; only fetch protected data when authenticated.
      if (!isLoggedIn) return
      await refreshData()
      await refreshAccountInfo()
    }
    init()
  }, [isLoggedIn, refreshData, refreshAccountInfo])

  const greeting = name ? `Hello, ${name}` : 'Hello, you!'

  return (
    <StrictMode>
      <Header linkIcons={[
        { to: '/dashboard', img: <DashboardIcon /> },
        { to: '/account',   img: <AccountIcon /> },
        { to: '/myfoods',   img: <FoodBowl /> },
        { to: '/myrecipes', img: <RecipesIcon /> },
      ]} />

      <Heading words={greeting} />
      <Center>
        <DateSelector />
      </Center>

      <TwoCol>
        <LeftCol>
          <LeftContent>
            <LogScroller>
              <LogList />
            </LogScroller>
          </LeftContent>
        </LeftCol>

        <RightCol>
          <RightContent>
            <NutrientDashboard />
            <NewSmartLog />
          </RightContent>
        </RightCol>
      </TwoCol>
    </StrictMode>
  )
}

export default DashboardRoot
