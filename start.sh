#!/usr/bin/env bash
# Start both backend (FastAPI) and frontend (Vite dev) concurrently.
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Nifty Analysis Bot ==="
echo "Root: $ROOT"

# Ensure .env exists
if [ ! -f "$ROOT/.env" ]; then
  echo "No .env found — copying from .env.example"
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "⚠  Please edit .env with your Angel One credentials before trading data will work."
fi

# Kill any stale processes on ports 8000 / 5173
echo ""
echo "Clearing ports 8000 and 5173..."
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
sleep 1

# Backend
echo "Starting FastAPI backend..."
cd "$ROOT/backend"
if [ ! -d ".venv" ] && [ ! -d "../.venv" ]; then
  echo "Installing Python dependencies..."
  pip install -r "$ROOT/requirements.txt" --quiet
fi
python main.py &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Frontend
echo ""
echo "Starting React frontend..."
cd "$ROOT/frontend"
if [ ! -d "node_modules" ]; then
  echo "Installing Node dependencies..."
  npm install --silent
fi
npm run dev &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "==================================="
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "API docs: http://localhost:8000/docs"
echo "==================================="
echo "Press Ctrl+C to stop all services"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
