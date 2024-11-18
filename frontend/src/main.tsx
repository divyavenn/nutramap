import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import {createRoot} from 'react-dom/client'
import './assets/css/webflow.css'
import './assets/css/divya-venkat.webflow.css'
import Login from './pages/login';
import Home from './pages/home';
<<<<<<< Updated upstream
import Dashboard from './pages/dashboard';

=======
import DashboardRoot from './pages/dashboard';
import AccountRoot from './pages/account'
import { DeleteAccount } from './pages/goodbye';
import NewAccountRoot from './pages/create_account';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { RecoilRoot } from 'recoil';
>>>>>>> Stashed changes

let rootElem = document.getElementById('root')
if (rootElem) {
  createRoot(rootElem).render(
      <RecoilRoot> <ToastContainer/>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </Router>
      </RecoilRoot>
  )
}
