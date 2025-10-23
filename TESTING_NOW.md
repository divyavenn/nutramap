# 🧪 Testing Trial User - DO THIS NOW

## What Was Fixed

1. ✅ **Backend**: Trial users now get 7 default requirements created
2. ✅ **Backend**: Trial user cleanup now supports POST method (for sendBeacon)
3. ✅ **Frontend**: Configured to use localhost backend

## Test Steps

### 1. Restart Frontend Dev Server

**Stop** your current frontend server (Ctrl+C), then restart:
```bash
cd frontend
npm run dev
```

### 2. Clear localStorage and Reload

In your browser console:
```javascript
localStorage.clear()
location.reload()
```

### 3. Watch Backend Logs

In your backend terminal, you should see:
```
Created requirement for Protein (ID: 1185)
Created requirement for Carbohydrate (ID: ...)
Created requirement for Fat, total (ID: ...)
Created requirement for Fiber, total dietary (ID: ...)
Created requirement for Iron, Fe (ID: ...)
Created requirement for Vitamin D (D2 + D3) (ID: ...)
Created requirement for Vitamin K (phylloquinone) (ID: ...)
Trial user created with 7 requirements
```

### 4. Check Dashboard

You should see:
- ✅ 7 nutrient bars displayed
- ✅ NO "No requirements found" warning

### 5. Test Deletion

1. Click the trash icon on any requirement
2. Backend should log: `Looking for requirement with filters: ...`
3. Response should be **200** (not 404)
4. Requirement should disappear

### 6. Test Cleanup on Close

1. Close the browser tab
2. Backend should log: `Cleaned up trial user {id}: X logs, Y requirements`
3. Reopen the page - new trial user should be created

## Expected Browser Console Logs

```
http://localhost:8000/trial/create
http://localhost:8000/food/all
http://localhost:8000/nutrients/all
http://localhost:8000/user/info
http://localhost:8000/requirements/all
```

## Troubleshooting

### Still seeing Modal URLs?
- Make sure you **restarted** the frontend dev server
- Check `.env` shows: `VITE_API_URL=http://localhost:8000`

### Still "No requirements found"?
- Check backend logs for warnings: `WARNING: Nutrient '...' not found in database!`
- The nutrient names might not match your database

### 404 on deletion?
- Check backend logs to see what filters are being used
- Make sure a fresh trial user was created AFTER the fix
