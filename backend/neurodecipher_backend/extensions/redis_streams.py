# Auto-split from app_celery_postgres_step4_login.py
# Section: REDIS STREAMS — OPTIONAL PRODUCTION SSE LAYER
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  REDIS STREAMS — OPTIONAL PRODUCTION SSE LAYER
# ══════════════════════════════════════════════════════════════════════════════
# Why Redis Streams here?
#   In the previous version, /predictions/<jobId> read only from Redis Streams.
#   Redis Streams are process-independent and make the
#   event stream process-independent and reconnect-friendly, while preserving
#   the exact same frontend SSE endpoint and event payload shape.

_redis_client = None
_redis_lock = _NoopLock()


def redis_enabled() -> bool:
    return bool(ENABLE_REDIS_STREAMS and redis is not None)


def redis_stream_key(job_id: str) -> str:
    return f"nd:job:{job_id}:events"


def get_redis_client():
    """Return a cached Redis client, or None if Redis is disabled/unavailable."""
    global _redis_client
    if not redis_enabled():
        return None
    with _redis_lock:
        if _redis_client is None:
            _redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        return _redis_client


def redis_publish_event(job_id: str, msg: dict) -> bool:
    """Publish an event into Redis Stream. Failure never breaks analysis."""
    r = get_redis_client()
    if r is None:
        return False
    try:
        key = redis_stream_key(job_id)
        r.xadd(key, {"data": json.dumps(msg)}, maxlen=REDIS_STREAM_MAXLEN, approximate=True)
        r.expire(key, REDIS_STREAM_TTL_SECONDS)
        return True
    except Exception as exc:
        log.warning(f"[redis] Could not publish event for job {job_id}: {exc}")
        return False


def redis_stream_exists(job_id: str) -> bool:
    r = get_redis_client()
    if r is None:
        return False
    try:
        return bool(r.exists(redis_stream_key(job_id)))
    except Exception:
        return False


def redis_read_existing_events(job_id: str, start_id: str = "0-0", count: int = 1000):
    """Read already-published events, used for debugging or future replay."""
    r = get_redis_client()
    if r is None:
        return []
    try:
        rows = r.xrange(redis_stream_key(job_id), min=start_id, max="+", count=count)
        out = []
        for msg_id, fields in rows:
            raw = fields.get("data", "{}")
            try:
                out.append({"id": msg_id, "event": json.loads(raw)})
            except Exception:
                out.append({"id": msg_id, "event": {"type": "error", "message": "Bad Redis event payload"}})
        return out
    except Exception as exc:
        log.warning(f"[redis] Could not read stream for job {job_id}: {exc}")
        return []

