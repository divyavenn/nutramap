import "../static/css/divya-venkat.webflow.css"
import { createRoot } from 'react-dom/client'

function ListElems(nutrients){
  console.log("Rendering ListElems component"); // Debug log
  const nutrientList = nutrients.map((n) => <li key={n}>{n}</li>)
  return (
    <ul className = 'custom-list'>
        {nutrientList}
    </ul>
  )
}

const nutrients = ['Vitamin A', 'Vitamin C', 'Calcium', 'Iron'];

createRoot(document.getElementById('nutrient-list-root')).render(
  <ListElems nutrients={nutrients} />,
);