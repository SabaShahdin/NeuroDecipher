# NeuroDecipher backend — Flask API + Celery worker share this one image.
# docker-compose (and the ECS task definitions in DEPLOY.md) run it as two
# services from the same image, just with a different command:
#   api:    gunicorn (this file's default CMD)
#   worker: celery -A celery_worker:celery_app worker --loglevel=INFO
FROM python:3.11-slim AS base

WORKDIR /app

# System deps needed by torch/mne/scipy/psycopg2 wheels at build + run time.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --default-timeout=1000 \
       torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir --default-timeout=1000 -r requirements.txt

COPY . .

# Runtime data dirs. These are also declared as volumes in docker-compose so
# uploaded files / generated reports survive container restarts and are
# shared between the api and worker services.
RUN mkdir -p /app/neurodecipher_uploaded_files /app/generated_reports \
             /app/models/detection /app/models/classification

# Run as a non-root user in production containers.
RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:5000/db/health || exit 1

# Default: API server. The worker service overrides this CMD in docker-compose.yml.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "120", "run:app"]
