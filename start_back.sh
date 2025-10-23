#!/bin/bash

# Start NutraMap backend on port 8080
cd "$(dirname "$0")/backend"

echo "Starting NutraMap backend on http://localhost:8080"
uv run uvicorn main:fastapi_app --reload --host 0.0.0.0 --port 8080
