import React from "react"
import { motion } from 'framer-motion';

interface WordsProps{
  words : string
}

function Title() {
  return (
  <div className="nutra">nutramap</div>
  )
}

function Heading({words} : WordsProps) {
  return (
  // h1 for the page heading; margin/line-height reset so the .greeting look is unchanged
  <h1 className="greeting" style={{ margin: 0, lineHeight: 'inherit' }}> {words}
  </h1>
  )
}

export {Title, Heading}