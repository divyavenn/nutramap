# Debugging Trial User 500 Error

## The Problem

`POST /trial/create` is returning **500 Internal Server Error**, which causes CORS errors in the browser.

## Root Cause

The backend code we fixed isn't running yet. You need to **restart the backend**.

## Step-by-Step Fix

### 1. Stop Backend

In your backend terminal (where uvicorn is running):
```bash
Ctrl+C
```

### 2. Start Backend

```bash
cd backend
uv run uvicorn main:app --reload
```

### 3. Watch the Terminal

When you restart, look for:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

### 4. Test the Endpoint

```bash
curl -X POST http://localhost:8000/trial/create
```

**Expected Response**:
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

**Backend Logs Should Show**:
```
=== Starting trial user creation ===
Creating trial user in database...
Trial user created with ID: ...
Looking up nutrients for 7 requirements...
  Looking for nutrient: 'Protein'
  ✓ Created requirement for Protein (ID: 1185)
  Looking for nutrient: 'Carbohydrate'
  ✓ Created requirement for Carbohydrate (ID: ...)
  ...
=== Trial user created with 7/7 requirements ===
```

### 5. If You See Errors

**Error**: `✗ WARNING: Nutrient 'Protein' not found in database!`

**Fix**: The nutrient names in `DEFAULT_REQUIREMENTS` don't match your database.

Check what nutrient names exist:
```bash
# In mongo shell or compass, look at nutrients collection
# Find the exact names
```

Then update `DEFAULT_REQUIREMENTS` in `backend/src/routers/trial_user.py`:
```python
DEFAULT_REQUIREMENTS = {
    "Protein": 50,  # Make sure this matches DB exactly
    "Carbohydrate": 300,
    # etc...
}
```

### 6. Test Frontend

**Clear storage**:
```javascript
localStorage.clear()
```

**Visit**:
```
http://localhost:5173/try
```

**Expected**:
- ✅ No CORS errors
- ✅ No 500 errors
- ✅ Dashboard loads
- ✅ 7 requirements displayed

## If Still Getting CORS Error

CORS errors happen AFTER the 500 error. If you still see CORS:
1. The endpoint is still failing (500)
2. Check backend logs for the actual error
3. The detailed logging we added will show exactly what's failing

## Key Points

1. **500 error comes first** → causes CORS error
2. **Fix 500 first** → CORS will work automatically
3. **Backend must be restarted** → changes aren't live until restart
4. **Watch backend logs** → they'll tell you exactly what's wrong
