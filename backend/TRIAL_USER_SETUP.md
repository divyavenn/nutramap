# Trial User Setup

The trial user system allows visitors to try NutraMap without creating an account. Instead of creating temporary users that get deleted, the system now uses a **single permanent trial account** that all trial users share.

## Initial Setup

### 1. Create the Trial User

Run the setup script to create the permanent trial user and generate its authentication token:

```bash
cd /Users/divyavenn/Documents/GitHub/nutramap/backend
python src/scripts/setup_trial_user.py
```

This script will:
- Create a trial user account in MongoDB with email `trial@nutramap.app`
- Set up default nutrient requirements (US RDA values)
- Generate a long-lived JWT token (valid for 10 years)
- Optionally add the token to your `.env` file

### 2. Add Token to Environment

If you didn't use the automatic option, manually add the token to your `.env` file:

```bash
TRIAL_USER_TOKEN=eyJhbGc...your_token_here
```

### 3. Deploy

After adding the token, restart your backend server. The trial login will now work!

## How It Works

### User Flow

1. User clicks "Try it" on the home page
2. Frontend calls `/trial/create` endpoint
3. Backend returns the permanent trial user token
4. User is logged into the shared trial account
5. User can explore NutraMap with full functionality

### Backend (`/trial/create`)

- Returns the `TRIAL_USER_TOKEN` from environment
- No user creation, no temporary accounts
- All trial users share the same account

### Frontend

- Calls `/trial/create` to get the trial token
- Stores token in localStorage (same as regular login)
- No cleanup needed when user leaves

## Resetting Trial Data

Since all trial users share one account, you may want to periodically clean up the data:

```bash
# Reset trial user data (deletes all logs, custom foods, recipes)
curl -X POST http://your-api-url/trial/reset
```

You can run this:
- Manually when needed
- On a schedule (e.g., daily cron job)
- When the trial account gets too cluttered

## Differences from Old System

### Old System (Deprecated)
- ❌ Created new user for each "Try it" click
- ❌ UUID-based temporary accounts
- ❌ Required cleanup on browser close
- ❌ Left orphaned data if cleanup failed
- ❌ Complex lifecycle management

### New System
- ✅ Single permanent trial account
- ✅ Simple token-based login
- ✅ No cleanup needed
- ✅ No orphaned data
- ✅ Easy to reset when needed

## Security Considerations

### Token Expiration
The trial token is valid for 10 years. This is intentional because:
- The trial account has no sensitive data
- Users can't change password or personal info
- Data can be reset at any time
- Makes deployment easier (no token rotation needed)

### Data Isolation
- Trial users can only see/modify trial account data
- Regular user data is completely isolated
- Trial account has same permissions as regular users (no elevated access)

### Data Persistence
- Trial data persists across sessions
- This is a feature - users can return and see their previous work
- Admins can reset trial data periodically via `/trial/reset`

## Monitoring

Check trial user activity:

```javascript
// In MongoDB
db.logs.find({ user_id: ObjectId("trial_user_id") }).count()
db.custom_foods.find({ user_id: ObjectId("trial_user_id") }).count()
```

## Troubleshooting

### "Trial user not configured" error
- Check that `TRIAL_USER_TOKEN` is in your `.env` file
- Verify the token is valid JWT format
- Restart your backend server

### Trial user not found in database
- Run `python src/scripts/setup_trial_user.py` to create it
- Check MongoDB connection
- Verify database name matches your config

### Token expired
- Regenerate token: `python src/scripts/setup_trial_user.py`
- Choose "yes" when asked to regenerate
- Update `.env` file and restart server

## Migration from Old System

If you have old temporary trial users in your database, clean them up:

```javascript
// In MongoDB - delete all old trial users
db.users.deleteMany({
  is_trial: true,
  is_permanent_trial: { $ne: true }
})

// Clean up their orphaned data
db.logs.deleteMany({
  user_id: { $in: [/* old trial user IDs */] }
})

db.requirements.deleteMany({
  user_id: { $in: [/* old trial user IDs */] }
})
```

Or use the cleanup endpoint:

```bash
curl -X POST http://your-api-url/trial/cleanup-old-trials
```
