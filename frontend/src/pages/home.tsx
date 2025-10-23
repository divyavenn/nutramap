import { StrictMode } from 'react'
import {Link} from 'react-router-dom';
import {Title, Subtitle} from '../components/Title'
import {Header, MainSection } from '../components/Sections'
import {LottieAnimation} from '../components/Graphics'
import { RecoilRoot } from 'recoil';

function Home(){
  return(
  <StrictMode>
  <RecoilRoot>
  <Header />
  <MainSection>
    <Title/>
    <Subtitle/>
  </MainSection>
  <MainSection>
    <LottieAnimation
      url="https://lottie.host/a6b05235-d19b-48b1-9811-e76c7f90afb4/Y5gjHcPneC.json"
      width = "300px"
      height = "300px"/>
  </MainSection>
  <MainSection>
  <div className="link-text">
    <Link to="/try">try it</Link>
  </div>
  <div className="link-text" style={{marginTop: '10px', fontSize: '16px'}}>
    <Link to="/login">or log in</Link>
  </div>
  </MainSection>
  </RecoilRoot>
</StrictMode>)
}

export default Home