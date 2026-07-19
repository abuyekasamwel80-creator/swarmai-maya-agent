#!/bin/bash
set -e

echo "[SwarmAI] Starting HuggingFace Space deployment..."

echo "[SwarmAI] Booting Agent OS + API server on port ${PORT_API:-3001}..."
cd /app/artifacts/api-server
node dist/index.js &
API_PID=$!

sleep 3

echo "[SwarmAI] Starting dashboard on port ${PORT:-7860}..."
cd /app/artifacts/swarm-dashboard
npx vite preview --host 0.0.0.0 --port "${PORT:-7860}" &
DASH_PID=$!

trap "kill $API_PID $DASH_PID 2>/dev/null; exit 1" SIGTERM SIGINT

wait
