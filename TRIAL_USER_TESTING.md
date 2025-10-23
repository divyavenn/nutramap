# Trial User Testing Guide

## How to Test with a Fresh Trial User

Since the bug fix only applies to **newly created** trial users, you need to clear your current session and create a new one.

### Quick Reset (Recommended)

**In Browser Console:**
```javascript
localStorage.clear()
location.reload()
```

### Manual Reset

1. Open DevTools (F12)
2. Go to **Application** tab → **Local Storage** → select your domain
3. Delete these keys:
   - `access_token`
   - `foods`
   - `nutrients`
4. Refresh the page (F5)

### What to Expect After Reset

When the page loads with a fresh trial user:

1. **Backend logs should show:**
   ```
   Created requirement for Protein (ID: ...)
   Created requirement for Carbohydrate (ID: ...)
   Created requirement for Fat, total (ID: ...)
   Created requirement for Fiber, total dietary (ID: ...)
   Created requirement for Iron, Fe (ID: ...)
   Created requirement for Vitamin D (D2 + D3) (ID: ...)
   Created requirement for Vitamin K (phylloquinone) (ID: ...)
   Trial user created with 7 requirements
   ```

2. **Dashboard should display:**
   - 7 nutrient requirement bars
   - Each with a target value (not "No requirements found")

3. **Deleting requirements should:**
   - Return status 200 (not 404)
   - Actually remove the requirement from the dashboard

### If Requirements Still Don't Show

Check backend logs for:
- `WARNING: Nutrient '...' not found in database!`

This means the nutrient names in `DEFAULT_REQUIREMENTS` don't match your database. You may need to adjust the names in `backend/src/routers/trial_user.py`.

### Backend Deployment Note

**IMPORTANT**: If you're testing against Modal (production), you need to:
1. Deploy the backend changes first
2. Then test in the browser

The fix is in the backend code, so it won't work until the backend is redeployed with the fix.
