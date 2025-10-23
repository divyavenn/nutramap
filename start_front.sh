#!/bin/bash

# Start NutraMap frontend on port 4000
cd "$(dirname "$0")/frontend"

echo "Starting NutraMap frontend on http://localhost:4000"
npm run dev -- --port 4000 --host
