# Quick Test Guide

## Test the New Pages

### 1. Test Trial Page (`/try`)

**Start Fresh**:
```javascript
localStorage.clear()
```

**Visit**:
```
http://localhost:5173/try
```

**Expected**:
- ✅ Page loads without errors
- ✅ Shows "Hello, you!" greeting
- ✅ 7 nutrient requirements appear
- ✅ Can add logs
- ✅ No account/foods icons in header

**Check Backend Logs**:
```
Created requirement for Protein (ID: ...)
Created requirement for Carbohydrate (ID: ...)
...
Trial user created with 7 requirements
```

### 2. Test Auth Dashboard (`/dashboard`)

**Without Login**:
```
http://localhost:5173/dashboard
```
- ✅ Should redirect to `/login`

**With Login**:
1. Login first at `/login`
2. Visit `/dashboard`
- ✅ Shows personalized greeting
- ✅ Shows account + foods icons
- ✅ All features work

### 3. Test Home Page Flow

**Visit**:
```
http://localhost:5173/
```

**Click "try it"**:
- ✅ Goes to `/try`
- ✅ Trial user created
- ✅ Dashboard loads

**Click "or log in"**:
- ✅ Goes to `/login`

## Common Issues

### "No requirements found"
- Trial user wasn't created properly
- Check backend logs for nutrient lookup errors
- Verify nutrient names in database match `DEFAULT_REQUIREMENTS`

### "Authentication token not found"
- Normal for `/try` page
- Should NOT happen on `/dashboard` (should redirect instead)

### CORS errors
- Make sure backend is running on `localhost:8000`
- Check `.env` has `VITE_API_URL=http://localhost:8000`
- Restart frontend dev server after changing `.env`

## Quick Commands

**Clear and test trial**:
```javascript
localStorage.clear(); location.href='/try'
```

**Check if trial user**:
```javascript
JSON.parse(atob(localStorage.getItem('access_token').split('.')[1])).trial
```

**View account state**:
```javascript
// In React DevTools -> Recoil tab
// Look for accountInfoAtom
```
