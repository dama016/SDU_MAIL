#!/bin/zsh

set -e

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"

if [[ ! -x ".venv/bin/python" ]]; then
  echo "Missing project virtual environment at .venv/bin/python"
  echo "Create it first, then install dependencies with: pip install -r requirements.txt"
  exit 1
fi

exec ./.venv/bin/python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
