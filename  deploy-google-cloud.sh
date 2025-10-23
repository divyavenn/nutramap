#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Variables
PROJECT_ID="burnished-fold-443107-p1"
REPO_NAME="nutramap-repo"
REGION="us-west1"
BACKEND_IMAGE_NAME="nutramap-backend"
FRONTEND_IMAGE_NAME="nutramap-frontend"
ENV_FILE="frontend/.env.production"
BACKEND_PORT=8000
FRONTEND_PORT=8080

# Build, Push, and Deploy Backend
echo "Building backend image..."
docker build --platform=linux/amd64 --build-arg PORT=$BACKEND_PORT -t $BACKEND_IMAGE_NAME ./backend

echo "Tagging backend image..."
docker tag $BACKEND_IMAGE_NAME $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$BACKEND_IMAGE_NAME

echo "Pushing backend image..."
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$BACKEND_IMAGE_NAME

echo "Deploying backend to Cloud Run..."
BACKEND_URL=$(gcloud run deploy $BACKEND_IMAGE_NAME \
    --image $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$BACKEND_IMAGE_NAME \
    --region $REGION \
    --allow-unauthenticated \
    --format="value(status.url)")

echo "Backend deployed at $BACKEND_URL"

# Update the VITE_API_URL in .env.production
echo "Updating VITE_API_URL in $ENV_FILE..."
if grep -q "^VITE_API_URL=" "$ENV_FILE"; then
    # Replace the existing value
    sed -i '' "s|^VITE_API_URL=.*|VITE_API_URL=$BACKEND_URL|" "$ENV_FILE"
else
    # Append the variable if it doesn't exist
    echo "VITE_API_URL=$BACKEND_URL" >> "$ENV_FILE"
fi

# Build, Push, and Deploy Frontend
echo "Building frontend image..."
docker build --platform=linux/amd64 --build-arg PORT=$FRONTEND_PORT -t $FRONTEND_IMAGE_NAME ./frontend

echo "Tagging frontend image..."
docker tag $FRONTEND_IMAGE_NAME $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$FRONTEND_IMAGE_NAME

echo "Pushing frontend image..."
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$FRONTEND_IMAGE_NAME

echo "Deploying frontend to Cloud Run..."
gcloud run deploy $FRONTEND_IMAGE_NAME \
    --image $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$FRONTEND_IMAGE_NAME \
    --region $REGION \
    --allow-unauthenticated
    --timeout=1000s

echo "Frontend deployed successfully!"