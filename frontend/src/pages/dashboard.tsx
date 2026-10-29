/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect } from 'react'
import styled from 'styled-components'
import { LayoutGroup } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { LogList } from '../components/Logs'
import { StatusMessage } from '../components/StatusMessage'
import { DateSelector } from '../components/DateSelector'
import { Heading } from '../components/Title'
import { Header } from '../components/Sections'
import NewSmartLog from '../components/MealNew'
import { NutrientDashboard } from '../components/NutrientDash'
import {
  logsLoadingAtom,
  requirementsLoadingAtom,
  useRefreshLogs,
  useRefreshRequirements,
} from '../components/dashboard_states'
import { clearUserCaches } from '../components/utlis'
import AccountIcon from '../assets/images/account.svg?react'
import DashboardIcon from '../assets/images/dashboard.svg?react'
import FoodBowl from '../assets/images/food_bowl.svg?react'
import RecipesIcon from '../assets/images/recipes.svg?react'
import { isLoginExpired } from '../components/utlis'
import { firstNameAtom, useRefreshAccountInfo } from '../components/account_states'
import { useRecoilValue } from 'recoil'
import { request } from '../components/endpoints'

const BREAKPOINT = '1300px'

const TwoCol = styled.div`
  --modal-width: 700px;
  --dashboard-width: 700px;
  display: flex;
  flex-direction: row;
  width: 100%;
  box-sizing: border-box;
  gap: 40px;
  padding-inline: 10%;

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

const RightContent = styled.div`
  width: 100%;
  margin-top: 4%;
  display: flex;
  flex-direction: column;
  align-items: center;

  @media (max-width: ${BREAKPOINT}) {
    margin-top: 0;
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
  /* Visible scrollbar: it's the only cue that more logs are below */
  scrollbar-width: thin;

  @media (max-width: ${BREAKPOINT}) {
    flex: none;
    height: auto;
    overflow: visible;
    overscroll-behavior-y: auto;
  }
`

const Center = styled.div`
    display: flex;
    justify-content: center;
    width: 100%;
`

type DashboardLocationState = {
  loginBootstrap?: {
    email: string;
    password: string;
    submittedAt: number;
  };
};

/* ── Page ────────────────────────────────────────────────────── */

function DashboardRoot() {
  return <Dashboard />
}

function Dashboard() {
  const name = useRecoilValue(firstNameAtom)
  const refreshAccountInfo = useRefreshAccountInfo()
  const refreshLogs = useRefreshLogs()
  const refreshRequirements = useRefreshRequirements()
  const isLoggedIn = !isLoginExpired()
  const location = useLocation()
  const navigate = useNavigate()
  const locationState = (location.state as DashboardLocationState | null) || null
  const loginBootstrap = locationState?.loginBootstrap

  useEffect(() => {
    const init = async () => {
      // Dashboard is viewable while logged out; only fetch protected data when authenticated.
      if (!isLoggedIn) return
      if (loginBootstrap) {
        navigate('/dashboard', { replace: true, state: null })
      }
      await refreshAccountInfo()
      // Force: logs may have changed on other pages (recipe sync/delete) within the cache TTL
      refreshLogs({ force: true })
      refreshRequirements()
      // Prefetch recipes in background so the recipes page loads instantly
      request('/recipes/list', 'GET').then((res) => {
        if (res.status === 200 && res.body?.recipes && Array.isArray(res.body.recipes)) {
          try { localStorage.setItem('recipes_cache', JSON.stringify(res.body.recipes)) } catch {}
        }
      })
    }
    void init()
  }, [isLoggedIn, loginBootstrap, navigate, refreshAccountInfo, refreshLogs, refreshRequirements])

  useEffect(() => {
    if (!loginBootstrap || isLoggedIn) return

    let cancelled = false
    const bootstrapLogin = async () => {
      const response = await request(
        '/auth/submit_login',
        'POST',
        { username: loginBootstrap.email, password: loginBootstrap.password },
        'URLencode',
        false
      )

      if (cancelled) return

      if (response.status !== 200 || !response.body?.access_token) {
        const loginError = response.status === 403
          ? "that password didn't work. check it and try again."
          : response.status === 404
            ? 'no account with that email. check the spelling or create an account.'
            : "couldn't log in. check your connection and try again."
        navigate('/login', { replace: true, state: { loginError } })
        return
      }

      const previousEmail = (() => { try { return JSON.parse(localStorage.getItem('accountInfo') ?? '{}').email ?? ''; } catch { return ''; } })();
      if (previousEmail && previousEmail !== loginBootstrap.email) {
        clearUserCaches();
      }
      localStorage.setItem('access_token', response.body.access_token)
      sessionStorage.removeItem('isTrial')
      const hasFoodsCache = !!localStorage.getItem('foods')
      const hasNutrientsCache = !!localStorage.getItem('nutrients')

      await Promise.allSettled([
        refreshAccountInfo(),
        refreshRequirements(),
        refreshLogs(),
        hasFoodsCache
          ? Promise.resolve()
          : request('/food/all', 'GET').then((res) => {
              if (res.status === 200 && res.body) {
                localStorage.setItem('foods', JSON.stringify(res.body))
              }
            }),
        hasNutrientsCache
          ? Promise.resolve()
          : request('/nutrients/all', 'GET').then((res) => {
              if (res.status === 200 && res.body) {
                localStorage.setItem('nutrients', JSON.stringify(res.body))
              }
            }),
      ])

      if (cancelled) return
      navigate('/dashboard', { replace: true, state: null })
    }

    void bootstrapLogin()
    return () => {
      cancelled = true
    }
  }, [loginBootstrap, isLoggedIn, navigate, refreshAccountInfo, refreshRequirements, refreshLogs])

  const greeting = name ? `Hello, ${name}` : 'Hello, you!'

  return (
    <StrictMode>
      <Header linkIcons={[
        { to: '/dashboard', img: <DashboardIcon /> },
        { to: '/account',   img: <AccountIcon /> },
        { to: '/myfoods',   img: <FoodBowl /> },
        { to: '/myrecipes', img: <RecipesIcon /> },
      ]} />

      <main>
      <Heading words={greeting} />
      <Center>
        <DateSelector />
      </Center>

      <TwoCol>
        {/* Scoped to the log list so log changes don't re-measure the nutrient dashboard */}
        <LayoutGroup id="dashboard">
        <LeftCol>
          <LeftContent>
            <LogScroller>
              <LogList />
              <StatusMessage />
            </LogScroller>
          </LeftContent>
        </LeftCol>
        </LayoutGroup>

        <RightCol>
          <RightContent>
            <NutrientDashboard />
            <NewSmartLog />
          </RightContent>
        </RightCol>
      </TwoCol>
      </main>
    </StrictMode>
  )
}

export default DashboardRoot
