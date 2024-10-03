import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import Header from './Header.tsx'
import ListElems from './ListElems.tsx'
import './index.css'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Header/>
    <ListElems nutrients={['Vitamin A', 'Vitamin C', 'Calcium', 'Iron']} />
    <App />
  </StrictMode>,
)
