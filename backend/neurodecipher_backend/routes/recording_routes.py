# Auto-split from app_celery_postgres_step4_login.py
# Section: ROUTES — RECORDING MANAGEMENT
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES — RECORDING MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════
recordings_bp = Blueprint("recordings", __name__)


@recordings_bp.route("/recordings", methods=["GET"])
def recordings_list():
    try:
        with db_lock:
            with _db_connect() as conn:
                rows = _db_fetchall_dict(_db_execute(conn, """
                    SELECT j.id AS job_id, j.file_name, j.file_size_bytes, j.status AS job_status,
                           j.duration, j.sampling_rate, j.total_segments, j.n_seizure_ai, j.n_seizure_rule,
                           j.n_seizure_hybrid, j.created_at AS job_created_at, j.updated_at AS job_updated_at,
                           rm.recording_label, rm.recording_type, rm.acquisition_date,
                           rm.clinician, rm.notes, rm.status AS recording_status, rm.updated_at AS metadata_updated_at
                    FROM jobs j
                    LEFT JOIN recording_metadata rm ON rm.job_id = j.id
                    ORDER BY COALESCE(j.updated_at, j.created_at) DESC
                    LIMIT 250
                """))
        q = str(request.args.get("q", "")).strip().lower()
        if q:
            rows = [r for r in rows if q in str(r.get("file_name") or "").lower() or q in str(r.get("recording_label") or "").lower() or q in str(r.get("recording_status") or r.get("job_status") or "").lower()]
        recs = []
        for r in rows:
            recs.append({
                "jobId": r.get("job_id"),
                "fileName": r.get("file_name"),
                "fileSizeBytes": r.get("file_size_bytes"),
                "status": r.get("recording_status") or r.get("job_status"),
                "jobStatus": r.get("job_status"),
                "duration": r.get("duration"),
                "durationLabel": _dash_fmt_duration(r.get("duration")),
                "samplingRate": r.get("sampling_rate"),
                "totalSegments": r.get("total_segments"),
                "recordingLabel": r.get("recording_label") or r.get("file_name"),
                "recordingType": r.get("recording_type") or "EEG",
                "acquisitionDate": r.get("acquisition_date"),
                "clinician": r.get("clinician"),
                "notes": r.get("notes"),
                "aiSeizureWindows": int(r.get("n_seizure_ai") or 0),
                "ruleSeizureWindows": int(r.get("n_seizure_rule") or 0),
                "hybridSeizureWindows": int(r.get("n_seizure_hybrid") or 0),
                "createdAt": r.get("job_created_at"),
                "updatedAt": r.get("metadata_updated_at") or r.get("job_updated_at"),
            })
        return jsonify({"ok": True, "recordings": recs})
    except Exception as exc:
        log.exception("[RECORDINGS] list failed")
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


@recordings_bp.route("/recordings/<job_id>", methods=["PATCH"])
def recordings_update(job_id):
    data = request.get_json(silent=True) or {}
    try:
        meta = {
            "recording_label": data.get("recordingLabel"),
            "recording_type": data.get("recordingType") or "EEG",
            "acquisition_date": data.get("acquisitionDate"),
            "clinician": data.get("clinician"),
            "notes": data.get("notes"),
            "status": data.get("status") or "review_pending",
        }
        db_upsert_recording_metadata(job_id, meta)
        db_insert_audit(job_id, data.get("actor") or "api", "recording_metadata_updated", meta)
        return jsonify({"ok": True})
    except Exception as exc:
        log.exception("[RECORDINGS] update failed")
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


