import { StrictMode } from 'react'
import LoginForm from '../components/Forms'
import { Graphic } from '../components/Graphics'
import {Header, MainSection } from '../components/Sections'
import bowl from '../assets/images/vegan.svg'


function Login(){
  return(
  <StrictMode>
  <Header/>
  <MainSection>
  <Graphic src = {bowl} className="login-image" height = '300px'/>
  </MainSection>
  <MainSection>
  <LoginForm/>
  </MainSection>
  </StrictMode>
  )
}

export default Login