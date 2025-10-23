# NutraMap Deployment Guide

This project uses **hybrid deployment**:
- 🖥️ **Backend**: Modal (serverless, auto-scaling)
- 🎨 **Frontend**: Docker (can deploy anywhere)

---

## 🚀 Quick Start

### Local Development (Both Services)
```bash
# Run both frontend and backend locally with Docker
docker compose -f compose.dev.yaml up -d

# Frontend: http://localhost:3001
# Backend: http://localhost:8001
```

### Production Deployment

#### 1. Deploy Backend to Modal
```bash
cd backend
./deploy-modal.sh
```

Or manually:
```bash
pip install modal
modal setup
modal secret create nutramap-secrets \
  OPENAI_API_KEY="your-key" \
  MONGO_URI="your-mongo-uri" \
  DB_NAME="nutramapper" \
  JWT_SECRET_KEY="your-secret" \
  JWT_ALGORITHM="HS256"

modal deploy modal_app.py
```

You'll get a URL like: `https://your-username--nutramap-backend-fastapi-app.modal.run`

#### 2. Update `.env` with Modal URL
```bash
# In .env file
BACKEND_URL=https://your-username--nutramap-backend-fastapi-app.modal.run
```

#### 3. Deploy Frontend
```bash
# Build frontend with production backend URL
docker compose up -d

# Or deploy to Vercel/Netlify/etc
cd frontend
npm run build
```

---

## 📋 Commands Cheat Sheet

```bash
# LOCAL DEVELOPMENT
docker compose -f compose.dev.yaml up -d     # Start both services
docker compose -f compose.dev.yaml down      # Stop both services
docker compose -f compose.dev.yaml logs -f   # View logs

# PRODUCTION
modal deploy backend/modal_app.py            # Deploy backend
docker compose up -d                          # Deploy frontend (with Modal backend)
modal app logs nutramap-backend              # View Modal logs

# TESTING MODAL LOCALLY
cd backend
modal serve modal_app.py                     # Run Modal locally (before deploying)
```

---

## 🎯 Why This Setup?

### Backend on Modal
✅ **No cold starts** - Keep warm instances
✅ **Auto-scales** - Handle traffic spikes
✅ **Pay per use** - Scales to zero when idle
✅ **No Docker issues** - No faiss/numpy compilation problems
✅ **Built-in HTTPS** - Secure by default

### Frontend on Docker
✅ **Deploy anywhere** - Vercel, Netlify, AWS, etc.
✅ **Fast builds** - Static assets
✅ **Easy updates** - Just rebuild and redeploy

---

## 🔧 Environment Variables

### `.env` (root - for Docker Compose)
```bash
FRONTEND_PORT=3001
BACKEND_PORT=8001  # Only used in local dev
BACKEND_URL=https://your-modal-url.modal.run
```

### `backend/.env.local` (for local Docker development)
```bash
OPENAI_API_KEY=xxx
MONGO_URI=xxx
DB_NAME=nutramapper
JWT_SECRET_KEY=xxx
JWT_ALGORITHM=HS256
```

### Modal Secrets (for production backend)
Stored securely in Modal, not in files:
```bash
modal secret create nutramap-secrets ...
```

---

## 🐛 Troubleshooting

**Backend not connecting locally?**
```bash
docker compose -f compose.dev.yaml logs backend
```

**Modal deployment failing?**
```bash
# Test locally first
cd backend
modal serve modal_app.py
```

**Frontend can't reach backend?**
- Check `BACKEND_URL` in `.env`
- Verify Modal app is deployed: `modal app list`
- Check CORS settings in FastAPI

---

## 📊 Monitoring

**Modal Dashboard**: https://modal.com/apps
**View Logs**: `modal app logs nutramap-backend`
**Frontend Logs**: `docker compose logs frontend`
