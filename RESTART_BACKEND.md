# ⚠️ RESTART YOUR BACKEND NOW

## The Problem

Your backend is still running the **old code** with bugs:
- ❌ Wrong field name: `{"name": ...}` instead of `{"nutrient_name": ...}`
- ❌ Trial user creation returns 500 error
- ❌ No requirements are created

## The Fix

We've fixed the code, but the backend needs to be restarted to pick up the changes.

## Steps to Restart

### 1. Stop the Backend

In your backend terminal (where uvicorn is running):
```bash
Ctrl+C
```

### 2. Restart the Backend

```bash
cd backend
uv run uvicorn main:app --reload
```

### 3. Verify It's Working

Test the trial endpoint:
```bash
curl -X POST http://localhost:8000/trial/create
```

**Expected**: Should see `{"access_token": "...", "token_type": "bearer"}`

**Backend logs should show**:
```
Created requirement for Protein (ID: 1185)
Created requirement for Carbohydrate (ID: ...)
...
Trial user created with 7 requirements
```

## Then Test Frontend

### 1. Clear Storage

```javascript
localStorage.clear()
```

### 2. Visit `/try`

```
http://localhost:5173/try
```

**Expected**:
- ✅ No authentication errors
- ✅ "Hello, you!" greeting
- ✅ 7 nutrient bars displayed
- ✅ Can add logs

## If Still Getting Errors

Check backend logs for:
- `WARNING: Nutrient '...' not found in database!`

This means nutrient names don't match. You may need to check your database.
