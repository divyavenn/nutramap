import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import {createRoot} from 'react-dom/client'
import './assets/css/webflow.css'
import './assets/css/divya-venkat.webflow.css'
import './assets/css/interactions.css'
import Login from './pages/login';
import Home from './pages/home';
import DashboardRoot from './pages/dashboard';
import TryFoodPanelRoot from './pages/try';
import AccountRoot from './pages/account'
import { DeleteAccount } from './pages/goodbye';
import NewAccount from './pages/hello';
import { RecoilRoot } from 'recoil';
import GrainBackground from './components/GrainBackground';
import FoodsPage from './pages/foods';
import MyRecipes from './pages/myrecipes';
import TryTutorial from './components/TryTutorial';
import MobileGate from './components/MobileGate';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

const PAGE_TITLES: Record<string, string> = {
  '/': 'foodpanel',
  '/dashboard': 'dashboard · foodpanel',
  '/myrecipes': 'my recipes · foodpanel',
  '/myfoods': 'my foods · foodpanel',
  '/account': 'account · foodpanel',
  '/login': 'log in · foodpanel',
  '/try': 'try · foodpanel',
  '/hello': 'welcome · foodpanel',
  '/goodbye': 'goodbye · foodpanel',
};

function AnimatedRoutes() {
  const location = useLocation();
  const isFirstRender = useRef(true);

  // Route changes: update the tab title and move focus to the new page so screen
  // readers announce it and keyboard users don't stay on the old page's link.
  useEffect(() => {
    document.title = PAGE_TITLES[location.pathname] ?? 'foodpanel';
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // The exiting page is still mounted (mode="sync"), so target the new one by key.
    const page = document.querySelector<HTMLElement>(
      `[data-page-key="${CSS.escape(location.pathname)}"]`
    );
    page?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <AnimatePresence mode="sync" initial={false}>
      <motion.div
        key={location.pathname}
        data-page-key={location.pathname}
        tabIndex={-1}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', minHeight: '100vh', outline: 'none' }}
      >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/try" element={<TryFoodPanelRoot/>} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<DashboardRoot/>} />
          <Route path="/account" element={<AccountRoot/>}  />
          <Route path='/goodbye' element={<DeleteAccount/>} />
          <Route path='/hello' element={<NewAccount/>} />
          <Route path="/myfoods" element={<FoodsPage />} />
          <Route path="/myrecipes" element={<MyRecipes />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

let rootElem = document.getElementById('root')
if (rootElem) {
  createRoot(rootElem).render(
    <RecoilRoot>
      {/* Honor the OS reduced-motion setting: drops transform/layout motion, keeps fades */}
      <MotionConfig reducedMotion="user">
      <GrainBackground>
        <MobileGate>
          <Router>
            <AnimatedRoutes />
            <TryTutorial />
          </Router>
        </MobileGate>
      </GrainBackground>
      </MotionConfig>
    </RecoilRoot>
  )
}
