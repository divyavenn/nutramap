import './assets/css/divya-venkat.webflow.css';

interface ListElemProps {
  nutrients: string[]
}
function ListElems({ nutrients} : ListElemProps) { 
  console.log("Rendering:" + nutrients[0]); // Debug log
  const nutrientList = nutrients.map((n) => <li key={n}>{n}</li>);
  return <ul className='custom-list'>{nutrientList}</ul>;
}

export default ListElems;
