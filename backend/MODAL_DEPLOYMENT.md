# Modal Deployment Guide

## Setup

1. **Install Modal CLI**
   ```bash
   pip install modal
   ```

2. **Authenticate with Modal**
   ```bash
   modal setup
   ```

3. **Create Modal Secrets**

   You need to create a secret called `nutramap-secrets` with your environment variables:

   ```bash
   modal secret create nutramap-secrets \
     MONGO_URI="mongodb+srv://venndivya:qZ6BE54Q5DDVGW4H@users.akqcvfu.mongodb.net/" \
     DB_NAME="nutramapper" \
     JWT_SECRET_KEY="477314e10396029985ce1f3ceca306576019414187572f61126b4da128e2adaf" \
     JWT_ALGORITHM="HS256"
   ```

## Deploy

### Deploy to Modal
```bash
cd backend
modal deploy modal_app.py
```

This will:
- Build the image with all dependencies from `pyproject.toml`
- Deploy your FastAPI app
- Give you a public HTTPS URL (e.g., `https://your-username--nutramap-backend-fastapi-app.modal.run`)

### Run Locally (for testing)
```bash
modal serve modal_app.py
```

This runs the app locally but with Modal's infrastructure.

## Update Frontend

Once deployed, update your frontend's API URL:

1. Create/update `frontend/.env.production`:
   ```
   VITE_API_URL=https://your-username--nutramap-backend-fastapi-app.modal.run
   ```

2. Rebuild frontend:
   ```bash
   cd frontend
   npm run build
   ```

## Benefits of Modal

- ✅ **No Docker needed** - Modal handles containerization
- ✅ **Auto-scaling** - Scales to zero when not in use
- ✅ **Fast cold starts** - Optimized for serverless
- ✅ **HTTPS included** - Automatic SSL certificates
- ✅ **Pay per second** - Only pay for actual usage
- ✅ **Built-in secrets** - Secure environment variable management

## Monitoring

View logs and monitoring:
```bash
modal app logs nutramap-backend
```

Or visit: https://modal.com/apps
