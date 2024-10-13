import React from "react"


interface WordsProps{
  words : string
}

function Title() {
  return (
  <div className="nutramap-title-staggered">
    <div className="nutra">nutra</div>
    <div className="map">map</div>
  </div>
  )
}

function Subtitle() {
  return (<div className="nutramap-subtitle">effortlessly track what you eat.</div>)
}

function Heading({words} : WordsProps) {
  return (
  <div className="nutra"> {words}
  </div>
  )
}

export {Subtitle, Title, Heading}