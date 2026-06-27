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

# Install dependencies
pip3 install --quiet -r "${SCRIPT_DIR}/requirements.txt"

# Ensure .env loaded if present
if [ -f "${SCRIPT_DIR}/.env" ]; then
  set -a
  source "${SCRIPT_DIR}/.env"
  set +a
fi

echo ""
echo "Starting researcher service..."
echo "Docs:       http://127.0.0.1:6082/docs"
echo "SSE:        http://127.0.0.1:6082/research/stream"
echo "Health:     http://127.0.0.1:6082/health"
echo "Chroma DB:  /tmp/researcher_chroma.db"
echo ""

cd "${SCRIPT_DIR}"
exec python3 -m uvicorn app:app --host 127.0.0.1 --port 6082 --reload
