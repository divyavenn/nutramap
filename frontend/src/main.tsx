import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import {createRoot} from 'react-dom/client'
import './assets/css/webflow.css'
import './assets/css/divya-venkat.webflow.css'
import Login from './pages/login';
import Home from './pages/home';
import DashboardRoot from './pages/dashboard';
import AccountRoot from './pages/account'
import { DeleteAccount } from './pages/goodbye';
import NewAccountRoot from './pages/create_account';


let rootElem = document.getElementById('root')
if (rootElem) {
  createRoot(rootElem).render(
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<DashboardRoot/>} />
          <Route path="/account" element={<AccountRoot/>}  />
          <Route path = '/goodbye' element={<DeleteAccount/>} />
          <Route path = '/hello' element={<NewAccountRoot/>} />
        </Routes>
      </Router>
  )
}
