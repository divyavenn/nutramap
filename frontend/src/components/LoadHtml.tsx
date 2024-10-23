// src/loadHtml.ts

import React, { useEffect } from 'react';


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

function getHeaderWithToken(content_type : string = "application/x-www-form-urlencoded"){
  const token = localStorage.getItem('access_token');
  if (!token) {
      throw new Error('Authentication token not found');
  }
  return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': content_type
  }
}

async function requestWithToken(url : string, method = 'GET', data = null) {
  return fetch(url, {
      method: method,
      headers: getHeaderWithToken('application/json'),
      body: data ? JSON.stringify(data) : null
  })
  .then(async response => {
    if (!response.ok) {
      const errorText = await response.text();  // Get the HTML error response for debugging
      console.error('Response Error:', response.status, errorText);
      throw new Error(`Request failed with status: ${response.status}`);
    }
    return response.json();  // Parse JSON only if response is OK
  })
  .catch(error => {
    console.error('Request error:', error);
    throw error;
  });
}



async function request(url : string, method = 'GET', data = null) {
  return fetch(url, {
      method: method,
      body: data ? JSON.stringify(data) : null
  })
  .then(async response => {
    if (!response.ok) {
      const errorText = await response.text();  // Get the HTML error response for debugging
      console.error('Response Error:', response.status, errorText);
      throw new Error(`Request failed with status: ${response.status}`);
    }
    return response.json();  // Parse JSON only if response is OK
  })
  .catch(error => {
    console.error('Request error:', error);
    throw error;
  });
}


 function getCorrectRequestMethod(isProtected : boolean){
  if (isProtected){
    return requestWithToken
  }
  else return request
}




//browsers do not automatically include custom headers when navigating to new pages or rendering templates.
//therefore, pages must always be unprotected but you can call protected APIs from the page.
function doWithData (endpoint : string, task : (data: any) => void, method = 'GET', data = null, isProtected: boolean = true) {
  (getCorrectRequestMethod(isProtected))(endpoint, method, data)
  .then(data => {
      task(data)
  })
  .catch(error => {
      console.log("there was an error" + error)
  })
}


export {HTMLContent, doWithData, requestWithToken, getHeaderWithToken}