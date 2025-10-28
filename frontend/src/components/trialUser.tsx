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
 * Login to the shared trial user account
 * Returns token for the permanent trial user
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

      console.log('Logged into trial account successfully.');

      return true;
    }

    return false;
  } catch (error) {
    console.error('Error logging into trial account:', error);
    return false;
  }
}

/**
 * Initialize trial user session if no user is logged in
 * Logs into the shared permanent trial account
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

      // If token is still valid, don't login again
      if (payload.exp && payload.exp > currentTime) {
        console.log('Using existing trial session');
        return;
      }
    } catch (error) {
      // Token is malformed, login to trial account
    }
  }

  // No valid token, login to trial account
  await createTrialUser();
}

/**
 * No-op function for backward compatibility
 * The permanent trial user doesn't need cleanup
 */
export function setupTrialUserCleanup() {
  // No cleanup needed for permanent trial user
  console.log('Trial user is using permanent shared account - no cleanup needed');
}
