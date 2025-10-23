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
      const blob = new Blob([JSON.stringify({})], { type: 'application/json' });

      navigator.sendBeacon(url, blob);

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
    window.addEventListener('beforeunload', cleanupTrialUser);
    window.addEventListener('unload', cleanupTrialUser);
  }
}
