import { StrictMode } from 'react'
import {Link} from 'react-router-dom';
import {Title} from '../components/Title'
import {Header, MainSection } from '../components/Sections'
import {LottieAnimation} from '../components/Graphics'
import { RecoilRoot } from 'recoil';
import { CopyReelFeature } from '../components/CopyReel';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import nutramapLogo from '../assets/images/nutramap_logo.png'


const IconLogoContainer = styled(motion.div)`
  display: flex;
  justify-content: center;
  margin-bottom: 3rem;
`;


function Home(){

  const features = [
    "natural language health tracking",
    "automatically detects and manages your recipes",
    "USDA nutrition data + gram measurements as ground truth",
    "add custom foods effortlessly with pictures of nutrition labels",
    "easy as texting your mother"
  ];


  return(
  <StrictMode>
  <RecoilRoot>
  <Header />
  <MainSection>
    <Title/>
   </MainSection>
   <MainSection>
   <IconLogoContainer
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
    >
          <img src={nutramapLogo}
         loading="lazy" alt="" className = 'nutramap-logo-large'/>
     </IconLogoContainer>
     <CopyReelFeature features={features} />
  </MainSection>
<MainSection>
  <div className="link-text">
    <Link to="/try">try it</Link>
  </div>
  <div className = "link-text">
    <Link to="/login">or log in</Link>
  </div>
  </MainSection>
  </RecoilRoot>
</StrictMode>)
}

export default Home