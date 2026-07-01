#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check python3
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required but not installed. Please install Python 3.9+ and retry."
  exit 1
fi

PYTHON_VERSION="$(python3 -c 'import sys; print("{}.{}".format(*sys.version_info[:2]))')"
echo "Detected Python ${PYTHON_VERSION}"

VENV_DIR="${SCRIPT_DIR}/.venv"
if [ ! -d "${VENV_DIR}" ]; then
  echo "Creating virtual environment..."
  python3 -m venv --without-pip "${VENV_DIR}" 2>/dev/null || python3 -m venv "${VENV_DIR}" 2>/dev/null || true
fi

if [ -d "${VENV_DIR}" ]; then
  VENV_PIP="${VENV_DIR}/bin/pip"
  if [ ! -x "${VENV_PIP}" ]; then
    echo "Bootstrapping pip in venv..."
    curl -sS https://bootstrap.pypa.io/get-pip.py | "${VENV_DIR}/bin/python3" - >/dev/null 2>&1 || true
  fi
  echo "Installing dependencies into venv..."
  "${VENV_PIP}" install --no-cache-dir -r "${SCRIPT_DIR}/requirements.txt" 2>&1 | tail -5 || echo "Dependency install skipped or failed; continuing."
  PYTHON_BIN="${VENV_DIR}/bin/python3"
else
  echo "Warning: venv not created; falling back to system python"
  PYTHON_BIN="python3"
fi

# Ensure .env loaded if present
if [ -f "${SCRIPT_DIR}/.env" ]; then
  set -a
  source "${SCRIPT_DIR}/.env"
  set +a
fi

PORT="${PORT:-8080}"
HOST="${HOST:-0.0.0.0}"

echo ""
echo "Starting researcher service..."
echo "Docs:       http://127.0.0.1:${PORT}/docs"
echo "SSE:        http://127.0.0.1:${PORT}/research/stream"
echo "Health:     http://127.0.0.1:${PORT}/health"
echo "Chroma DB:  /tmp/researcher_chroma.db"
echo ""

cd "${SCRIPT_DIR}"
exec "${PYTHON_BIN}" -m uvicorn app:app --host "${HOST}" --port "${PORT}"
