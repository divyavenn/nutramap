# foodPanelAI

foodPanelAI

 
## Developer Setup

### 🚀 Quick Start

**Local Development (Recommended)**
```bash
# Run both frontend and backend locally
docker compose -f compose.dev.yaml up -d

# Frontend: http://localhost:3001
# Backend: http://localhost:8001/docs
```

**Production Deployment**
```bash
# Deploy backend to Modal (serverless)
cd backend
./deploy-modal.sh

# Deploy frontend with Docker
docker compose up -d
```

📖 **See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment guide**

---

### 🛠️ Manual Setup (Alternative)

#### Backend Package Management (using UV)
```bash
cd backend
uv sync              # Install dependencies
uv run uvicorn main:app --reload  # Run backend
```

#### Frontend Setup
```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Run frontend
```

#### Manual Inspection of Databases
- MongoDB: Use MongoDB Compass or Atlas web interface
- Backend API: http://localhost:8001/docs (FastAPI Swagger UI)