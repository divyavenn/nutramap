# Pages Separation: /try vs /dashboard

## Overview

The app now has **two separate dashboard pages**:
- **`/try`** - For trial users (no authentication required)
- **`/dashboard`** - For authenticated users only

This clean separation eliminates authentication errors and provides a better user experience.

## Page Breakdown

### `/try` - Trial Dashboard
**File**: `frontend/src/pages/try.tsx`

**Features**:
- ✅ No authentication required
- ✅ Automatically creates trial user on visit
- ✅ Trial user is cleaned up on browser close
- ✅ Shows "Hello, you!" greeting (no name)
- ✅ No account/foods navigation icons
- ✅ Full dashboard functionality (logs, requirements, nutrients)

**What happens**:
1. User visits `/try`
2. Trial user is automatically created via `/trial/create`
3. Foods and nutrients are loaded
4. User can interact with full dashboard
5. Data is cleaned up when browser closes

### `/dashboard` - Authenticated Dashboard
**File**: `frontend/src/pages/dashboard.tsx`

**Features**:
- ✅ Authentication required
- ✅ Redirects to `/login` if not authenticated
- ✅ Shows personalized greeting with user's name
- ✅ Has account and myfoods navigation icons
- ✅ Full dashboard functionality
- ✅ Data persists across sessions

**What happens**:
1. User visits `/dashboard`
2. Authentication check runs
3. If expired → redirect to `/login`
4. If valid → load user data and display dashboard

## Routing

**Updated Routes** (`frontend/src/main.tsx`):
```tsx
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/try" element={<TryNutramapRoot/>} />     // NEW!
  <Route path="/login" element={<Login />} />
  <Route path="/dashboard" element={<DashboardRoot/>} />  // Now auth-only
  <Route path="/account" element={<AccountRoot/>}  />
  <Route path="/hello" element={<NewAccount/>} />
  <Route path="/myfoods" element={<FoodsPage />} />
</Routes>
```

## Navigation Flow

### For New Users (Home Page):
```
Home (/)
  → Click "try it" → /try (trial user created)
  → Click "or log in" → /login
```

### For Logged-In Users:
```
Login → /dashboard (authenticated)
         ├─ /account (settings)
         └─ /myfoods (custom foods)
```

### For Trial Users Who Want to Upgrade:
```
/try → Click "Create Account" → /hello (signup)
```

## Key Differences

| Feature | `/try` | `/dashboard` |
|---------|--------|-------------|
| Authentication | None | Required |
| User Type | Trial only | Registered only |
| Greeting | "Hello, you!" | "Hello, [Name]!" |
| Navigation Icons | None | Account + MyFoods |
| Data Persistence | Browser session only | Permanent |
| Log Limit | 10 logs | Unlimited |
| On Browser Close | Data deleted | Data persists |

## Benefits

1. **No Auth Errors**: Trial users never hit authentication checks
2. **Clean Separation**: Each page has a single purpose
3. **Better UX**: Trial users get instant access without login
4. **Security**: Authenticated dashboard is protected
5. **Maintainability**: Easier to modify each page independently

## Testing

### Test Trial Page (`/try`):
1. Clear localStorage
2. Visit `http://localhost:5173/try`
3. Should see dashboard with 7 requirements
4. Should see "Hello, you!" greeting
5. Should be able to add logs (up to 10)
6. Close browser → data should be deleted

### Test Auth Dashboard (`/dashboard`):
1. Without login → should redirect to `/login`
2. After login → should show personalized dashboard
3. Should see Account and MyFoods icons
4. Should show user's actual name
5. Close browser → data should persist

## Migration Notes

**What Changed**:
- ✅ Removed trial logic from `/dashboard`
- ✅ Created new `/try` page for trials
- ✅ Updated home page to link to `/try`
- ✅ `/dashboard` now requires authentication

**What Stayed the Same**:
- ✅ Components (Logs, NutrientDashboard, etc.) work on both pages
- ✅ Backend endpoints unchanged
- ✅ Authentication flow unchanged
- ✅ Trial user creation/cleanup logic unchanged
