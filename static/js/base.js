console.log('Script loaded and executed.');


// The DOMContentLoaded event is fired when the initial HTML document has been completely loaded and parsed,
// if you try to access DOM elements like loginForm using document.getElementById() 
// before the HTML is fully loaded, those elements might not exist yet, resulting in errors
// you get the same thing by placing script at end of html, but good to have both just in case.
document.addEventListener('DOMContentLoaded', function () {
    if (window.location.pathname.startsWith('/user')) {
        console.log("Authorized.")
        // Call the function only for paths that start with /user
        requestWithToken(window.location.pathname);
    }

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
                    console.log('Redirecting...');
                            window.location.href = '/user/dashboard'; // Redirect after verifying token
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
          window.location.href = '/auth/login';
        } else {
          return response.json();
        }
    })
}

    // Add Todo JS
    const todoForm = document.getElementById('todoForm');
    if (todoForm) {
        todoForm.addEventListener('submit', async function (event) {
            event.preventDefault();

            const form = event.target;
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            const payload = {
                title: data.title,
                description: data.description,
                priority: parseInt(data.priority),
                complete: false
            };

            try {
                const response = await fetch('/todos/todo', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getCookie('access_token')}`
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    form.reset(); // Clear the form
                } else {
                    // Handle error
                    const errorData = await response.json();
                    alert(`Error: ${errorData.detail}`);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('An error occurred. Please try again.');
            }
        });
    }
