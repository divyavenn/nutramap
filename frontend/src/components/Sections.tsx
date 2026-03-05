import foodPanelLogo from '../assets/images/nutramap_logo.png'
import questionMark from '../assets/images/question_mark.svg'
import React, { useState } from 'react';
import {Link, useLocation} from 'react-router-dom';
import { isLoginExpired } from './utlis';
import { SvgButton, HeaderLinkButton } from './Sections.styled';

// 3 rules of JSX
// (1) return a single root elem (wrap in div or React Fragment <>...</>)
// (2) All tags are closed
// (3} camelCase everything (key: class becomed className)
interface ParentComponentProps {
  children: React.ReactNode
}


function Background({children} : ParentComponentProps) {
  return (
  <body className="nutramap-background">
    {children}
  </body>)
}

function MainSection({children} : ParentComponentProps) {
  return (
    <section className="main-section">
      {children}
    </section>
  )
}


type PageLinkIcon = {
  to: string;
  img: React.ReactNode;
};

function Header({linkIcons, children} : {linkIcons? : PageLinkIcon[], children?: React.ReactNode}) {
  const location = useLocation();
  const isTrial = sessionStorage.getItem('isTrial') === 'true';
  const isLoggedIn = !isLoginExpired();

  const processedLinkIcons = linkIcons?.map(link => {
    if (link.to === '/account' && (!isLoggedIn || isTrial)) return { ...link, to: '/login' };
    return link;
  });

  return (
  <header>
    <section className="nutramap-header">
      <Link className="header-logo-container" to="/dashboard">
      <img src={foodPanelLogo}
            loading="lazy" alt="foodPanelAI logo" className = 'nutramap-logo'/>
      <div className="nutra header">nutramap</div>
      </Link>
      <div style = {{width : '80%'}} ></div>
      {processedLinkIcons &&
        processedLinkIcons.map((link) => {
          const isActive = location.pathname === link.to;
          return (
          <HeaderLinkButton key={link.to}
                to={link.to}
                className={link.to === '/try' || link.to === '/dashboard' ? 'tutorial-home-link' : undefined}
                style={isActive ? { fill: '#a855f7' } : undefined}>
                {React.cloneElement(link.img as React.ReactElement, {
                  style: isActive ? { fill: '#a855f7' } : undefined
                })}
          </HeaderLinkButton> )
        })
      }
      {children}
      <HeaderLinkButton className="tutorial-home-link" to="/try" title="Take a tour">
        <img src={questionMark} alt="Take a tour" width="30" height="30" />
      </HeaderLinkButton>
    </section>
  </header>
  )
}


function BottomMargin() {
  return(<section className="margin-bottom"></section>)
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
}

function ImageButton({children, ...props} : ButtonProps){
  return (
    <SvgButton {...props}>
     {children}
    </SvgButton>
  )
}

interface HoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  childrenOn: React.ReactNode
  childrenOff: React.ReactNode
  onClick?: React.MouseEventHandler<HTMLButtonElement>; // Add an optional onClick prop type
}


function HoverButton({childrenOn, childrenOff, ...props} : HoverButtonProps){
  const [mouseOn, setMouseOn] = useState(false);
  return (
    <SvgButton
    onMouseEnter={() => setMouseOn(true)}
    onMouseLeave={() => setMouseOn(false)}
    {...props} >
      {mouseOn? childrenOn : childrenOff}
    </SvgButton>
  )
}



export {Background, Header, MainSection, ImageButton, HoverButton}
