import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import {createRoot} from 'react-dom/client'
import './assets/css/webflow.css'
import './assets/css/divya-venkat.webflow.css'
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
import AppCursor from './components/Cursor';
import { AnimatePresence, motion } from 'framer-motion';

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="sync" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', minHeight: '100vh' }}
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
      <GrainBackground>
        <MobileGate>
          <Router>
            <AnimatedRoutes />
            <TryTutorial />
          </Router>
          <AppCursor />
        </MobileGate>
      </GrainBackground>
    </RecoilRoot>
  )
}
