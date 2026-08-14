#!/usr/bin/env bash
# Local (non-Docker) dev convenience: run the Celery worker from the backend/ folder.
set -euo pipefail
cd "$(dirname "$0")/.."
python -m celery -A celery_worker:celery_app worker --loglevel=INFO
