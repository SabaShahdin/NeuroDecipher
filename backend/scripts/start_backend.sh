#!/usr/bin/env bash
# Local (non-Docker) dev convenience: run the Flask API from the backend/ folder.
set -euo pipefail
cd "$(dirname "$0")/.."
python run.py
