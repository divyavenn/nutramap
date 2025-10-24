import { request } from './endpoints';

/**
 * Check if current user is a trial user
 */
export function isTrialUser(): boolean {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return false;

    const [, payloadBase64] = token.split('.');
    const payload = JSON.parse(atob(payloadBase64));

    return payload.trial === true;
  } catch (error) {
    return false;
  }
}

/**
 * Get trial ID from token
 */
export function getTrialId(): string | null {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return null;

    const [, payloadBase64] = token.split('.');
    const payload = JSON.parse(atob(payloadBase64));

    return payload.trial_id || null;
  } catch (error) {
    return null;
  }
}

/**
 * Create a trial user session
 * Returns token in same format as regular login
 */
export async function createTrialUser(): Promise<boolean> {
  try {
    const response = await request('/trial/create', 'POST', null, 'JSON', false);

    if (response.status === 200) {
      const data = response.body;

      // Store the trial token (same as regular login)
      localStorage.setItem('access_token', data.access_token);

      // Load foods, nutrients, and account info (same as regular login)
      localStorage.setItem('foods', JSON.stringify(await (await request('/food/all', 'GET')).body));
      localStorage.setItem('nutrients', JSON.stringify(await (await request('/nutrients/all', 'GET')).body));

      console.log('Trial user created successfully.');

      return true;
    }

    return false;
  } catch (error) {
    console.error('Error creating trial user:', error);
    return false;
  }
}

/**
 * Cleanup trial user data on browser close
 * This should be called when the page is unloaded
 */
export async function cleanupTrialUser() {
  const trialId = getTrialId();

  if (trialId && isTrialUser()) {
    try {
      // Use sendBeacon for reliable cleanup on page unload
      const url = `${import.meta.env.VITE_API_URL}/trial/cleanup/${trialId}`;

      // Try sendBeacon first (most reliable for page unload)
      const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
      const beaconSent = navigator.sendBeacon(url, blob);

      if (!beaconSent) {
        console.warn('sendBeacon failed, falling back to fetch with keepalive');
        // Fallback to fetch with keepalive flag
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
          keepalive: true, // Ensures request completes even if page closes
        }).catch(err => {
          console.error('Fetch cleanup also failed:', err);
        });
      }

      // Clear local storage
      localStorage.removeItem('access_token');
      localStorage.removeItem('is_trial_user');
      localStorage.removeItem('trial_id');
    } catch (error) {
      console.error('Error cleaning up trial user:', error);
    }
  }
}

/**
 * Initialize trial user session if no user is logged in
 */
export async function initializeTrialUserIfNeeded(): Promise<void> {
  // Check if there's already a valid token
  const token = localStorage.getItem('access_token');

  if (token) {
    // Token exists, check if it's valid
    try {
      const [, payloadBase64] = token.split('.');
      const payload = JSON.parse(atob(payloadBase64));
      const currentTime = Math.floor(Date.now() / 1000);

      // If token is still valid, don't create a new trial user
      if (payload.exp && payload.exp > currentTime) {
        return;
      }
    } catch (error) {
      // Token is malformed, create new trial user
    }
  }

  // No valid token, create a trial user
  await createTrialUser();
}

/**
 * Setup cleanup listener for trial users
 */
export function setupTrialUserCleanup() {
  // Only setup cleanup if user is a trial user
  if (isTrialUser()) {
    // Listen to multiple events to catch different close scenarios
    window.addEventListener('beforeunload', cleanupTrialUser);
    window.addEventListener('unload', cleanupTrialUser);
    window.addEventListener('pagehide', cleanupTrialUser); // Mobile Safari support

    // Handle visibility change (tab hidden) - cleanup after 30 seconds of being hidden
    let hiddenTimeout: number | null = null;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden - set timeout to cleanup after 30 seconds
        hiddenTimeout = window.setTimeout(() => {
          console.log('Tab hidden for 30 seconds, cleaning up trial user');
          cleanupTrialUser();
        }, 30000);
      } else {
        // Tab is visible again - cancel cleanup
        if (hiddenTimeout !== null) {
          window.clearTimeout(hiddenTimeout);
          hiddenTimeout = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
}
