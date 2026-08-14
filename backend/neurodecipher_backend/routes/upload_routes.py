# Auto-split from app_celery_postgres_step4_login.py
# Section: ROUTES — UPLOAD
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES — UPLOAD
# ══════════════════════════════════════════════════════════════════════════════
from neurodecipher_backend.services.storage.s3_service import generate_upload_url
from neurodecipher_backend.services.storage.s3_download import download_file_from_s3
upload_bp = Blueprint("upload", __name__)


def _make_server_upload_path(original_name: str) -> tuple[str, str, str]:
    """Return (job_id, stored_file_name, absolute_file_path) for uploaded EEG.

    The user may choose a local file from anywhere. Browsers do not expose the
    original local path to the backend; Flask receives bytes and stages them in
    UPLOAD_FOLDER for the Celery worker.
    """
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    job_id = str(uuid.uuid4())
    safe_original = secure_filename(original_name) or "recording.edf"
    stored_file_name = f"{job_id[:8]}_{safe_original}"
    file_path = os.path.abspath(os.path.join(UPLOAD_FOLDER, stored_file_name))
    return job_id, stored_file_name, file_path

@upload_bp.route("/upload/presigned", methods=["POST"])
def presigned_upload():

    data = request.json

    filename = data.get("filename")

    if not filename:
        return {
            "error":"filename required"
        },400


    result = generate_upload_url(
        filename
    )


    return {
        "ok":True,
        **result
    }
@upload_bp.route("/upload/start", methods=["POST"])
def start_upload():

    data = request.get_json() or {}

    s3_key = data.get("s3Key")

    if not s3_key:
        return {
            "error": "s3Key required"
        }, 400

    filename = os.path.basename(s3_key)

    job_id, safe_name, filepath = _make_server_upload_path(filename)

    download_file_from_s3(
        s3_key=s3_key,
        local_path=filepath,
    )

    filepath = resolve_recording_file_path(filepath)

    try:
        sig = read_signal_edf(filepath)
    except Exception as exc:
        return _json_error(
            f"Could not read downloaded EEG file: {exc}",
            status=422,
            code="SIGNAL_READ_FAILED",
        )

    size_bytes = os.path.getsize(filepath)

    duration = sig["times"][-1] if sig.get("times") else 0.0

    job_record = {
        "done": False,
        "error": None,
        "file_name": filename,
        "stored_file_name": safe_name,
        "file_path": filepath,
        "file_size_bytes": size_bytes,
        "duration": duration,
        "total_segments": 0,
        "n_seizure_ai": 0,
        "n_bckg_ai": 0,
        "n_seizure_rule": 0,
        "n_bckg_rule": 0,
        "n_seizure_hybrid": 0,
        "n_bckg_hybrid": 0,
        "created_at": now_iso(),
        "created_at_ts": time.time(),
        "started_at": None,
        "started_at_ts": None,
        "finished_at": None,
        "worker_alive": False,
        "celery_task_id": None,
        "status": "queued",
    }

    jobs.set(job_id, job_record)

    db_insert_job(
        job_id,
        job_record,
        sig,
        user_id=g.user_id
    )

    db_upsert_recording_metadata(job_id, {
        "recording_label": filename,
        "recording_type": "EEG",
        "status": "queued",
    })

    async_result = process_eeg_job.delay(
        job_id,
        os.path.abspath(filepath)
    )

    jobs.update(
        job_id,
        {
            "celery_task_id": async_result.id
        }
    )

    db_insert_audit(
        job_id,
        "api",
        "celery_task_queued",
        {
            "taskId": async_result.id
        }
    )

    log.info(
        f"S3 upload job {job_id} queued | task={async_result.id}"
    )

    return jsonify({
        "ok": True,
        "jobId": job_id,
        "filePath": filepath,
        "fileName": filename,
        "status": "queued",
        "celeryTaskId": async_result.id,
        **sig,
    })
@upload_bp.route("/upload", methods=["POST"])
def upload():
    """Accept an EEG file, validate it, persist job metadata, and queue Celery.

    The backend no longer starts local worker threads or stores job state in a
    Python dictionary. Celery owns background execution, Redis Streams own live
    event delivery, and PostgreSQL owns durable history.
    """
    if not ENABLE_CELERY:
        return _json_error(
            "Celery is required. Set ENABLE_CELERY=1 and run the Celery worker.",
            status=503,
            code="CELERY_REQUIRED",
        )
    if celery_app is None or process_eeg_job is None:
        return _json_error(
            "Celery package is not installed. Run: pip install celery redis",
            status=503,
            code="CELERY_NOT_INSTALLED",
        )
    if not redis_enabled() or get_redis_client() is None:
        return _json_error(
            "Redis Streams are required for live predictions. Start Redis and set REDIS_URL.",
            status=503,
            code="REDIS_REQUIRED_FOR_CELERY",
        )

    filepath = None
    try:
        file = request.files.get("file")
        try:
            original_name, ext = _validate_upload_file(file)
        except ValueError as exc:
            return _json_error(str(exc), status=400, code="INVALID_UPLOAD")

        job_id, safe_name, filepath = _make_server_upload_path(original_name)
        file.save(filepath)
        filepath = resolve_recording_file_path(filepath)
        size_bytes = os.path.getsize(filepath)
        log.info(
            f"Upload received: {original_name} -> {safe_name} ({size_bytes} bytes) | "
            f"server_path={filepath}"
        )

        try:
            sig = read_signal_edf(filepath) if ext == "edf" else read_signal_h5(filepath)
        except Exception as exc:
            log.error(f"Signal validation/read error for {original_name}: {exc}")
            try:
                os.remove(filepath)
            except Exception:
                pass
            return _json_error(
                f"Could not read/validate EEG signal: {exc}",
                status=422,
                code="SIGNAL_READ_FAILED",
                details=f"{type(exc).__name__}: {exc}",
            )

        duration = sig["times"][-1] if sig.get("times") else 0.0
        job_record = {
            "done": False,
            "error": None,
            "file_name": original_name,
            "stored_file_name": safe_name,
            "file_path": filepath,
            "file_size_bytes": size_bytes,
            "duration": duration,
            "total_segments": 0,
            "n_seizure_ai": 0,
            "n_bckg_ai": 0,
            "n_seizure_rule": 0,
            "n_bckg_rule": 0,
            "n_seizure_hybrid": 0,
            "n_bckg_hybrid": 0,
            "created_at": now_iso(),
            "created_at_ts": time.time(),
            "started_at": None,
            "started_at_ts": None,
            "finished_at": None,
            "worker_alive": False,
            "celery_task_id": None,
            "status": "queued",
        }
        jobs.set(job_id, job_record)
        db_insert_job(job_id, job_record, sig, user_id=g.user_id)

        db_upsert_recording_metadata(job_id, {
            "recording_label": request.form.get("recordingLabel") or original_name,
            "recording_type": request.form.get("recordingType") or "EEG",
            "acquisition_date": request.form.get("acquisitionDate"),
            "clinician": request.form.get("clinician"),
            "notes": request.form.get("notes"),
            "status": "queued",
        })

        # Always pass the absolute server-side staged file path to Celery.
        # Do not rely on the user's original local folder path or Flask cwd.
        async_result = process_eeg_job.delay(job_id, os.path.abspath(filepath))
        jobs.update(job_id, {"celery_task_id": async_result.id})
        db_insert_audit(job_id, "api", "celery_task_queued", {"taskId": async_result.id})
        log.info(f"Job {job_id} queued in Celery | task={async_result.id}")

        return jsonify({
            "jobId": job_id,
            "fileName": original_name,
            "status": "queued",
            "celeryTaskId": async_result.id,
            **sig,
        })
    except Exception as exc:
        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception:
                pass
        log.error(f"[upload] Unexpected upload failure: {exc}")
        if LOG_ERROR_TRACEBACKS:
            log.error(traceback.format_exc())
        return _json_exception(exc, fallback_message="Upload failed safely. No analysis was started. Check backend logs and try again.")


# Convenience endpoints now read job state from PostgreSQL/Redis instead of Python memory.
@upload_bp.route("/jobs", methods=["GET"])
def list_jobs():
    try:
        limit = max(1, min(int(request.args.get("limit", 50)), 250))
        with _db_connect() as conn:
            rows = _db_fetchall_dict(_db_execute(
                conn,
                """
                SELECT * FROM jobs
                WHERE user_id=?
                ORDER BY COALESCE(updated_at, created_at) DESC
                LIMIT ?
                """,
                (g.user_id, limit),
            ))
        return jsonify({"jobs": rows, "count": len(rows), "maxActiveJobs": MAX_ACTIVE_JOBS})
    except Exception as exc:
        log.error(f"[jobs] list failed: {exc}")
        return _json_exception(exc)


@upload_bp.route("/jobs/<job_id>", methods=["GET"])
def get_job_status(job_id):
    try:
        with _db_connect() as conn:
            job = _db_fetchone_dict(_db_execute(conn, "SELECT * FROM jobs WHERE id=?", (job_id,)))
        if not job:
            return _json_error("Job not found.", status=404, code="JOB_NOT_FOUND", jobId=job_id)
        if job.get("user_id") and job.get("user_id") != g.user_id:
            return _json_error("You do not have access to this recording.", status=403, code="FORBIDDEN")
        runtime = jobs.get(job_id) or {}
        return jsonify({**job, "runtime": runtime})
    except Exception as exc:
        log.error(f"[jobs] status failed job={job_id}: {exc}")
        return _json_exception(exc)


@upload_bp.route("/jobs/cleanup", methods=["POST"])
def cleanup_jobs_route():
    return jsonify({"removed": 0, "message": "In-memory cleanup removed; Redis keys expire automatically."})


