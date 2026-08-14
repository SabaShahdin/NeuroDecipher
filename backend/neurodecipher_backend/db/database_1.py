# Auto-split from app_celery_postgres_step4_login.py
# Section: ROUTES — DATABASE DEBUG / PERSISTED HISTORY
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES — DATABASE DEBUG / PERSISTED HISTORY
# ══════════════════════════════════════════════════════════════════════════════
db_bp = Blueprint("database", __name__)


@db_bp.route("/db/health", methods=["GET"])
def db_health():
    try:
        with db_lock:
            with _db_connect() as conn:
                jobs_count = _db_fetchone_dict(_db_execute(conn, "SELECT COUNT(*) AS count FROM jobs"))["count"]
                pred_count = _db_fetchone_dict(_db_execute(conn, "SELECT COUNT(*) AS count FROM predictions"))["count"]
                ann_count = 0
                audit_count = _db_fetchone_dict(_db_execute(conn, "SELECT COUNT(*) AS count FROM audit_logs"))["count"]
        return jsonify({
            "ok": True,
            "backend": _db_backend_name(),
            "databaseUrl": DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else "postgresql",
            "jobs": jobs_count,
            "predictions": pred_count,
            "annotations": ann_count,
            "auditLogs": audit_count,
        })
    except Exception as exc:
        return jsonify({"ok": False, "backend": _db_backend_name(), "error": f"{type(exc).__name__}: {exc}"}), 500

@db_bp.route("/db/jobs", methods=["GET"])
def db_jobs():
    limit = min(int(request.args.get("limit", 50)), 200)
    try:
        with db_lock:
            with _db_connect() as conn:
                rows = _db_fetchall_dict(_db_execute(
                    conn,
                    "SELECT * FROM jobs ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?",
                    (limit,),
                ))
        return jsonify({"jobs": rows, "count": len(rows), "backend": _db_backend_name()})
    except Exception as exc:
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500

@db_bp.route("/db/jobs/<job_id>", methods=["GET"])
def db_job_detail(job_id):
    try:
        with db_lock:
            with _db_connect() as conn:
                job = _db_fetchone_dict(_db_execute(conn, "SELECT * FROM jobs WHERE id=?", (job_id,)))
                if not job:
                    return jsonify({"error": "Job not found in database"}), 404
                preds = _db_fetchall_dict(_db_execute(
                    conn,
                    "SELECT * FROM predictions WHERE job_id=? ORDER BY segment_index ASC, source ASC",
                    (job_id,),
                ))
                anns = []
                audit = _db_fetchall_dict(_db_execute(
                    conn,
                    "SELECT * FROM audit_logs WHERE job_id=? ORDER BY created_at DESC LIMIT 100",
                    (job_id,),
                ))
        return jsonify({"backend": _db_backend_name(), "job": job, "predictions": preds, "annotations": anns, "audit": audit})
    except Exception as exc:
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500

@db_bp.route("/db/jobs/<job_id>/predictions", methods=["GET"])
def db_job_predictions(job_id):
    try:
        with db_lock:
            with _db_connect() as conn:
                rows = _db_fetchall_dict(_db_execute(
                    conn,
                    "SELECT payload_json FROM predictions WHERE job_id=? ORDER BY segment_index ASC, source ASC",
                    (job_id,),
                ))
        return jsonify([json.loads(r["payload_json"]) for r in rows])
    except Exception as exc:
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


