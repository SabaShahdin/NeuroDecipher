# Auto-split from app_celery_postgres_step4_login.py
# Section: ROUTES — REDIS DEBUG / STREAM INSPECTION
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES — REDIS DEBUG / STREAM INSPECTION
# ══════════════════════════════════════════════════════════════════════════════
redis_bp = Blueprint("redis_debug", __name__)


@redis_bp.route("/redis/health", methods=["GET"])
def redis_health():
    if not ENABLE_REDIS_STREAMS:
        return jsonify({
            "ok": True,
            "enabled": False,
            "message": "Redis Streams are disabled by environment override.",
            "redisUrl": REDIS_URL,
        })
    if redis is None:
        return jsonify({
            "ok": False,
            "enabled": True,
            "error": "Python package 'redis' is not installed. Run: pip install redis",
        }), 500
    try:
        r = get_redis_client()
        pong = r.ping()
        return jsonify({
            "ok": bool(pong),
            "enabled": True,
            "redisUrl": REDIS_URL,
            "streamTtlSeconds": REDIS_STREAM_TTL_SECONDS,
        })
    except Exception as exc:
        return jsonify({
            "ok": False,
            "enabled": True,
            "redisUrl": REDIS_URL,
            "error": str(exc),
        }), 500


@redis_bp.route("/redis/jobs/<job_id>/events", methods=["GET"])
def redis_job_events(job_id):
    if not redis_enabled():
        return jsonify({"ok": False, "error": "Redis Streams disabled or redis package unavailable"}), 400
    count = int(request.args.get("count", "1000"))
    events = redis_read_existing_events(job_id, count=count)
    return jsonify({"ok": True, "jobId": job_id, "count": len(events), "events": events})

