// src/loadHtml.ts

import { useEffect } from 'react';


interface ContentProps{
  url: string
}

function HTMLContent({url} : ContentProps) {
  // Call the LoadHTML function when the App component mounts
  useEffect(() => {
    // Call the LoadHTML function when the App component mounts
    loadContent(url);
  }, []);
  // Empty dependency array ensures it runs only once, like componentDidMount

  return (
    <div id="app">
      <p>Loading external content...</p>
    </div>
  );
}

//--------------------------------------------HELPERS--------------------------------------------

// Function to load external HTML and insert it into an element
async function loadContent(url : string) {
  try {
    const response = await fetch(url);
    
    // Check if the fetch was successful
    if (!response.ok) {
      throw new Error(`Failed to fetch HTML from ${url}: ${response.statusText}`);
    }

    // Get the HTML content as text
    const htmlContent = await response.text();

    // Find the target element and insert the HTML content
    const targetElement = document.getElementById("app");
    if (targetElement) {
      targetElement.innerHTML = htmlContent;
    } else {
      console.error(`Element with ID ${"app"} not found.`);
    }

  } catch (error) {
    console.error('Error loading HTML:', error);
  }
}

function printDictionary(dictionary: Record<string, any>): void {
  for (const key in dictionary) {
    if (dictionary.hasOwnProperty(key)) {
      console.log(`${key} : ${dictionary[key]}`);
    }
  }
}

function getHeader(authorized : boolean = true, hasData : boolean = false, data_type : 'JSON' | 'URLencode' = 'URLencode'){
  let header : {[key: string]: any} = {}
  if (authorized) {
    const token = localStorage.getItem('access_token');
    if (!token) {
      throw new Error('Authentication token not found');
    }
    header['Authorization'] = `Bearer ${token}`;
  }
  if (hasData){
    if (data_type == 'JSON') {
      header['Content-Type'] = 'application/json'
    }
    else {
      header['Content-Type'] = "application/x-www-form-urlencoded"
    }
  }
  return header;
}

function proxy(endpoint : string ) {
  console.log((import.meta.env.VITE_API_URL) + endpoint)
  return (import.meta.env.VITE_API_URL) + endpoint
}

async function request(url : string, method : string = 'GET', data : any = null, data_type : 'JSON' | 'URLencode' = 'URLencode', authorized : boolean = true) {
  // console.log(`requesting ${method} ${url} and ${data_type} body: ${data ? ((data_type == 'JSON') ? JSON.stringify(data) : new URLSearchParams(data)) : null}`)
  return fetch(proxy(url), {
      method: method,
      headers: getHeader(authorized, (data !== null), data_type),
      body: data ? ((data_type == 'JSON') ? JSON.stringify(data) : new URLSearchParams(data)) : null
  })
  .then(async response => {
      let data = await response.json()
      return {
        status: response.status, // Include the status code
        body: data,      // Include the parsed response body
      };
    })
}

//browsers do not automatically include custom headers when navigating to new pages or rendering templates.
//therefore, pages must always be unprotected but you can call protected APIs from the page.
function doWithData (endpoint : string, task : (data: any) => void, method = 'GET',  data : any = null, data_type : 'JSON' | 'URLencode' = 'URLencode', authorized : boolean = true) {
  request(endpoint, method, data, data_type, authorized)
  .then(async response => {
      task(response.body)
  })
}



export {HTMLContent, doWithData, request}