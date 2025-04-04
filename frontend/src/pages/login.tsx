import { StrictMode } from 'react'
import LoginForm from '../components/LoginForm'
import { Graphic } from '../components/Graphics'
import {Header, MainSection } from '../components/Sections'
import {LottieAnimation} from '../components/Graphics'
import bowl from '../assets/images/vegan.svg'
import nutramapLogo from '../assets/images/nutramap_logo.png'


function Login(){
  return(
  <StrictMode>
  <Header/>
  <MainSection>
  <div   style={{
        marginTop: '125px' 
      }}></div>
    <img src={nutramapLogo}
            loading="lazy" alt="" className = 'nutramap-logo-large'/>
  </MainSection>
  <MainSection>
  <LoginForm/>
  </MainSection>
  </StrictMode>
  )
}

export default Login