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

async function requestWithToken(url : string, method = 'GET', data = null) {
  console.log("requesting with token")
  const token = localStorage.getItem('access_token');
  if (!token) {
      throw new Error('Authentication token not found');
  }
  const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
  }
  
  return fetch(url, {
      method: method,
      headers: headers,
      body: data ? JSON.stringify(data) : null
  })
  .then(response => {
      if (response.status === 401) {
        // Token might be expired or invalid
        console.error('Unauthorized. Redirecting to login.');
      } else {
        //data of response
        return response.json();
      }
  })
}

//browsers do not automatically include custom headers when navigating to new pages or rendering templates.
//therefore, pages must always be unprotected but you can call protected APIs from the page.
function doWithData (protectedEndpoint : string , task : (data: any) => void) {
  console.log("requesting protected data")
  requestWithToken(protectedEndpoint).
  then(data => task(data))
  .catch(error => {
      console.error("Error fetching protected data:", error);
      window.location.href = "/login";
  })
}


export {HTMLContent, doWithData}