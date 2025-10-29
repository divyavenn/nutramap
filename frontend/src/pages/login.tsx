import { StrictMode } from 'react'
import LoginForm from '../components/LoginForm'
import { Graphic } from '../components/Graphics'
import {Header, MainSection } from '../components/Sections'
import {LottieAnimation} from '../components/Graphics'
import bowl from '../assets/images/vegan.svg'
import nutramapLogo from '../assets/images/nutramap_logo.png'
import { motion } from 'framer-motion';
import styled from 'styled-components';



const IconLogoContainer = styled(motion.div)`
  display: flex;
  justify-content: center;
  margin-bottom: 3rem;
`;


function Login(){


  return(
  <StrictMode>
  <Header/>
  <MainSection>
  <div style={{marginTop: '125px' }}></div>

          {/* Icon Logo */}
        <IconLogoContainer
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <img src={nutramapLogo}
         loading="lazy" alt="" className = 'nutramap-logo-large'/>
        </IconLogoContainer>

  </MainSection>
  <MainSection>
  <LoginForm/>
  </MainSection>
  </StrictMode>
  )
}

export default Login