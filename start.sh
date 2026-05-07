#!/usr/bin/env bash
# Start the FastAPI backend.
# The frontend (pure HTML + CDN React) is served directly by FastAPI on port 8000.
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

# Kill any stale process on port 8000
echo ""
echo "Clearing port 8000..."
fuser -k 8000/tcp 2>/dev/null || true
sleep 1

# Install Python dependencies if needed
if [ ! -d "$ROOT/.venv" ] && ! python -c "import fastapi" 2>/dev/null; then
  echo "Installing Python dependencies..."
  pip install -r "$ROOT/requirements.txt" --quiet
fi

# Start backend (serves both API + frontend static files)
echo "Starting FastAPI backend..."
cd "$ROOT/backend"
python main.py &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

echo ""
echo "======================================="
echo "Dashboard: http://localhost:8000"
echo "API docs:  http://localhost:8000/docs"
echo "======================================="
echo "Press Ctrl+C to stop"

trap "kill $BACKEND_PID 2>/dev/null; exit" INT TERM
wait
