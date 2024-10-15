import {Link} from 'react-router-dom';

interface ListElemProps {
  nutrients: string[]
}
function ListElems({ nutrients} : ListElemProps) { 
  console.log("Rendering:" + nutrients[0]); // Debug log
  const nutrientList = nutrients.map((n) => <li key={n}>{n}</li>);
  return <ul className='custom-list'>{nutrientList}</ul>;
}

interface LinkProps{
  url : string
  text : string
  className? : string
  href? : false
}


function HREFLink({url, text, className = "link-text"} : LinkProps) {
  return (
  <div className={className}>
    <a href={url}>{text}</a>
  </div>)
}

function PageLink({url, text, className = "link-text"} : LinkProps) {
  return (
  <div className={className}>
    <Link to={url}>{text}</Link>
  </div>)
}


export {ListElems, HREFLink, PageLink};
