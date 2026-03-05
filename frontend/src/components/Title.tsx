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
  <div className="greeting"> {words}
  </div>
  )
}

export {Title, Heading}