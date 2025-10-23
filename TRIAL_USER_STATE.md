# Trial User State Management

## Overview

The trial user status is now part of the global `accountInfoAtom` state, making it easy to toggle trial-specific behaviors throughout the app.

## How It Works

1. **Backend**: The `/user/info` endpoint returns `isTrial: true/false`
2. **Frontend**: The `accountInfoAtom` stores this in the global state
3. **Selector**: The `isTrialUserAtom` selector provides easy access

## Usage Examples

### Example 1: Show Different UI for Trial Users

```tsx
import { useRecoilValue } from 'recoil';
import { isTrialUserAtom } from './components/account_states';

function MyComponent() {
  const isTrial = useRecoilValue(isTrialUserAtom);

  return (
    <div>
      {isTrial ? (
        <div>
          <p>You're using a trial account!</p>
          <button>Upgrade to Full Account</button>
        </div>
      ) : (
        <div>
          <p>Welcome back!</p>
        </div>
      )}
    </div>
  );
}
```

### Example 2: Limit Features for Trial Users

```tsx
import { useRecoilValue } from 'recoil';
import { isTrialUserAtom } from './components/account_states';

function LogButton() {
  const isTrial = useRecoilValue(isTrialUserAtom);
  const [logCount, setLogCount] = useState(0);

  const handleAddLog = () => {
    if (isTrial && logCount >= 10) {
      alert('Trial users can only create 10 logs. Please create an account!');
      return;
    }
    // Add log logic...
  };

  return (
    <button onClick={handleAddLog}>
      Add Log {isTrial && `(${logCount}/10)`}
    </button>
  );
}
```

### Example 3: Conditional Navigation

```tsx
import { useRecoilValue } from 'recoil';
import { isTrialUserAtom } from './components/account_states';

function AccountSettings() {
  const isTrial = useRecoilValue(isTrialUserAtom);

  if (isTrial) {
    return (
      <div>
        <h2>Trial Account</h2>
        <p>Create a full account to access settings</p>
        <button>Create Account</button>
      </div>
    );
  }

  return (
    <div>
      {/* Full account settings */}
    </div>
  );
}
```

### Example 4: Access Full Account Info

```tsx
import { useRecoilValue } from 'recoil';
import { accountInfoAtom } from './components/account_states';

function UserProfile() {
  const accountInfo = useRecoilValue(accountInfoAtom);

  return (
    <div>
      <p>Name: {accountInfo.name}</p>
      <p>Email: {accountInfo.email}</p>
      {accountInfo.isTrial && (
        <span className="badge">Trial User</span>
      )}
    </div>
  );
}
```

## State Structure

```typescript
interface AccountInfo {
  name: string;
  email: string;
  password: string;
  isTrial?: boolean;  // true for trial users, false/undefined otherwise
}
```

## Available Exports

```typescript
import {
  accountInfoAtom,      // Full account info atom
  isTrialUserAtom,      // Selector that returns just the trial status
  firstNameAtom,        // Selector for first name
  useRefreshAccountInfo // Hook to refresh account data
} from './components/account_states';
```

## When Trial Status Is Set

The trial status is automatically set when:
1. A trial user is created (`/trial/create`)
2. Account info is refreshed via `useRefreshAccountInfo()`
3. User logs in (for regular users, `isTrial` will be `false`)

## Backend Changes

The `/user/info` endpoint now returns:
```json
{
  "name": "User Name",
  "email": "user@example.com",
  "role": "user",
  "isTrial": true
}
```

This comes from the JWT token's `trial` flag, which is set when creating trial users.
