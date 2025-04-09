import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import {createRoot} from 'react-dom/client'
import './assets/css/webflow.css'
import './assets/css/divya-venkat.webflow.css'
import Login from './pages/login';
import Home from './pages/home';
import DashboardRoot from './pages/dashboard';
import AccountRoot from './pages/account'
import { DeleteAccount } from './pages/goodbye';
import NewAccount from './pages/hello';
import { RecoilRoot } from 'recoil';
import VantaBackground from './components/VantaBackground';
import FoodsPage from './pages/foods';

// Load Vanta.js scripts
const loadScript = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
};

// Load scripts in sequence
const loadVantaScripts = async () => {
  try {
    await loadScript('/three.r134.min.js');
    await loadScript('/vanta.fog.min.js');
  } catch (error) {
    console.error('Failed to load Vanta scripts:', error);
  }
};

loadVantaScripts();

let rootElem = document.getElementById('root')
if (rootElem) {
  createRoot(rootElem).render(
    <RecoilRoot>
      <VantaBackground>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<DashboardRoot/>} />
            <Route path="/account" element={<AccountRoot/>}  />
            <Route path = '/goodbye' element={<DeleteAccount/>} />
            <Route path = '/hello' element={<NewAccount/>} />
            <Route path="/myfoods" element={<FoodsPage />} />
          </Routes>
        </Router>
      </VantaBackground>
    </RecoilRoot>
  )
}