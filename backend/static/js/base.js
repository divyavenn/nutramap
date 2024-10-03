console.log('Script loaded and executed.');


// The DOMContentLoaded event is fired when the initial HTML document has been completely loaded and parsed,
// if you try to access DOM elements like loginForm using document.getElementById() 
// before the HTML is fully loaded, those elements might not exist yet, resulting in errors
// you get the same thing by placing script at end of html, but good to have both just in case.
document.addEventListener('DOMContentLoaded', function () {
    getDataForRoute('/user/dashboard', '/user/info', update_email )

    //----------------------------------------------LOGIN------------------------------------------------
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        console.log('Form found, attaching submit handler...');
        loginForm.addEventListener('submit', async function (event) {
            event.preventDefault(); // Prevent the default form submission

            const form = event.target;
            const formData = new FormData(form);
            // create a payload with the form's keys (field names) and values (user entries)
            const payload = new URLSearchParams();
            for (const [key, value] of formData.entries()) {
                payload.append(key, value);
            }

            try {
                // Send a POST request to the login endpoint
                const response = await fetch('/auth/submit_login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: payload.toString()
                });

                if (response.ok) {
                    const data = await response.json();
                    const token = data.access_token;
                
                    // Store the token in localStorage (or sessionStorage if desired)
                    localStorage.setItem('access_token', token);

                    console.log('Login successful.');
                    window.location.href = '/user/dashboard'
                } else {
                    // Log the full response for debugging
                    const errorData = await response.json();
                    console.error('Full error response:', errorData);

                    // Handle error response
                    const errorMessage = errorData.error || 'An unknown error occurred';
                    alert(`Error: ${errorMessage}`);
                }
            } catch (error) {
                // Log the full error for debugging purposes
                console.error('Error occurred:', error);
                // Handle network or unexpected errors
                alert('An unexpected error occurred. Please try again.');
            }
        });
    }


});

//browsers do not automatically include custom headers when navigating to new pages or rendering templates.
//therefore, pages must always be unprotected but you can call protected APIs from the page.
function getDataForRoute(renderPage, protectedEndpoint, task) {
    if (window.location.pathname === renderPage)
        {
            console.log("requesting protected data")
            requestWithToken(protectedEndpoint).
            then(data => task(data))
            .catch(error => {
                console.error("Error fetching protected data:", error);
                //window.location.href = "/auth/login";
            })
        }
    }


function requestWithToken(url, method = 'GET', data = null) {
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
          //window.location.href = '/auth/login';
        } else {
          //data of response
          return response.json();
        }
    })
}

//----------------------------------------------------------------------
function update_email(data){
    const userInfo = document.getElementById("user-info");
    userInfo.innerText = data.email;
}
