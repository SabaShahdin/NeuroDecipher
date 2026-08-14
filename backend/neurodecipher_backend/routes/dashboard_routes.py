# Auto-split from app_celery_postgres_step4_login.py
# Section: ROUTES — DASHBOARD OVERVIEW
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES — DASHBOARD OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════
dashboard_bp = Blueprint("dashboard", __name__)


def _dash_fmt_duration(seconds):
    try:
        seconds = float(seconds or 0)
    except Exception:
        seconds = 0.0
    if seconds <= 0:
        return "—"
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    sec = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{sec:02d}" if h else f"00:{m:02d}:{sec:02d}"


def _dash_date(ts):
    if not ts:
        return "—"
    try:
        return str(ts)[:10]
    except Exception:
        return "—"


def _dash_result_label(ai_count=0, hybrid_count=0, subtype=None):
    if ai_count or hybrid_count:
        st = (subtype or "").lower()
        if st == "gnsz":
            return "Generalized"
        if st in ("fnsz", "cpsz"):
            return "Focal Seizure"
        return "Seizure"
    return "Non-Seizure"


def _dashboard_engine_controls(conn):
    rows = _db_fetchall_dict(_db_execute(
        conn,
        "SELECT engine_key, display_name, is_active, status_note, updated_at FROM engine_controls",
    ))
    controls = {r.get("engine_key"): r for r in rows}

    def enabled(key):
        row = controls.get(key) or {}
        return bool(row.get("is_active"))

    # active = switched on in DB and technically available.
    # inactive = switched off in DB.
    # not_active = switched on but a required dependency is unavailable.
    ai_ready = bool(CHECKPOINT_PATH and os.path.exists(CHECKPOINT_PATH))
    clf_ready = bool(CLASSIFICATION_CHECKPOINT and os.path.exists(CLASSIFICATION_CHECKPOINT))
    ai_active = enabled("aiModel") and ai_ready
    rule_active = enabled("ruleEngine")
    hybrid_active = enabled("hybridEngine") and ai_active and rule_active

    def status(key, is_active, missing_note=None):
        row = controls.get(key) or {}
        if not enabled(key):
            return {
                "status": "not active",
                "enabled": False,
                "note": row.get("status_note") or "Disabled from database controls",
                "updatedAt": row.get("updated_at"),
            }
        if not is_active:
            return {
                "status": "not active",
                "enabled": True,
                "note": missing_note or row.get("status_note") or "Dependency unavailable",
                "updatedAt": row.get("updated_at"),
            }
        return {
            "status": "active",
            "enabled": True,
            "note": row.get("status_note") or "Available",
            "updatedAt": row.get("updated_at"),
        }

    return {
        "aiModel": status("aiModel", ai_active, "Detection checkpoint not found"),
        "ruleEngine": status("ruleEngine", rule_active),
        "hybridEngine": status("hybridEngine", hybrid_active, "Hybrid requires active AI model and rule engine"),
        "classificationModel": {
            "status": "active" if clf_ready else "not active",
            "enabled": clf_ready,
            "note": "Classification checkpoint available" if clf_ready else "Classification checkpoint not found",
        },
        "database": {
            "status": "active",
            "enabled": True,
            "note": _db_backend_name(),
        },
    }


@dashboard_bp.route("/dashboard/engine-controls", methods=["GET"])
def dashboard_engine_controls():
    try:
        with db_lock:
            with _db_connect() as conn:
                controls = _dashboard_engine_controls(conn)
        return jsonify({"ok": True, "engineControls": controls})
    except Exception as exc:
        log.exception("[DASHBOARD] engine controls failed")
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


@dashboard_bp.route("/dashboard/engine-controls", methods=["PATCH"])
def dashboard_update_engine_controls():
    data = request.get_json(silent=True) or {}
    engine_key = data.get("engineKey")
    if engine_key not in {"aiModel", "ruleEngine", "hybridEngine"}:
        return jsonify({"error": "engineKey must be aiModel, ruleEngine, or hybridEngine"}), 400
    if "isActive" not in data:
        return jsonify({"error": "isActive is required"}), 400
    try:
        is_active = bool(data.get("isActive"))
        note = data.get("statusNote") or ("Enabled" if is_active else "Disabled")
        with db_lock:
            with _db_connect() as conn:
                _db_execute(
                    conn,
                    "UPDATE engine_controls SET is_active=?, status_note=?, updated_at=? WHERE engine_key=?",
                    (is_active, note, now_iso(), engine_key),
                )
                conn.commit()
                controls = _dashboard_engine_controls(conn)
        return jsonify({"ok": True, "engineControls": controls})
    except Exception as exc:
        log.exception("[DASHBOARD] update engine controls failed")
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


@dashboard_bp.route("/dashboard/overview", methods=["GET"])
def dashboard_overview():
    """
    Database-backed dashboard summary for the frontend dashboard page.
    Metrics are computed from jobs, recording metadata, predictions,
    annotations, audit logs, and engine controls. Patient management is intentionally disabled for now. A recording is treated as
    seizure-positive when at least one AI/rule/hybrid segment is seizure.
    """
    try:
        with db_lock:
            with _db_connect() as conn:
                jobs_rows = _db_fetchall_dict(_db_execute(
                    conn,
                    """
                    SELECT j.*, rm.recording_label, rm.recording_type
                    FROM jobs j
                    LEFT JOIN recording_metadata rm ON rm.job_id = j.id
                    WHERE j.user_id=?
                    ORDER BY COALESCE(j.updated_at, j.created_at) DESC LIMIT 100
                    """,
                    (g.user_id,),
                ))
                pred_rows = _db_fetchall_dict(_db_execute(
                    conn,
                    """
                    SELECT job_id, segment_index, source, start_time, end_time,
                           label, confidence, probability, hybrid_label, hybrid_confidence,
                           subtype, subtype_full, payload_json
                    FROM predictions
                    ORDER BY job_id ASC, segment_index ASC, source ASC
                    """,
                ))
                ann_count = 0
                report_count = _db_fetchone_dict(_db_execute(
                    conn,
                    "SELECT COUNT(*) AS count FROM audit_logs WHERE action=?",
                    ("report_generated",),
                ))["count"]
                model_status = _dashboard_engine_controls(conn)

        preds_by_job = {}
        for row in pred_rows:
            preds_by_job.setdefault(row.get("job_id"), []).append(row)

        def payload(row):
            try:
                return json.loads(row.get("payload_json") or "{}")
            except Exception:
                return {}

        def row_is_seizure(row):
            p = payload(row)
            return (
                row.get("label") == "seizure"
                or row.get("hybrid_label") == "seizure"
                or p.get("label") == "seizure"
                or p.get("hybrid_label") == "seizure"
            )

        def segment_item(row):
            p = payload(row)
            start = row.get("start_time") if row.get("start_time") is not None else p.get("start")
            end = row.get("end_time") if row.get("end_time") is not None else p.get("end")
            try:
                dur = max(0.0, float(end or 0) - float(start or 0))
            except Exception:
                dur = 0.0
            subtype = row.get("subtype") or p.get("ai_subtype") or p.get("rule_subtype") or "seizure"
            subtype_full = row.get("subtype_full") or p.get("ai_subtype_full") or p.get("rule_subtype_full") or CLF_FULL_NAMES.get(str(subtype).lower(), "Seizure")
            conf = row.get("hybrid_confidence") if row.get("hybrid_confidence") is not None else row.get("confidence")
            if conf is None:
                conf = p.get("hybrid_confidence") or p.get("confidence") or p.get("prob")
            return {
                "index": int(row.get("segment_index") or p.get("index") or 0),
                "source": row.get("source") or p.get("source"),
                "start": float(start or 0),
                "end": float(end or 0),
                "duration": dur,
                "durationLabel": _dash_fmt_duration(dur),
                "timeRange": f"{fmt_time(float(start or 0))} → {fmt_time(float(end or 0))}",
                "subtype": subtype,
                "subtypeFull": subtype_full,
                "confidence": conf,
            }

        jobs_total = len(jobs_rows)
        jobs_with_any_predictions = 0
        seizure_recordings = 0
        non_seizure_recordings = 0
        seizure_segments_total = 0
        subtype_counts = {}
        recent = []

        for idx, job in enumerate(jobs_rows):
            jid = job.get("id")
            job_preds = preds_by_job.get(jid, [])
            if job_preds:
                jobs_with_any_predictions += 1
            seizure_segments = [segment_item(p) for p in job_preds if row_is_seizure(p)]
            # De-duplicate same segment if AI/rule/hybrid rows all mark the same window.
            dedup = {}
            for seg in seizure_segments:
                key = seg["index"]
                if key not in dedup or seg.get("source") == "rule":
                    dedup[key] = seg
            seizure_segments = sorted(dedup.values(), key=lambda x: x["index"])
            has_seizure = len(seizure_segments) > 0
            if has_seizure:
                seizure_recordings += 1
            else:
                non_seizure_recordings += 1
            seizure_segments_total += len(seizure_segments)
            for seg in seizure_segments:
                label = seg.get("subtypeFull") or CLF_FULL_NAMES.get(str(seg.get("subtype") or "seiz").lower(), "Seizure")
                subtype_counts[label] = subtype_counts.get(label, 0) + 1

            if len(recent) < 8:
                first = seizure_segments[0] if seizure_segments else None
                recent.append({
                    "jobId": jid,
                    "fileName": job.get("file_name") or "",
                    "recordingLabel": job.get("recording_label") or job.get("file_name") or "EEG Recording",
                    "duration": _dash_fmt_duration(job.get("duration")),
                    "date": _dash_date(job.get("created_at") or job.get("updated_at")),
                    "status": job.get("status"),
                    "hasSeizure": has_seizure,
                    "result": "Seizure" if has_seizure else "Non-Seizure",
                    "seizureSegmentCount": len(seizure_segments),
                    "firstSeizureSegment": first,
                    "seizureSegments": seizure_segments[:6],
                    "canOpenRecording": bool(job.get("file_path")),
                })

        seizure_type_distribution = [
            {"label": label, "count": int(count)}
            for label, count in sorted(subtype_counts.items(), key=lambda x: (-x[1], x[0]))
        ]
        if not seizure_type_distribution:
            seizure_type_distribution = [{"label": "No seizure subtype yet", "count": 0}]

        return jsonify({
            "ok": True,
            "generatedAt": now_iso(),
            "backend": _db_backend_name(),
            "totals": {
"totalRecordings": int(jobs_total),
                "analysedRecordings": int(jobs_with_any_predictions),
                "aiAnalyses": int(jobs_with_any_predictions),
                "seizureRecordings": int(seizure_recordings),
                "nonSeizureRecordings": int(non_seizure_recordings),
                "seizureSegments": int(seizure_segments_total),
                "seizuresDetected": int(seizure_recordings),
                "reportsGenerated": int(report_count or 0),
                "annotations": int(ann_count or 0),
            },
            "seizureDistribution": {
                "seizure": int(seizure_recordings),
                "nonSeizure": int(non_seizure_recordings),
            },
            "seizureTypeDistribution": seizure_type_distribution,
            "modelStatus": model_status,
            "recentRecordings": recent,
        })
    except Exception as exc:
        log.exception("[DASHBOARD] overview failed")
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


@dashboard_bp.route("/recordings/<job_id>/full", methods=["GET"])
def recording_full(job_id):
    """Load a saved recording, its metadata, and stored predictions for reopening in the EEG review screen."""
    try:
        with db_lock:
            with _db_connect() as conn:
                job = _db_fetchone_dict(_db_execute(conn, """
                    SELECT j.*, rm.recording_label, rm.recording_type,
                           rm.clinician, rm.notes AS recording_notes
                    FROM jobs j
                    LEFT JOIN recording_metadata rm ON rm.job_id = j.id
                    WHERE j.id=?
                """, (job_id,)))
                if not job:
                    return jsonify({"error": "Recording not found"}), 404
                if job.get("user_id") and job.get("user_id") != g.user_id:
                    return jsonify({"error": "You do not have access to this recording."}), 403
                pred_rows = _db_fetchall_dict(_db_execute(conn, """
                    SELECT payload_json, source FROM predictions
                    WHERE job_id=? ORDER BY segment_index ASC, source ASC
                """, (job_id,)))
                ann_rows = []

        file_path = job.get("file_path")
        if not file_path or not os.path.exists(file_path):
            return jsonify({"error": "Stored recording file is not available on this backend", "job": job}), 404
        ext = os.path.splitext(file_path)[1].lower().lstrip(".")
        if ext == "edf":
            signal_payload = read_signal_edf(file_path)
        elif ext in ("h5", "hdf5"):
            signal_payload = read_signal_h5(file_path)
        else:
            return jsonify({"error": f"Unsupported stored file type: .{ext}"}), 400

        ai_events, rule_events = [], []
        for row in pred_rows:
            try:
                ev = json.loads(row.get("payload_json") or "{}")
            except Exception:
                continue
            if (ev.get("source") or row.get("source")) == "rule":
                rule_events.append(ev)
            else:
                ai_events.append(ev)
        annotations = []
        for row in ann_rows:
            try:
                annotations.append(json.loads(row.get("payload_json") or "{}"))
            except Exception:
                pass

        return jsonify({
            "ok": True,
            "job": job,
            "signal": signal_payload,
            "events": ai_events,
            "ruleEvents": rule_events,
            "annotations": annotations,
        })
    except Exception as exc:
        log.exception("[RECORDINGS] full load failed")
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


