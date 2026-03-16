import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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


let rootElem = document.getElementById('root')
if (rootElem) {
  createRoot(rootElem).render(
    <RecoilRoot>
      <GrainBackground>
        <MobileGate>
          <Router>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/try" element={<TryFoodPanelRoot/>} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<DashboardRoot/>} />
              <Route path="/account" element={<AccountRoot/>}  />
              <Route path = '/goodbye' element={<DeleteAccount/>} />
              <Route path = '/hello' element={<NewAccount/>} />
              <Route path="/myfoods" element={<FoodsPage />} />
              <Route path="/myrecipes" element={<MyRecipes />} />
            </Routes>
            <TryTutorial />
          </Router>
        </MobileGate>
      </GrainBackground>
    </RecoilRoot>
  )
}
