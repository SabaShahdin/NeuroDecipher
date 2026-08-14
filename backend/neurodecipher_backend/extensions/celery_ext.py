# Auto-split from app_celery_postgres_step4_login.py
# Section: CELERY — BACKGROUND INFERENCE WORKER
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  CELERY — BACKGROUND INFERENCE WORKER
# ══════════════════════════════════════════════════════════════════════════════
if Celery is not None:
    celery_app = Celery(
        "neurodecipher",
        broker=CELERY_BROKER_URL,
        backend=CELERY_RESULT_BACKEND,
    )
    celery_app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        worker_prefetch_multiplier=1,
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        broker_connection_retry_on_startup=True,
        task_always_eager=CELERY_TASK_ALWAYS_EAGER,
    )
else:
    celery_app = None


class _NoopLock:
    """Compatibility context manager: Redis/PostgreSQL own state; no Python process locks required."""
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc, tb):
        return False


