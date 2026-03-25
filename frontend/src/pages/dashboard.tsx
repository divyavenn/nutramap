/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect, useState } from 'react'
import styled from 'styled-components'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { LogList } from '../components/Logs'
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
  margin-top: 4%;
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

const LoadRail = styled(motion.div)`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  margin-top: 10px;
`

const LoadChip = styled(motion.div)<{$active: boolean}>`
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  letter-spacing: 0.02em;
  color: #f7f3ff;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(164, 130, 255, 0.9)' : 'rgba(164, 130, 255, 0.35)')};
  background: ${({ $active }) => ($active ? 'rgba(53, 18, 89, 0.8)' : 'rgba(26, 14, 39, 0.48)')};
  backdrop-filter: blur(3px);
`

type DashboardLocationState = {
  loginBootstrap?: {
    email: string;
    password: string;
    submittedAt: number;
  };
};

type BootstrapPhase = 'idle' | 'authenticating' | 'hydrating';

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
  const [bootstrapPhase, setBootstrapPhase] = useState<BootstrapPhase>('idle')
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
      refreshLogs()
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
      setBootstrapPhase('authenticating')

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
          ? 'Incorrect password. Please try again.'
          : response.status === 404
            ? 'Account not found. Create an account to continue.'
            : 'Login failed. Please try again.'
        navigate('/login', { replace: true, state: { loginError } })
        return
      }

      const previousEmail = (() => { try { return JSON.parse(localStorage.getItem('accountInfo') ?? '{}').email ?? ''; } catch { return ''; } })();
      if (previousEmail && previousEmail !== loginBootstrap.email) {
        clearUserCaches();
      }
      localStorage.setItem('access_token', response.body.access_token)
      sessionStorage.removeItem('isTrial')
      setBootstrapPhase('hydrating')
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
      setBootstrapPhase('idle')
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

      <Heading words={greeting} />
      <Center>
        <DateSelector />
      </Center>

      <LayoutGroup id="dashboard">
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
      </LayoutGroup>
    </StrictMode>
  )
}

export default DashboardRoot
