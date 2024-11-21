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
    <Link to="/login">login</Link>
  </div>
  </MainSection>
  </RecoilRoot>
</StrictMode>)
}

export default Home