# Auto-split from app_celery_postgres_step4_login.py
# Section: DATABASE — POSTGRESQL PERSISTENCE LAYER
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  DATABASE — POSTGRESQL PERSISTENCE LAYER
# ══════════════════════════════════════════════════════════════════════════════
# PostgreSQL-only persistence for jobs, predictions, audit logs and recording metadata.


db_lock = _NoopLock()

# Interpretability response cache uses Redis TTL instead of a Python dict so large
# payloads do not leak process memory across long EEG sessions.
interpretability_cache_lock = _NoopLock()
INTERPRETABILITY_CACHE_TTL_SECONDS = int(os.environ.get("INTERPRETABILITY_CACHE_TTL_SECONDS", "600"))
INTERPRETABILITY_CACHE_MAX_BYTES = int(os.environ.get("INTERPRETABILITY_CACHE_MAX_BYTES", "2000000"))


def _interpretability_cache_signature(job: dict, rows: list[dict]) -> str:
    """Return a small signature that changes when predictions/job status change."""
    latest_prediction_ts = ""
    for row in rows or []:
        latest_prediction_ts = max(latest_prediction_ts, str(row.get("created_at") or ""))
    return "|".join([
        str(job.get("updated_at") or ""),
        str(job.get("status") or ""),
        str(len(rows or [])),
        latest_prediction_ts,
    ])


def _interpretability_cache_key(job_id: str) -> str:
    return f"nd:interpretability:{job_id}"


def _interpretability_cache_get(job_id: str, signature: str):
    r = get_redis_client()
    if r is None:
        return None
    try:
        raw = r.get(_interpretability_cache_key(job_id))
        if not raw:
            return None
        item = json.loads(raw)
        if item.get("signature") != signature:
            return None
        payload = item.get("payload")
        if payload:
            payload = copy.deepcopy(payload)
            payload["cache"] = {"hit": True, "signature": signature, "store": "redis"}
        return payload
    except Exception as exc:
        log.warning(f"[cache] Could not read interpretability cache for {job_id}: {exc}")
        return None


def _interpretability_cache_set(job_id: str, signature: str, payload: dict) -> None:
    r = get_redis_client()
    if r is None or not payload:
        return
    try:
        item = {"signature": signature, "saved_at": time.time(), "payload": payload}
        raw = json.dumps(item)
        if len(raw.encode("utf-8")) > INTERPRETABILITY_CACHE_MAX_BYTES:
            log.info(f"[cache] Interpretability payload for {job_id} skipped; exceeds cache byte limit")
            return
        r.setex(_interpretability_cache_key(job_id), INTERPRETABILITY_CACHE_TTL_SECONDS, raw)
    except Exception as exc:
        log.warning(f"[cache] Could not write interpretability cache for {job_id}: {exc}")


def _db_backend_name() -> str:
    return "postgresql"


def _pg_dsn() -> str:
    return DATABASE_URL


_pg_pool = None


class _PooledPgConnection:
    """Context manager that returns pooled PostgreSQL connections.

    The old code opened a new TCP connection for almost every prediction event,
    which made Redis/SSE delivery feel slow because persistence happened inside
    the hot streaming path. Pooling keeps report/dashboard persistence enabled
    while removing most connection setup overhead.

    Pooled connections can go stale between requests (Postgres idle-connection
    timeout, DB restart, network blip, etc.). When that happens psycopg2 raises
    OperationalError/InterfaceError on the *next* use. This class makes sure:
      1. A failed rollback on a dead connection never masks the real error that
         triggered the `with` block's exception (it used to raise
         InterfaceError from __exit__, which replaced the original traceback).
      2. A dead/broken connection is discarded (closed) instead of being handed
         back into the pool, which previously meant the *next* request to reuse
         that slot would immediately fail the same way.
      3. A connection is pinged with a cheap SELECT 1 on checkout, so a
         connection that already died while sitting idle in the pool never
         even reaches route code — it's swapped for a fresh one first.
    """
    def __init__(self, pool):
        self.pool = pool
        self.conn = None

    def __enter__(self):
        self.conn = self.pool.getconn()
        if self._is_broken(self.conn) or not self._ping(self.conn):
            log.warning("[db] Pooled connection was stale/closed; discarding and opening a fresh one")
            try:
                self.pool.putconn(self.conn, close=True)
            except Exception:
                pass
            self.conn = self.pool.getconn()
            # If the pool itself only had the one dead connection, this second
            # getconn() may return a brand-new connection (the pool opens one
            # on demand once a slot is freed by close=True above).
        return self.conn

    @staticmethod
    def _ping(conn) -> bool:
        """Cheap liveness check: Postgres can close an idle connection server-side
        (idle timeout, restart, network blip) without the client library noticing
        until the next query is attempted. A tiny SELECT 1 surfaces that here,
        before handing the connection to route code that expects it to work."""
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
            cur.close()
            return True
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            return False

    @staticmethod
    def _is_broken(conn) -> bool:
        try:
            return bool(conn.closed)
        except Exception:
            return True

    def __exit__(self, exc_type, exc, tb):
        conn = self.conn
        if conn is None:
            return False

        broken = self._is_broken(conn)
        if not broken and exc_type is not None:
            try:
                conn.rollback()
            except Exception as rollback_exc:
                # The connection died server-side (e.g. "server closed the
                # connection unexpectedly"). Log it, but let the ORIGINAL
                # exception propagate instead of this one, and mark the
                # connection broken so it gets discarded below.
                log.warning(f"[db] Rollback failed on pooled connection, discarding it: {rollback_exc}")
                broken = True

        try:
            if broken:
                self.pool.putconn(conn, close=True)
            else:
                self.pool.putconn(conn)
        except Exception as putconn_exc:
            log.warning(f"[db] Failed to return connection to pool: {putconn_exc}")

        # Returning False re-raises exc_type/exc (the ORIGINAL exception),
        # never anything raised inside this method.
        return False


def _get_pg_pool():
    global _pg_pool
    if _pg_pool is None:
        if psycopg2 is None:
            raise RuntimeError("PostgreSQL backend requires psycopg2-binary. Install it with: pip install psycopg2-binary")
        from psycopg2.pool import SimpleConnectionPool
        _pg_pool = SimpleConnectionPool(DB_POOL_MINCONN, DB_POOL_MAXCONN, _pg_dsn())
        log.info(f"[db] PostgreSQL connection pool ready min={DB_POOL_MINCONN} max={DB_POOL_MAXCONN}")
    return _pg_pool


def _db_connect():
    """Connect to PostgreSQL only, using a pool by default for low-latency streaming."""
    if psycopg2 is None:
        raise RuntimeError("PostgreSQL backend requires psycopg2-binary. Install it with: pip install psycopg2-binary")
    if ENABLE_DB_POOL:
        return _PooledPgConnection(_get_pg_pool())
    return psycopg2.connect(_pg_dsn())


def _db_cursor(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def _db_sql(sql: str) -> str:
    """Translate qmark placeholders to psycopg2 placeholders.

    Only question marks outside quoted SQL strings are converted, so SQL text
    literals containing ? are not corrupted. This keeps the existing single-file
    query style while making PostgreSQL parameter binding safer.
    """
    out = []
    in_single = False
    in_double = False
    i = 0
    while i < len(sql):
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < len(sql) else ""
        if ch == "'" and not in_double:
            out.append(ch)
            if in_single and nxt == "'":
                out.append(nxt)
                i += 2
                continue
            in_single = not in_single
        elif ch == '"' and not in_single:
            out.append(ch)
            in_double = not in_double
        elif ch == "?" and not in_single and not in_double:
            out.append("%s")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


def _db_execute(conn, sql: str, params: tuple = ()): 
    cur = _db_cursor(conn)
    cur.execute(_db_sql(sql), params)
    return cur


def _db_fetchone_dict(cur):
    row = cur.fetchone()
    return dict(row) if row is not None else None


def _db_fetchall_dict(cur):
    return [dict(r) for r in cur.fetchall()]


def _drop_orphan_pg_type_if_needed(conn, type_name: str) -> None:
    """Repair interrupted/concurrent PostgreSQL table creation.

    PostgreSQL automatically creates a composite type for each table. If a
    previous CREATE TABLE was interrupted, the type can remain without its
    table. A later CREATE TABLE IF NOT EXISTS jobs then fails with:
    duplicate key value violates unique constraint pg_type_typname_nsp_index.
    This function only drops orphan types that are not attached to a real
    pg_class relation. It does not drop existing tables.
    """
    safe_names = {
        "users", "jobs", "predictions", "audit_logs", "engine_controls",
        "recording_metadata"
    }
    if type_name not in safe_names:
        raise ValueError(f"Unsafe PostgreSQL type repair name: {type_name}")
    cur = conn.cursor()
    cur.execute(
        """
        SELECT t.oid
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        LEFT JOIN pg_class c ON c.reltype = t.oid
        WHERE t.typname = %s
          AND n.nspname = current_schema()
          AND c.oid IS NULL
        """,
        (type_name,),
    )
    row = cur.fetchone()
    if row:
        log.warning(f"[db] Dropping orphan PostgreSQL composite type: {type_name}")
        cur.execute(f'DROP TYPE IF EXISTS "{type_name}" CASCADE')


def init_db() -> None:
    """Create PostgreSQL tables used by NeuroDecipher.

    Uses a PostgreSQL transaction advisory lock so Flask and Celery cannot run
    schema creation at the same time. It also repairs orphan PostgreSQL table
    types left behind by interrupted CREATE TABLE operations.
    """
    with db_lock:
        with _db_connect() as conn:
            cur = conn.cursor()
            cur.execute("SELECT pg_advisory_xact_lock(hashtext('neurodecipher:init_db'))")
            for _type_name in ("users", "jobs", "predictions", "audit_logs", "engine_controls", "recording_metadata"):
                _drop_orphan_pg_type_if_needed(conn, _type_name)
            cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                name TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_login_at TEXT
            );
            """)
            cur.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                file_name TEXT NOT NULL,
                stored_file_name TEXT,
                file_path TEXT,
                file_size_bytes BIGINT,
                status TEXT NOT NULL DEFAULT 'queued',
                duration DOUBLE PRECISION,
                sampling_rate DOUBLE PRECISION,
                channels_json TEXT,
                total_segments INTEGER DEFAULT 0,
                n_seizure_ai INTEGER DEFAULT 0,
                n_bckg_ai INTEGER DEFAULT 0,
                n_seizure_rule INTEGER DEFAULT 0,
                n_bckg_rule INTEGER DEFAULT 0,
                n_seizure_hybrid INTEGER DEFAULT 0,
                n_bckg_hybrid INTEGER DEFAULT 0,
                error_message TEXT,
                created_at TEXT,
                started_at TEXT,
                finished_at TEXT,
                updated_at TEXT
            );
            """)
            # Repair path for databases created before the user_id column existed.
            cur.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);")
            cur.execute("""
            CREATE TABLE IF NOT EXISTS predictions (
                id BIGSERIAL PRIMARY KEY,
                job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                segment_index INTEGER NOT NULL,
                source TEXT NOT NULL,
                start_time DOUBLE PRECISION,
                end_time DOUBLE PRECISION,
                label TEXT,
                confidence DOUBLE PRECISION,
                probability DOUBLE PRECISION,
                hybrid_label TEXT,
                hybrid_confidence DOUBLE PRECISION,
                subtype TEXT,
                subtype_full TEXT,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(job_id, segment_index, source)
            );
            """)
            cur.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id BIGSERIAL PRIMARY KEY,
                job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
                actor TEXT,
                action TEXT NOT NULL,
                payload_json TEXT,
                created_at TEXT NOT NULL
            );
            """)
            cur.execute("""
            CREATE TABLE IF NOT EXISTS engine_controls (
                engine_key TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                status_note TEXT,
                updated_at TEXT NOT NULL
            );
            """)
            cur.execute("""
            CREATE TABLE IF NOT EXISTS recording_metadata (
                job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
                recording_label TEXT,
                recording_type TEXT,
                acquisition_date TEXT,
                clinician TEXT,
                notes TEXT,
                status TEXT NOT NULL DEFAULT 'queued',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_predictions_job_segment ON predictions(job_id, segment_index);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_job ON audit_logs(job_id);")
            conn.commit()

    # Database-backed dashboard controls. These are seeded once, then read by
    # /dashboard/overview so the frontend never hard-codes engine activity.
    with db_lock:
        with _db_connect() as conn:
            for engine_key, display_name in (
                ("aiModel", "AI Model"),
                ("ruleEngine", "Rule Engine"),
                ("hybridEngine", "Hybrid Engine"),
            ):
                _db_execute(
                    conn,
                    """
                    INSERT INTO engine_controls (engine_key, display_name, is_active, status_note, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT (engine_key) DO NOTHING
                    """,
                    (engine_key, display_name, True, "Seeded active by default", now_iso()),
                )
            conn.commit()


def db_insert_job(job_id: str, job: dict, sig: dict | None = None, user_id: str | None = None) -> None:
    sig = sig or {}
    with db_lock:
        with _db_connect() as conn:
            _db_execute(
                conn,
                """
                INSERT INTO jobs (
                    id, user_id, file_name, stored_file_name, file_path, file_size_bytes,
                    status, duration, sampling_rate, channels_json, total_segments,
                    created_at, started_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    file_name=excluded.file_name,
                    stored_file_name=excluded.stored_file_name,
                    file_path=excluded.file_path,
                    file_size_bytes=excluded.file_size_bytes,
                    status=excluded.status,
                    duration=excluded.duration,
                    sampling_rate=excluded.sampling_rate,
                    channels_json=excluded.channels_json,
                    total_segments=excluded.total_segments,
                    updated_at=excluded.updated_at
                """,
                (
                    job_id,
                    user_id,
                    job.get("file_name"),
                    job.get("stored_file_name"),
                    job.get("file_path"),
                    job.get("file_size_bytes"),
                    job.get("status", "queued"),
                    job.get("duration"),
                    sig.get("samplingRate"),
                    json.dumps(sig.get("channels", [])),
                    job.get("total_segments", 0),
                    job.get("created_at") or now_iso(),
                    job.get("started_at"),
                    now_iso(),
                ),
            )
            _db_execute(conn,
                "INSERT INTO audit_logs (job_id, actor, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
                (job_id, "system", "job_created", json.dumps({"file": job.get("file_name")}), now_iso()),
            )
            conn.commit()



def db_insert_audit(job_id: str | None, actor: str, action: str, payload: dict | None = None) -> None:
    """Persist an audit event. Kept small and safe so audit logging never breaks the app."""
    try:
        with db_lock:
            with _db_connect() as conn:
                _db_execute(
                    conn,
                    "INSERT INTO audit_logs (job_id, actor, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
                    (job_id, actor or "system", action, json.dumps(payload or {}), now_iso()),
                )
                conn.commit()
    except Exception as exc:
        log.warning(f"[db:{_db_backend_name()}] Could not insert audit log for job {job_id}: {exc}")




def db_mark_stream_error(job_id: str, message: str) -> None:
    """Make Redis/SSE delivery failure visible through PostgreSQL job status."""
    now = now_iso()
    try:
        with _db_connect() as conn:
            _db_execute(
                conn,
                "UPDATE jobs SET status=?, error_message=?, finished_at=?, updated_at=? WHERE id=?",
                ("stream_error", message, now, now, job_id),
            )
            _db_execute(
                conn,
                "UPDATE recording_metadata SET status=?, updated_at=? WHERE job_id=?",
                ("stream_error", now, job_id),
            )
            _db_execute(
                conn,
                "INSERT INTO audit_logs (job_id, actor, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
                (job_id, "system", "stream_error", json.dumps({"message": message}), now),
            )
            conn.commit()
    except Exception as exc:
        log.warning(f"[db:{_db_backend_name()}] Could not mark stream error for job {job_id}: {exc}")


def db_get_job_status_for_stream(job_id: str) -> dict | None:
    try:
        with _db_connect() as conn:
            return _db_fetchone_dict(_db_execute(
                conn,
                "SELECT id, status, error_message, updated_at FROM jobs WHERE id=?",
                (job_id,),
            ))
    except Exception as exc:
        log.warning(f"[db:{_db_backend_name()}] Could not read job status for stream {job_id}: {exc}")
        return None

def db_persist_event(job_id: str, msg: dict) -> None:
    """
    Persist the same AI/Rule/Hybrid events that are streamed to the frontend.
    This keeps the live SSE behaviour unchanged while making dashboard/recordings
    database-driven.
    """
    try:
        typ = msg.get("type")
        now = now_iso()
        with db_lock:
            with _db_connect() as conn:
                if typ == "meta":
                    _db_execute(
                        conn,
                        "UPDATE jobs SET status=?, total_segments=?, updated_at=? WHERE id=?",
                        ("running", msg.get("total") or 0, now, job_id),
                    )
                    _db_execute(
                        conn,
                        "UPDATE recording_metadata SET status=?, updated_at=? WHERE job_id=?",
                        ("running", now, job_id),
                    )

                elif typ == "prediction":
                    subtype = msg.get("ai_subtype") or msg.get("rule_subtype")
                    subtype_full = msg.get("ai_subtype_full") or msg.get("rule_subtype_full")
                    _db_execute(
                        conn,
                        """
                        INSERT INTO predictions (
                            job_id, segment_index, source, start_time, end_time,
                            label, confidence, probability, hybrid_label,
                            hybrid_confidence, subtype, subtype_full,
                            payload_json, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (job_id, segment_index, source) DO UPDATE SET
                            start_time=excluded.start_time,
                            end_time=excluded.end_time,
                            label=excluded.label,
                            confidence=excluded.confidence,
                            probability=excluded.probability,
                            hybrid_label=excluded.hybrid_label,
                            hybrid_confidence=excluded.hybrid_confidence,
                            subtype=excluded.subtype,
                            subtype_full=excluded.subtype_full,
                            payload_json=excluded.payload_json,
                            created_at=excluded.created_at
                        """,
                        (
                            job_id,
                            msg.get("index"),
                            msg.get("source"),
                            msg.get("start"),
                            msg.get("end"),
                            msg.get("label"),
                            msg.get("confidence"),
                            msg.get("prob"),
                            msg.get("hybrid_label"),
                            msg.get("hybrid_confidence"),
                            subtype,
                            subtype_full,
                            json.dumps(msg),
                            now,
                        ),
                    )
                    _db_execute(conn, "UPDATE jobs SET updated_at=? WHERE id=?", (now, job_id))

                elif typ == "done":
                    _db_execute(
                        conn,
                        """
                        UPDATE jobs SET status=?, total_segments=?, n_seizure_ai=?, n_bckg_ai=?,
                            n_seizure_rule=?, n_bckg_rule=?, n_seizure_hybrid=?, n_bckg_hybrid=?,
                            finished_at=?, updated_at=? WHERE id=?
                        """,
                        (
                            "ready",
                            msg.get("total") or 0,
                            msg.get("n_seizure_ai") or 0,
                            msg.get("n_bckg_ai") or 0,
                            msg.get("n_seizure_rule") or 0,
                            msg.get("n_bckg_rule") or 0,
                            msg.get("n_seizure_hybrid") or 0,
                            msg.get("n_bckg_hybrid") or 0,
                            now,
                            now,
                            job_id,
                        ),
                    )
                    _db_execute(
                        conn,
                        "UPDATE recording_metadata SET status=?, updated_at=? WHERE job_id=?",
                        ("ready", now, job_id),
                    )
                    _db_execute(
                        conn,
                        "INSERT INTO audit_logs (job_id, actor, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
                        (job_id, "system", "job_completed", json.dumps(msg), now),
                    )

                elif typ == "error":
                    _db_execute(
                        conn,
                        "UPDATE jobs SET status=?, error_message=?, finished_at=?, updated_at=? WHERE id=?",
                        ("error", msg.get("message"), now, now, job_id),
                    )
                    _db_execute(
                        conn,
                        "UPDATE recording_metadata SET status=?, updated_at=? WHERE job_id=?",
                        ("error", now, job_id),
                    )
                    _db_execute(
                        conn,
                        "INSERT INTO audit_logs (job_id, actor, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
                        (job_id, "system", "job_failed", json.dumps(msg), now),
                    )
                conn.commit()
    except Exception as exc:
        # Prediction streaming must not die because persistence/audit failed.
        log.warning(f"[db:{_db_backend_name()}] Could not persist event for job {job_id}: {exc}")



def db_persist_prediction_events_bulk(job_id: str, events: list[dict]) -> None:
    """Bulk persist prediction events after live Redis streaming.

    This removes the main live-stream latency bottleneck: one PostgreSQL write per
    AI event and one PostgreSQL write per rule event. Reports/history still get
    the same prediction rows, but insertion happens in batched DB round trips.
    """
    if not events:
        return
    if psycopg2 is None:
        raise RuntimeError("psycopg2 is required for PostgreSQL bulk persistence")

    rows = []
    now = now_iso()
    for msg in events:
        if not isinstance(msg, dict) or msg.get("type") != "prediction":
            continue
        subtype = msg.get("ai_subtype") or msg.get("rule_subtype")
        subtype_full = msg.get("ai_subtype_full") or msg.get("rule_subtype_full")
        rows.append((
            job_id,
            msg.get("index"),
            msg.get("source"),
            msg.get("start"),
            msg.get("end"),
            msg.get("label"),
            msg.get("confidence"),
            msg.get("prob"),
            msg.get("hybrid_label"),
            msg.get("hybrid_confidence"),
            subtype,
            subtype_full,
            json.dumps(msg),
            now,
        ))

    if not rows:
        return

    sql = """
        INSERT INTO predictions (
            job_id, segment_index, source, start_time, end_time,
            label, confidence, probability, hybrid_label,
            hybrid_confidence, subtype, subtype_full,
            payload_json, created_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (job_id, segment_index, source) DO UPDATE SET
            start_time=excluded.start_time,
            end_time=excluded.end_time,
            label=excluded.label,
            confidence=excluded.confidence,
            probability=excluded.probability,
            hybrid_label=excluded.hybrid_label,
            hybrid_confidence=excluded.hybrid_confidence,
            subtype=excluded.subtype,
            subtype_full=excluded.subtype_full,
            payload_json=excluded.payload_json,
            created_at=excluded.created_at
    """
    started = time.time()
    with _db_connect() as conn:
        cur = conn.cursor()
        psycopg2.extras.execute_batch(cur, sql, rows, page_size=BULK_PERSIST_PAGE_SIZE)
        _db_execute(conn, "UPDATE jobs SET updated_at=? WHERE id=?", (now_iso(), job_id))
        conn.commit()
    log.info(f"[db] bulk persisted {len(rows)} prediction events for {job_id} in {time.time() - started:.2f}s")


def db_upsert_recording_metadata(job_id: str, metadata: dict | None = None) -> None:
    """Create/update lightweight clinical metadata for a recording/job."""
    metadata = metadata or {}
    now = now_iso()
    with db_lock:
        with _db_connect() as conn:
            _db_execute(
                conn,
                """
                INSERT INTO recording_metadata (
                    job_id, recording_label, recording_type,
                    acquisition_date, clinician, notes, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (job_id) DO UPDATE SET
                    recording_label=excluded.recording_label,
                    recording_type=excluded.recording_type,
                    acquisition_date=excluded.acquisition_date,
                    clinician=excluded.clinician,
                    notes=excluded.notes,
                    status=excluded.status,
                    updated_at=excluded.updated_at
                """,
                (
                    job_id,
                    metadata.get("recording_label") or metadata.get("recordingLabel") or None,
                    metadata.get("recording_type") or metadata.get("recordingType") or "EEG",
                    metadata.get("acquisition_date") or metadata.get("acquisitionDate") or None,
                    metadata.get("clinician") or None,
                    metadata.get("notes") or None,
                    metadata.get("status") or "queued",
                    now,
                    now,
                ),
            )
            conn.commit()


# ══════════════════════════════════════════════════════════════════════════════
#  DATABASE — USER ACCOUNTS (sign up / sign in)
# ══════════════════════════════════════════════════════════════════════════════
# Plain user accounts only. There is no admin role or admin table anywhere in
# this backend — every account created here is a normal user.

def db_create_user(email: str, password_hash: str, name: str | None = None) -> dict:
    """Insert a new user row. Raises on duplicate email (caller should catch)."""
    user_id = str(uuid.uuid4())
    now = now_iso()
    with db_lock:
        with _db_connect() as conn:
            _db_execute(
                conn,
                """
                INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user_id, email, password_hash, name, now, now),
            )
            conn.commit()
    return {"id": user_id, "email": email, "name": name, "created_at": now}


def db_get_user_by_email(email: str) -> dict | None:
    with _db_connect() as conn:
        return _db_fetchone_dict(_db_execute(
            conn, "SELECT * FROM users WHERE email=?", (email,)
        ))


def db_get_user_by_id(user_id: str) -> dict | None:
    with _db_connect() as conn:
        return _db_fetchone_dict(_db_execute(
            conn, "SELECT * FROM users WHERE id=?", (user_id,)
        ))


def db_touch_user_login(user_id: str) -> None:
    now = now_iso()
    with db_lock:
        with _db_connect() as conn:
            _db_execute(conn, "UPDATE users SET last_login_at=?, updated_at=? WHERE id=?", (now, now, user_id))
            conn.commit()


def db_public_user(user: dict) -> dict:
    """Strip the password hash before sending a user record to the frontend."""
    if not user:
        return {}
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "name": user.get("name"),
        "createdAt": user.get("created_at"),
        "lastLoginAt": user.get("last_login_at"),
    }


def db_row_to_dict(row):
    return dict(row) if row is not None else None


def _job_is_active(job: dict) -> bool:
    """A job is active while its worker is alive and not finished."""
    return bool(job and job.get("worker_alive") and not job.get("done"))


def _job_public_status(job_id: str, job: dict) -> dict:
    """Safe status payload for frontend/debugging without exposing huge arrays."""
    return {
        "jobId": job_id,
        "fileName": job.get("file_name"),
        "done": bool(job.get("done")),
        "error": job.get("error"),
        "workerAlive": bool(job.get("worker_alive")),
        "createdAt": job.get("created_at"),
        "startedAt": job.get("started_at"),
        "finishedAt": job.get("finished_at"),
        "duration": job.get("duration", 0.0),
        "totalSegments": job.get("total_segments", 0),
        "eventsStored": len(job.get("raw_events", [])),
        "nSeizureAI": job.get("n_seizure_ai", 0),
        "nSeizureRule": job.get("n_seizure_rule", 0),
        "nSeizureHybrid": job.get("n_seizure_hybrid", 0),
    }


def cleanup_jobs(force: bool = False) -> int:
    """No in-process cleanup is needed. Redis keys have TTL and PostgreSQL is persistent."""
    return 0


def _run_model_guarded(job_id: str, filepath: str) -> None:
    """Deprecated: local threaded execution has been removed. Use Celery worker."""
    raise RuntimeError("Local threaded execution is disabled. Start Celery and submit through /upload.")


