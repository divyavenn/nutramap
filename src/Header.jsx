import "../backend/static/css/divya-venkat.webflow.css"

// 3 rules of JSX
// (1) return a single root elem (wrap in div or React Fragment <>...</>)
// (2) All tags are closed
// (3} camelCase everything (key: class becomed className)
function Header() {
  return (
  <header>
    <section className="nutramap-header" >
      <img  src="../static/images/nutramap_logo.png"
            loading="lazy" alt=""
            className="nutramap-logo" />
      <div className="nutra header">nutramap</div>
    </section>
  </header>
  )
}


export default Header