# Trial User Behavior Examples

## Quick Reference

```tsx
import { useRecoilValue } from 'recoil';
import { isTrialUserAtom } from './components/account_states';

// In any component:
const isTrial = useRecoilValue(isTrialUserAtom);

if (isTrial) {
  // Trial-specific behavior
}
```

## Common Use Cases

### 1. Show Login Prompt for Trial Users

**In Dashboard or Any Page:**
```tsx
import { useRecoilValue } from 'recoil';
import { isTrialUserAtom } from '../components/account_states';
import LoginPrompt from '../components/LoginPrompt';

function Dashboard() {
  const isTrial = useRecoilValue(isTrialUserAtom);

  return (
    <div>
      {isTrial && <LoginPrompt />}

      {/* Rest of dashboard */}
    </div>
  );
}
```

### 2. Limit Log Creation (Backend Already Does This)

The backend already limits trial users to 10 logs. You can show a warning in the UI:

```tsx
import { useRecoilValue } from 'recoil';
import { isTrialUserAtom } from '../components/account_states';

function NewLogButton() {
  const isTrial = useRecoilValue(isTrialUserAtom);
  const [logCount, setLogCount] = useState(0);

  return (
    <div>
      <button disabled={isTrial && logCount >= 10}>
        Add Log
      </button>
      {isTrial && logCount >= 10 && (
        <p>Trial limit reached (10 logs). Create an account for unlimited logs!</p>
      )}
    </div>
  );
}
```

### 3. Hide Advanced Features from Trial Users

```tsx
import { useRecoilValue } from 'recoil';
import { isTrialUserAtom } from '../components/account_states';

function AdvancedSettings() {
  const isTrial = useRecoilValue(isTrialUserAtom);

  if (isTrial) {
    return (
      <div className="upgrade-prompt">
        <h3>Premium Feature</h3>
        <p>Create an account to access advanced settings</p>
        <button>Create Account</button>
      </div>
    );
  }

  return (
    <div>
      {/* Advanced settings UI */}
    </div>
  );
}
```

### 4. Show Different Header/Footer for Trial Users

```tsx
import { useRecoilValue } from 'recoil';
import { isTrialUserAtom } from '../components/account_states';

function Header() {
  const isTrial = useRecoilValue(isTrialUserAtom);

  return (
    <header>
      <Logo />
      <Nav />
      {isTrial && (
        <div className="trial-banner">
          Trial Mode • <a href="/signup">Create Account</a>
        </div>
      )}
    </header>
  );
}
```

### 5. Redirect Trial Users from Account Page

```tsx
import { useRecoilValue } from 'recoil';
import { isTrialUserAtom } from '../components/account_states';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

function AccountPage() {
  const isTrial = useRecoilValue(isTrialUserAtom);
  const navigate = useNavigate();

  useEffect(() => {
    if (isTrial) {
      navigate('/signup');
    }
  }, [isTrial, navigate]);

  if (isTrial) {
    return null; // or loading spinner
  }

  return (
    <div>
      {/* Account settings */}
    </div>
  );
}
```

### 6. Contextual Messaging

```tsx
import { useRecoilValue } from 'recoil';
import { isTrialUserAtom, accountInfoAtom } from '../components/account_states';

function WelcomeMessage() {
  const isTrial = useRecoilValue(isTrialUserAtom);
  const accountInfo = useRecoilValue(accountInfoAtom);

  return (
    <div>
      {isTrial ? (
        <p>
          👋 Welcome to NutraMap! You're in trial mode.
          <a href="/signup">Create an account</a> to save your data.
        </p>
      ) : (
        <p>👋 Welcome back, {accountInfo.name}!</p>
      )}
    </div>
  );
}
```

## Implementation Checklist

- [x] `isTrial` added to `accountInfoAtom`
- [x] `isTrialUserAtom` selector created
- [x] Backend returns `isTrial` in `/user/info`
- [ ] Add login prompt component for trial users
- [ ] Add trial banner to header
- [ ] Add upgrade prompts for premium features
- [ ] Test trial user flow end-to-end

## Testing

After implementing trial-specific behaviors:

1. **Create a fresh trial user:**
   ```javascript
   localStorage.clear()
   location.reload()
   ```

2. **Check state in console:**
   ```javascript
   // Should show isTrial: true
   JSON.parse(atob(localStorage.getItem('access_token').split('.')[1]))
   ```

3. **Verify behaviors:**
   - Trial-specific UI shows
   - Premium features are locked
   - Login prompts appear
   - Data persists across refreshes

4. **Test regular user:**
   - Log in with real account
   - Verify `isTrial` is false
   - Verify all features are accessible
