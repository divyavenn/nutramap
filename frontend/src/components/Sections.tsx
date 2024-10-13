import nutramapLogo from '../assets/images/nutramap_logo.png'

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

function BottomMargin() {
  return(<section className="margin-bottom"></section>)
}

export {Background, Header, MainSection}