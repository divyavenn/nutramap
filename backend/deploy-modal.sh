#!/bin/bash

echo "🚀 NutraMap Modal Deployment Script"
echo "===================================="
echo ""

echo "✅ Using Modal from uv environment"
echo ""
echo "Loading your environment variables into Modal secrets..."

uv run modal secret create nutramap-secrets --force \
  MONGO_URI="mongodb+srv://venndivya:qnx2dgb5FHB4zde_hdy@cluster0.k2sopge.mongodb.net/" \
  DB_NAME="nutramapper" \
  JWT_SECRET_KEY="477314e10396029985ce1f3ceca306576019414187572f61126b4da128e2adaf" \
  JWT_ALGORITHM="HS256"

echo ""
echo "✅ Secrets created!"
echo ""
echo "🚢 Deploying to Modal..."
uv run modal deploy main.py

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Copy the Modal URL from above"
echo "2. Update your frontend .env with: VITE_API_URL=<modal-url>"
echo "3. Rebuild your frontend: npm run build"
echo ""
echo "To view logs: modal app logs nutramap-backend"
