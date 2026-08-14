# Auto-split from app_celery_postgres_step4_login.py
# Section: UTILS — JOB STORE
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  UTILS — JOB STORE
# ══════════════════════════════════════════════════════════════════════════════

class RedisJobStore:
    """Redis-backed job state adapter used only for small runtime metadata.

    This replaces the old module-level Python dictionary job store. It stores
    small JSON-safe job state in Redis so Flask restarts or multiple processes do
    not lose active job status. Prediction/event history is not stored here;
    events are persisted in PostgreSQL and streamed through Redis Streams.
    """
    prefix = "nd:jobstate:"

    def _client(self):
        return get_redis_client()

    def _key(self, job_id: str) -> str:
        return f"{self.prefix}{job_id}"

    def __setitem__(self, job_id: str, value: dict) -> None:
        self.set(job_id, value)

    def set(self, job_id: str, value: dict) -> None:
        r = self._client()
        if r is None:
            return
        safe = self._json_safe(value or {})
        r.setex(self._key(job_id), JOB_TTL_SECONDS, json.dumps(safe))

    def update(self, job_id: str, updates: dict) -> dict:
        current = self.get(job_id) or {}
        current.update(updates or {})
        self.set(job_id, current)
        return current

    def get(self, job_id: str, default=None):
        r = self._client()
        if r is None:
            return default
        raw = r.get(self._key(job_id))
        if not raw:
            return default
        try:
            return json.loads(raw)
        except Exception:
            return default

    def __getitem__(self, job_id: str):
        value = self.get(job_id)
        if value is None:
            raise KeyError(job_id)
        return value

    def __contains__(self, job_id: str) -> bool:
        r = self._client()
        return bool(r and r.exists(self._key(job_id)))

    def pop(self, job_id: str, default=None):
        current = self.get(job_id, default)
        r = self._client()
        if r is not None:
            r.delete(self._key(job_id))
        return current

    def items(self):
        r = self._client()
        if r is None:
            return []
        out = []
        for key in r.scan_iter(f"{self.prefix}*"):
            jid = str(key).split(self.prefix, 1)[-1]
            val = self.get(jid)
            if val is not None:
                out.append((jid, val))
        return out

    def _json_safe(self, value):
        if isinstance(value, dict):
            return {k: self._json_safe(v) for k, v in value.items() if k not in ("queue", "rule_queue")}
        if isinstance(value, (list, tuple)):
            return [self._json_safe(v) for v in value]
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        return str(value)

jobs = RedisJobStore()
jobs_lock = _NoopLock()
# Local thread fallback has been removed. Celery + Redis Streams is the only worker path.


