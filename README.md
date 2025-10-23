# nutramap

What can't be measured can't be managed - in other words, you're probably more of a fatass than you think.

A key factor in dysfunctional eating is not knowing what's going in your mouth.  No accurate, seamless interface exists for finding and tracking the nutritional composition of an item or recipe. 


Nutramapper is a comprehensive service for meal planning, analysis, and nutrition tracking - designed by home cooks, for home cooks. 

It uses data from the USDA Economic Research Service to provide incredibly thorough data on foodstuffs by weight - the only lifestyle change needed by the user is to weigh what they cook with/eat on a kitchen scale and jot it down.

Entry into the database is made simple using autocomplete. You choose which nutrients and macros to track - Nutramapper will make you aware of any shortcomings of your diet and suggest you foods that will correct that deficiency. You can add the nutrient profiles for prepared foodstuffs and packaged foods.


 
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