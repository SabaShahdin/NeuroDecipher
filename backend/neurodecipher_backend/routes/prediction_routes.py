# Auto-split from app_celery_postgres_step4_login.py
# Section: ROUTES — PREDICTIONS  (unified SSE stream)
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES — PREDICTIONS  (unified SSE stream)
# ══════════════════════════════════════════════════════════════════════════════
predictions_bp = Blueprint("predictions", __name__)


@predictions_bp.route("/predictions/<job_id>/snapshot", methods=["GET"])
def predictions_snapshot(job_id):
    """Return all currently known prediction events as normal JSON.

    This endpoint is intentionally lightweight: it does not reload the EDF signal
    and it does not build interpretability charts.  The frontend calls it when a
    large EDF job finishes so any SSE events missed during browser throttling or
    reconnects are filled back into the timeline from PostgreSQL/Redis.
    """
    try:
        merged = {}

        # 1) Persisted predictions.  For the normal production path these are
        # bulk-inserted right before the final SSE done message.
        try:
            with db_lock:
                with _db_connect() as conn:
                    rows = _db_fetchall_dict(_db_execute(conn, """
                        SELECT payload_json, source, segment_index
                        FROM predictions
                        WHERE job_id=?
                        ORDER BY segment_index ASC, source ASC
                    """, (job_id,)))
            for row in rows:
                try:
                    ev = json.loads(row.get("payload_json") or "{}")
                except Exception:
                    continue
                if ev.get("type") != "prediction":
                    continue
                source = ev.get("source") or row.get("source") or "ai"
                idx = int(ev.get("index", row.get("segment_index") or 0))
                merged[(source, idx)] = ev
        except Exception as exc:
            log.warning(f"[snapshot] DB prediction read failed for job={job_id}: {exc}")

        # 2) Redis stream fallback/current live data.  This helps if the snapshot
        # is requested while the job is still running or before DB bulk flush is visible.
        try:
            for item in redis_read_existing_events(job_id, start_id="0-0", count=REDIS_STREAM_MAXLEN):
                ev = item.get("event") or {}
                if ev.get("type") != "prediction":
                    continue
                source = ev.get("source") or "ai"
                idx = int(ev.get("index", 0))
                merged[(source, idx)] = ev
        except Exception as exc:
            log.warning(f"[snapshot] Redis prediction read failed for job={job_id}: {exc}")

        ai_events = []
        rule_events = []
        for (source, _idx), ev in sorted(merged.items(), key=lambda kv: (int(kv[0][1]), str(kv[0][0]))):
            if source == "rule":
                rule_events.append(ev)
            else:
                ai_events.append(ev)

        total = max(len(ai_events), len(rule_events))
        status = None
        try:
            status = db_get_job_status_for_stream(job_id)
            total = int(status.get("total_segments") or total) if status else total
        except Exception:
            status = None

        response = jsonify({
            "ok": True,
            "jobId": job_id,
            "status": status.get("status") if status else None,
            "total": total,
            "events": ai_events,
            "ruleEvents": rule_events,
        })
        response.headers["Cache-Control"] = "no-store"
        return response
    except Exception as exc:
        log.exception("[snapshot] failed")
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500

@predictions_bp.route("/predictions/<job_id>", methods=["GET"])
def predictions(job_id):
    """
    Single unified SSE stream.

    Same frontend contract as before. When Redis Streams are enabled, this
    endpoint reads from Redis instead of depending on any Python Redis Stream.

    Browser EventSource calls this endpoint exactly the same way:
      GET /predictions/<jobId>
    """

    def generate_from_redis():
        r = get_redis_client()
        if r is None:
            payload = {"type": "error", "message": "Redis is enabled but unavailable", "code": "REDIS_UNAVAILABLE", "requestId": _request_id()}
            yield "data: " + json.dumps(payload) + "\n\n"
            return

        key = redis_stream_key(job_id)
        last_id = request.headers.get("Last-Event-ID") or request.args.get("lastEventId") or "0-0"

        # If the stream does not exist yet, wait briefly because upload and
        # worker startup can race the browser's EventSource connection.
        for _ in range(50):
            try:
                if r.exists(key):
                    break
            except Exception:
                pass
            time.sleep(0.1)

        while True:
            try:
                items = r.xread({key: last_id}, block=REDIS_SSE_BLOCK_MS, count=100)
                if not items:
                    status = db_get_job_status_for_stream(job_id)
                    if status and status.get("status") in ("error", "stream_error"):
                        payload = {
                            "type": "error",
                            "message": status.get("error_message") or f"Job ended with status {status.get('status')}",
                            "code": "STREAM_ERROR" if status.get("status") == "stream_error" else "JOB_ERROR",
                            "status": status.get("status"),
                            "requestId": _request_id(),
                        }
                        yield "data: " + json.dumps(payload) + "\n\n"
                        return
                    yield ": ping\n\n"
                    continue

                for _stream, messages in items:
                    for msg_id, fields in messages:
                        last_id = msg_id
                        raw = fields.get("data", "{}")
                        yield f"id: {msg_id}\n"
                        yield f"data: {raw}\n\n"

                        try:
                            msg = json.loads(raw)
                            if msg.get("type") in ("done", "error"):
                                return
                        except Exception:
                            pass
            except Exception as exc:
                payload = {"type": "error", "message": f"Redis stream error: {exc}", "code": "REDIS_STREAM_READ_FAILED", "requestId": _request_id()}
                yield "data: " + json.dumps(payload) + "\n\n"
                return
    generator = generate_from_redis

    return Response(
        stream_with_context(generator()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",
            "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
            "Connection":                  "keep-alive",
        },
    )


