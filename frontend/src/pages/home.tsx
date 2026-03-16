import { StrictMode } from 'react'
import {Link} from 'react-router-dom';
import {Title} from '../components/Title'
import {Header, MainSection } from '../components/Sections'
import { CopyReelFeature } from '../components/CopyReel';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import foodPanelLogo from '../assets/images/nutramap_logo.png'

const IconLogoContainer = styled(motion.div)`
  display: flex;
  justify-content: center;
  margin-bottom: 3rem;
`;

const DemoVideo = styled(motion.video)`
  width: 100%;
  max-width: 720px;
  border-radius: 16px;
  margin-top: 2rem;
  display: block;

  @media (max-width: 768px) {
    max-width: 100%;
    border-radius: 10px;
  }
`;

const WatchLink = styled(motion.a)`
  display: block;
  text-align: center;
  color: var(--dark-blue);
  font-size: 20px;
  padding-top: 40px;
  cursor: pointer;
  text-decoration: none;

  &:hover {
    opacity: 0.75;
  }
`;

const isMobile = () => window.innerWidth <= 768;

function Home(){
  const features = [
    "natural language health tracking",
    "automatically detects and manages your recipes",
    "USDA nutrition data + gram measurements as ground truth",
    "add custom foods effortlessly with pictures of nutrition labels",
    "easy as texting your mother"
  ];

  if (isMobile()) {
    return (
      <StrictMode>
        <Header />
        <MainSection>
          <Title />
        </MainSection>
        <MainSection>
          <IconLogoContainer
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <img src={foodPanelLogo} loading="lazy" alt="nutramap logo" className="nutramap-logo-large" />
          </IconLogoContainer>
          <CopyReelFeature features={features} />
        </MainSection>
        <MainSection>
          <WatchLink
            href="/nutramap_demo.mp4"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            watch demo
          </WatchLink>
        </MainSection>
      </StrictMode>
    );
  }

  return (
    <StrictMode>
      <Header />
      <MainSection>
        <Title />
      </MainSection>
      <MainSection>
        <IconLogoContainer
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <img src={foodPanelLogo} loading="lazy" alt="nutramap logo" className="nutramap-logo-large" />
        </IconLogoContainer>
        <CopyReelFeature features={features} />
      </MainSection>
      <MainSection>
        <div className="link-text">
          <Link to="/try">try it</Link>
        </div>
        <div className="link-text">
          <Link to="/login">or log in</Link>
        </div>
        <DemoVideo
          src="/nutramap_demo.mp4"
          autoPlay
          loop
          playsInline
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.0 }}
        />
      </MainSection>
    </StrictMode>
  );
}

export default Home
