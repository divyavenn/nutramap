import nutramapLogo from '../assets/images/nutramap_logo.png'
import Account from '../assets/images/account.svg?react'
import '../assets/css/buttons.css'
import React, { useState } from 'react';
import {Link} from 'react-router-dom';

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
    {children}tdhjd
  </body>)
}

function MainSection({children} : ParentComponentProps) {
  return (
    <section className="main-section">
      {children}
    </section>
  )
}

function Header() {
  return (
  <header>
    <section className="nutramap-header" >
      <img  src={nutramapLogo}
            loading="lazy" alt=""
            className="nutramap-logo" />
      <div className="nutra header">nutramap</div>
    </section>
  </header>
  )
}

function DashboardHeader() {
  return (
  <header>
    <section className="nutramap-header" >
      <img  src={nutramapLogo}
            loading="lazy" alt=""
            className="nutramap-logo" />
      <div className="nutra header">nutramap</div>

      <div className="links">
      <Link to="/account"><Account/></Link>
      </div>
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
    <button className="svg-button" {...props}>
     {children}
    </button>
  )
}

interface HoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  childrenOn: React.ReactNode
  childrenOff: React.ReactNode
}


function HoverButton({childrenOn, childrenOff, ...props} : HoverButtonProps){
  const [mouseOn, setMouseOn] = useState(false);
  return (
    <button 
    className="svg-button" 
    onMouseEnter={() => setMouseOn(true)}  // Set hover state to true
    onMouseLeave={() => setMouseOn(false)} // Set hover state to false{...props}>
    {...props} >
      {mouseOn? childrenOn : childrenOff}
    </button>
  )
}



export {Background, Header, MainSection, ImageButton, HoverButton, DashboardHeader}