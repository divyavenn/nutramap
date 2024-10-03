import './App.css'
import {useState} from "react"

function App() {
  const [change, setChange] = useState(true)
  return (
    <div>
    <button onClick={() => setChange(!change)}>
      Click Here!
    </button>
    {change ?
    (<svg>
      <circle cx="25" cy="75" r="20" stroke="green" strokeWidth="2" />
    </svg>)
    :
    (<svg>
      <circle cx="25" cy="75" r="20" stroke="red" strokeWidth="2" />
    </svg>)}
  </div>

  )
}

export default App
