# Auto-split from app_celery_postgres_step4_login.py
# Section: ROUTES — RULE ANNOTATIONS  (full-file rule scan, Redis cached, DB-backed)
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES — RULE ANNOTATIONS  (full-file rule scan, Redis cached, DB-backed)
# ══════════════════════════════════════════════════════════════════════════════
rule_annotations_bp = Blueprint("rule_annotations", __name__)

RULE_ANNOTATION_CACHE_TTL_SECONDS = int(os.environ.get("RULE_ANNOTATION_CACHE_TTL_SECONDS", "3600"))
RULE_ANNOTATION_CACHE_MAX_BYTES = int(os.environ.get("RULE_ANNOTATION_CACHE_MAX_BYTES", "5000000"))


def _rule_annotations_cache_key(job_id: str) -> str:
    return f"nd:rule_annotations:{job_id}"


def _get_job_file_path_from_db(job_id: str) -> tuple[dict | None, str]:
    with _db_connect() as conn:
        row = _db_fetchone_dict(_db_execute(
            conn,
            "SELECT id, file_name, file_path, status FROM jobs WHERE id=?",
            (job_id,),
        ))
    if not row:
        return None, ""
    return row, str(row.get("file_path") or "")


def _get_rule_annotations_cache(job_id: str):
    r = get_redis_client()
    if r is None:
        return None
    try:
        raw = r.get(_rule_annotations_cache_key(job_id))
        if not raw:
            return None
        payload = json.loads(raw)
        return payload.get("events") if isinstance(payload, dict) else None
    except Exception as exc:
        log.warning(f"[rule_annotations] Could not read Redis cache for {job_id}: {exc}")
        return None


def _set_rule_annotations_cache(job_id: str, events: list) -> None:
    r = get_redis_client()
    if r is None:
        return
    try:
        raw = json.dumps({"events": events, "saved_at": time.time()})
        if len(raw.encode("utf-8")) > RULE_ANNOTATION_CACHE_MAX_BYTES:
            log.info(f"[rule_annotations] Cache skipped for {job_id}; payload too large")
            return
        r.setex(_rule_annotations_cache_key(job_id), RULE_ANNOTATION_CACHE_TTL_SECONDS, raw)
    except Exception as exc:
        log.warning(f"[rule_annotations] Could not write Redis cache for {job_id}: {exc}")

@rule_annotations_bp.route("/rule_annotations/<job_id>", methods=["GET"])
def get_rule_annotations(job_id):
    job, file_path = _get_job_file_path_from_db(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    if not file_path:
        return jsonify({"error": "File path not recorded for this job"}), 500
    if not os.path.exists(file_path):
        return jsonify({"error": "Recorded EEG file path no longer exists", "filePath": file_path}), 404

    cached = _get_rule_annotations_cache(job_id)
    if cached is not None:
        log.info(f"[rule_annotations] {job_id} Redis cache hit ({len(cached)} events)")
        return jsonify({"events": cached, "total": len(cached), "elapsed_s": 0.0, "cache": "redis"})

    log.info(f"[rule_annotations] {job_id} running annotator on {file_path} ...")
    t0 = time.time()
    try:
        events = run_rule_annotations(file_path)
    except Exception as exc:
        log.error(f"[rule_annotations] {job_id} error: {exc}")
        return jsonify({"error": str(exc)}), 500

    elapsed = round(time.time() - t0, 2)
    _set_rule_annotations_cache(job_id, events)
    db_insert_audit(job_id, "system", "rule_annotations_generated", {"count": len(events), "elapsed_s": elapsed})
    return jsonify({"events": events, "total": len(events), "elapsed_s": elapsed, "cache": "miss"})


