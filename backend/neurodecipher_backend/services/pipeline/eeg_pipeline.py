# Auto-split from app_celery_postgres_step4_login.py
# Section: SERVICES — PIPELINE WORKER
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  SERVICES — PIPELINE WORKER
# ══════════════════════════════════════════════════════════════════════════════
DEVICE        = torch.device("cuda" if torch.cuda.is_available() else "cpu")
SEGMENT_DELAY = float(os.environ.get("SEGMENT_DELAY", "0.0"))  # dev demos may set 0.6; production should use 0.0
ALPHA         = float(os.environ.get("HYBRID_ALPHA", "0.5"))      # hybrid weight: C = α·P_AI + (1−α)·R_rule
PRECOMPUTE_INTERPRETABILITY_ON_DONE = os.environ.get("PRECOMPUTE_INTERPRETABILITY_ON_DONE", "1").strip().lower() in ("1", "true", "yes", "on")

# The AI checkpoint gives calibrated seizure probability; the rule engine adds
# physiology-based support. The PRIMARY decision is the ALPHA-weighted blend of
# both (C_hybrid = ALPHA*P_AI + (1-ALPHA)*R_rule) compared against
# HYBRID_DECISION_THRESHOLD — this is what actually makes the result "hybrid"
# rather than one engine overriding the other.
#
# IMPORTANT CAVEAT ABOUT THE BLEND: the rule engine's confidence is a small set
# of near-fixed constants (0.9 seizure / 0.85 or 0.6 background — see
# classify_window() in services/rules/rule_engine.py), not a continuous score
# like the AI's softmax output. That means on files where the AI's own
# probability sits in a compressed, uniformly-low band across the whole
# recording (e.g. median 0.03, max 0.15 — which can happen on genuinely
# ambiguous files, or if AI's class-index mapping is inverted for that file),
# the current ALPHA=0.5 average of [tiny AI prob] and [rule's fixed 0.9] will
# almost always land under 0.5 even when the rule engine is at maximum
# confidence on nearly every window. In that situation the blend alone is
# effectively AI-gated, and the rule engine's opinion barely matters no matter
# how many windows it flags.
#
# HYBRID_RULE_AI_MIN_THRESHOLD exists to correct exactly that: rather than
# requiring AI to give "moderate support" (which defeats the purpose — if AI
# already gave moderate support, the blend above would have fired on its own),
# it only requires AI to not be virtually vetoing the window outright. This is
# what actually lets the rule engine's independent, high-confidence calls
# count as real input rather than being diluted into irrelevance.
HYBRID_DECISION_THRESHOLD = float(os.environ.get("NEURODECIPHER_HYBRID_DECISION_THRESHOLD", os.environ.get("HYBRID_DECISION_THRESHOLD", "0.50")))
HYBRID_AI_STRONG_THRESHOLD = float(os.environ.get("NEURODECIPHER_HYBRID_AI_STRONG_THRESHOLD", os.environ.get("HYBRID_AI_STRONG_THRESHOLD", "0.85")))
HYBRID_RULE_AI_MIN_THRESHOLD = float(os.environ.get("NEURODECIPHER_HYBRID_RULE_AI_MIN_THRESHOLD", os.environ.get("HYBRID_RULE_AI_MIN_THRESHOLD", "0.03")))
HYBRID_MIN_CONSECUTIVE_SEIZURE_WINDOWS = int(os.environ.get("NEURODECIPHER_HYBRID_MIN_CONSECUTIVE_SEIZURE_WINDOWS", os.environ.get("HYBRID_MIN_CONSECUTIVE_SEIZURE_WINDOWS", "2")))
HYBRID_BRIDGE_GAP_WINDOWS = int(os.environ.get("NEURODECIPHER_HYBRID_BRIDGE_GAP_WINDOWS", os.environ.get("HYBRID_BRIDGE_GAP_WINDOWS", "1")))


def _smooth_hybrid_seizure_flags(flags, min_consecutive=2, bridge_gap=1):
    """Post-process binary seizure flags without touching probabilities.

    1) Bridge very small bckg gaps between seizure runs.
    2) Remove isolated seizure runs shorter than ``min_consecutive``.

    Returns a list of booleans with the same length as ``flags``.
    """
    arr = [bool(x) for x in list(flags)]
    n = len(arr)
    if n == 0:
        return arr

    bridge_gap = max(0, int(bridge_gap or 0))
    min_consecutive = max(1, int(min_consecutive or 1))

    # Bridge short false gaps bounded by seizure on both sides.
    if bridge_gap > 0 and n >= 3:
        i = 0
        while i < n:
            if arr[i]:
                i += 1
                continue
            j = i
            while j < n and not arr[j]:
                j += 1
            gap_len = j - i
            left_sz = i > 0 and arr[i - 1]
            right_sz = j < n and arr[j]
            if left_sz and right_sz and gap_len <= bridge_gap:
                for k in range(i, j):
                    arr[k] = True
            i = j

    # Remove seizure runs shorter than min_consecutive.
    if min_consecutive > 1:
        i = 0
        while i < n:
            if not arr[i]:
                i += 1
                continue
            j = i
            while j < n and arr[j]:
                j += 1
            run_len = j - i
            if run_len < min_consecutive:
                for k in range(i, j):
                    arr[k] = False
            i = j

    return arr


def _put(job_id: str, msg: dict) -> None:
    """Stream first, persist second.

    The previous version wrote every segment to PostgreSQL before publishing to
    Redis. That made the frontend wait for database latency on every AI/rule
    event. This version publishes to Redis Streams first so the browser receives
    predictions immediately, then persists the same event for reports/history.
    If Redis is unavailable, the job is marked visibly as stream_error instead
    of silently making the frontend wait forever.
    """
    ok = redis_publish_event(job_id, msg)
    if not ok and msg.get("type") not in ("error",):
        message = "Redis stream publish failed; live prediction stream stopped."
        log.warning(f"[redis] {message} job={job_id}")
        try:
            db_persist_event(job_id, msg)
            db_mark_stream_error(job_id, message)
        finally:
            if STRICT_REDIS_STREAMING:
                raise RuntimeError(message)
        return

    # Persist after live publish so frontend latency is not blocked by DB I/O.
    # Prediction rows are high-frequency; by default they are bulk inserted at the
    # end of the job. Meta/done/error are still written immediately so dashboard
    # status stays current.
    if msg.get("type") == "prediction" and not PERSIST_PREDICTIONS_DURING_STREAM:
        return
    db_persist_event(job_id, msg)

def run_model(job_id: str, filepath: str) -> None:
    """Run the final trained NeuroDecipher model on one uploaded EEG file.

    Final model contract:
        raw EEG -> 4-second windows at 200 Hz -> rolling 10-window sequences
        X_raw       = (num_predictions, 10, 19, 800)
        FeatureBuilder -> X_feat = (num_predictions, 10, 19, 32)
        dynamic per-window graphs -> A = (num_predictions, 10, 19, 19)

    Timeline contract:
        Each SSE prediction event uses the start/end time of the latest/current
        4-second window in the 10-window context. Therefore the first prediction
        appears at 36-40 s, then 40-44 s, 44-48 s, etc.
    """
    t_start = time.time()

    try:
        # Resolve file path inside the worker process. This is important when
        # Flask and Celery are started from different folders, or when an older
        # DB record contains only a relative upload path.
        filepath = resolve_recording_file_path(filepath)
        jobs.update(job_id, {"file_path": filepath})

        warnings.filterwarnings("ignore")
        from neurodecipher_backend.services.ai.neurodecipher_sequence_engine import (
            get_neurodecipher_sequence_engine,
            make_rolling_4s_sequences,
            read_uploaded_eeg_for_model,
        )

        log.info(f"[{job_id}] ── Final NeuroDecipher pipeline starting | device={DEVICE} ──")
        log.info(
            f"[{job_id}] Model config | detection_checkpoint={NEURODECIPHER_DETECTION_CHECKPOINT_PATH} | "
            f"classification_checkpoint={NEURODECIPHER_CLASSIFICATION_CHECKPOINT_PATH} | "
            f"fs={RESAMPLED_FREQ}Hz window={TIME_STEP_SIZE}s seq_len={MODEL_SEQ_LEN} "
            f"graph_alpha={GRAPH_PARAMS.get('alpha')} top_k={GRAPH_PARAMS.get('top_k')}"
        )

        # ── STEP 1: READ FILE DIRECTLY ───────────────────────────────────────
        signal_19, fs, channel_names, matched = read_uploaded_eeg_for_model(
            filepath,
            target_fs=RESAMPLED_FREQ,
            num_nodes=NUM_NODES,
        )
        duration_s = signal_19.shape[1] / max(1, fs)
        log.info(
            f"[{job_id}] STEP 1 | EEG ready for model | shape={signal_19.shape} "
            f"fs={fs} duration={duration_s:.1f}s matched_channels={matched}/{NUM_NODES}"
        )

        # ── STEP 2: REAL ROLLING 10-WINDOW SEQUENCES ────────────────────────
        pack = make_rolling_4s_sequences(
            signal_19,
            fs=fs,
            window_seconds=TIME_STEP_SIZE,
            seq_len=MODEL_SEQ_LEN,
        )
        X_seq = pack["X"]  # (N, 10, 19, 800)
        start_times = pack["start_times"]
        stop_times = pack["stop_times"]
        context_start_times = pack["context_start_times"]
        context_stop_times = pack["context_stop_times"]
        current_window_indices = pack["current_window_indices"]
        raw_windows = pack["windows"]
        N = int(pack["n_predictions"])

        log.info(
            f"[{job_id}] STEP 2 | raw_windows={pack['n_raw_windows']} | "
            f"rolling_predictions={N} | X={X_seq.shape} | "
            f"first_prediction={start_times[0]:.1f}-{stop_times[0]:.1f}s"
        )
        jobs.update(job_id, {"total_segments": N, "status": "running", "started_at": now_iso()})
        _put(job_id, {
            "type": "meta",
            "total": N,
            "raw_windows": int(pack["n_raw_windows"]),
            "window_seconds": int(TIME_STEP_SIZE),
            "context_windows": int(MODEL_SEQ_LEN),
            "first_prediction_start": float(start_times[0]),
            "first_prediction_end": float(stop_times[0]),
        })

        # ── STEP 3: LOAD TWO FINAL CHECKPOINTS AND PREDICT ──────────────────
        # Correct production design:
        #   detection checkpoint      -> bckg / seizure
        #   classification checkpoint -> gnsz / fnsz / cpsz
        # We never use one generic checkpoint for both tasks.
        det_engine = get_neurodecipher_sequence_engine(
            checkpoint_path=NEURODECIPHER_DETECTION_CHECKPOINT_PATH,
            scaler_path=NEURODECIPHER_DETECTION_SCALER_PATH,
            device=DEVICE,
            batch_size=NEURODECIPHER_INFERENCE_BATCH_SIZE,
        )
        det_result = det_engine.predict_sequences(X_seq)
        det_probs_all = det_result["probabilities"]
        det_pred_indices = det_result["pred_indices"]
        detection_scaler_mode = det_result.get("scaler_mode", "unknown")
        det_prob_summary = det_result.get("probability_summary", {}) or {}
        log.info(
            f"[{job_id}] STEP 3A | Detection predictions ready | task={det_engine.task_mode} "
            f"classes={det_engine.class_names} scaler_mode={detection_scaler_mode} "
            f"threshold={det_result.get('detection_threshold', '-') } "
            f"threshold_source={det_result.get('detection_threshold_source', '-') }"
        )
        if det_prob_summary:
            log.info(
                f"[{job_id}] Detection probability stats | "
                f"mode={det_prob_summary.get('probability_mode', 'raw_softmax')} "
                f"threshold={det_prob_summary.get('threshold'):.4f} "
                f"configured_threshold={det_prob_summary.get('configured_threshold', det_prob_summary.get('threshold')):.4f} "
                f"threshold_mode={det_prob_summary.get('threshold_mode', 'fixed')} "
                f"source={det_prob_summary.get('threshold_source', 'unknown')} "
                f"min={det_prob_summary.get('min'):.4f} "
                f"median={det_prob_summary.get('median'):.4f} "
                f"mean={det_prob_summary.get('mean'):.4f} "
                f"p90={det_prob_summary.get('p90'):.4f} "
                f"p95={det_prob_summary.get('p95'):.4f} "
                f"max={det_prob_summary.get('max'):.4f} "
                f"above={det_prob_summary.get('n_above_threshold')}/{det_prob_summary.get('n_total')}"
            )
            adapt = det_prob_summary.get("threshold_adaptation", {}) or {}
            if adapt:
                log.info(
                    f"[{job_id}] Detection threshold adaptation | "
                    f"mode={adapt.get('mode')} action={adapt.get('action')} "
                    f"base={adapt.get('base_threshold', 0.0):.4f} runtime={adapt.get('runtime_threshold', 0.0):.4f} "
                    f"rate_at_base={adapt.get('predicted_rate_at_base', 0.0):.3f} "
                    f"rate_at_runtime={adapt.get('predicted_rate_at_runtime', 0.0):.3f} "
                    f"min_rate={adapt.get('min_rate', 0.0):.3f} max_rate={adapt.get('max_rate', 0.0):.3f} "
                    f"min_evidence={adapt.get('min_evidence', 0.0):.4f}"
                )
            cal = det_prob_summary.get("prior_calibration", {}) or {}
            if cal.get("enabled"):
                log.info(
                    f"[{job_id}] Detection prior calibration | "
                    f"train_prior={cal.get('train_seizure_prior'):.4f} "
                    f"deploy_prior={cal.get('deploy_seizure_prior'):.4f} "
                    f"logit_shift={cal.get('logit_correction'):.4f} "
                    f"raw_median={cal.get('raw_median'):.4f} -> calibrated_median={cal.get('calibrated_median'):.4f} "
                    f"raw_p95={cal.get('raw_p95'):.4f} -> calibrated_p95={cal.get('calibrated_p95'):.4f}"
                )
            class_stats = det_prob_summary.get("class_probability_stats", {}) or {}
            if class_stats:
                try:
                    log.info(f"[{job_id}] Detection class probability stats | {class_stats}")
                except Exception:
                    pass
            if int(det_prob_summary.get('n_above_threshold', 0)) == 0:
                log.warning(
                    f"[{job_id}] Detection produced ZERO seizure windows at threshold "
                    f"{det_prob_summary.get('threshold'):.4f}. This usually means one of these: "
                    "threshold is too strict, detection scaler.pkl is missing/wrong, feature configuration differs from training, "
                    "the seizure/background output index is reversed, or the checkpoint is bckg-biased despite good accuracy/weighted-F1."
                )
            elif int(det_prob_summary.get('n_above_threshold', 0)) < max(3, int(0.02 * int(det_prob_summary.get('n_total', 0) or 0))):
                log.warning(
                    f"[{job_id}] Detection produced very few seizure windows: "
                    f"{det_prob_summary.get('n_above_threshold')}/{det_prob_summary.get('n_total')}. "
                    "If the uploaded file is known to be mostly/all seizure, check scaler_mode, feature_builder, and output index mapping. "
                    "If class-0 probabilities are high while class-1 probabilities are low, set NEURODECIPHER_DETECTION_SEIZURE_INDEX=0 and NEURODECIPHER_DETECTION_BACKGROUND_INDEX=1."
                )
        if detection_scaler_mode != "training_scaler":
            log.warning(
                f"[{job_id}] Detection scaler.pkl was not found. Used {detection_scaler_mode}. "
                "For best production accuracy, set NEURODECIPHER_DETECTION_SCALER "
                "or place scaler.pkl beside the detection checkpoint."
            )

        clf_engine = None
        clf_result = None
        clf_probs_all = None
        clf_pred_indices = None
        classification_scaler_mode = None
        if NEURODECIPHER_CLASSIFICATION_CHECKPOINT_PATH and os.path.exists(NEURODECIPHER_CLASSIFICATION_CHECKPOINT_PATH):
            clf_engine = get_neurodecipher_sequence_engine(
                checkpoint_path=NEURODECIPHER_CLASSIFICATION_CHECKPOINT_PATH,
                scaler_path=NEURODECIPHER_CLASSIFICATION_SCALER_PATH,
                device=DEVICE,
                batch_size=NEURODECIPHER_INFERENCE_BATCH_SIZE,
            )
            clf_result = clf_engine.predict_sequences(X_seq)
            clf_probs_all = clf_result["probabilities"]
            clf_pred_indices = clf_result["pred_indices"]
            classification_scaler_mode = clf_result.get("scaler_mode", "unknown")
            log.info(
                f"[{job_id}] STEP 3B | Classification predictions ready | task={clf_engine.task_mode} "
                f"classes={clf_engine.class_names} scaler_mode={classification_scaler_mode}"
            )
            if classification_scaler_mode != "training_scaler":
                log.warning(
                    f"[{job_id}] Classification scaler.pkl was not found. Used {classification_scaler_mode}. "
                    "For best production accuracy, set NEURODECIPHER_CLASSIFICATION_SCALER "
                    "or place scaler.pkl beside the classification checkpoint."
                )
        elif REQUIRE_CLASSIFICATION_CHECKPOINT:
            raise FileNotFoundError(
                "Classification checkpoint not found: "
                f"{NEURODECIPHER_CLASSIFICATION_CHECKPOINT_PATH}. "
                "Set CLASSIFICATION_CHECKPOINT or NEURODECIPHER_CLASSIFICATION_CHECKPOINT in .env."
            )
        else:
            log.warning(
                f"[{job_id}] Classification checkpoint missing; subtype labels will be skipped. "
                f"Path={NEURODECIPHER_CLASSIFICATION_CHECKPOINT_PATH}"
            )

        # ── STEP 4: STREAM ONE EVENT PER 4-SECOND CURRENT WINDOW ─────────────
        n_seizure_ai = n_bckg_ai = 0
        n_seizure_rule = n_bckg_rule = 0
        n_seizure_hybrid = n_bckg_hybrid = 0
        prediction_events_buffer = []

        # ── STEP 3C: PRECOMPUTE RULE + FINAL HYBRID DECISION ───────────────
        # Final displayed detection should be efficient, not seizure-biased and
        # not background-biased. We therefore do not display raw AI-only or
        # rule-only as final. The final hybrid decision is:
        #   seizure if AI p(seizure) >= strong threshold
        #   OR rule says seizure AND AI p(seizure) >= moderate support threshold
        # followed by short temporal smoothing.
        seizure_idx = int((det_prob_summary or {}).get("seizure_index", 1))
        if seizure_idx < 0 or seizure_idx >= int(det_probs_all.shape[1]):
            seizure_idx = 1 if int(det_probs_all.shape[1]) > 1 else 0
        p_sz_all = det_probs_all[:, seizure_idx].astype(float)

        rule_results_cache = []
        raw_hybrid_flags = []
        raw_hybrid_labels = []
        raw_hybrid_confs = []
        raw_hybrid_reasons = []

        for pre_sid in range(N):
            pre_current_w = int(current_window_indices[pre_sid])
            pre_raw_window = raw_windows[pre_current_w]
            pre_t_start = float(start_times[pre_sid])
            pre_rule = classify_window(pre_raw_window, float(fs), pre_t_start)
            pre_rule_label = str(pre_rule.get("label", "bckg"))
            pre_r_conf = float(pre_rule.get("confidence", 0.0))
            pre_rule_seizure_prob = pre_r_conf if pre_rule_label == "seizure" else (1.0 - pre_r_conf)
            pre_p_sz = float(p_sz_all[pre_sid])

            pre_ai_strong = pre_p_sz >= float(HYBRID_AI_STRONG_THRESHOLD)
            pre_rule_supported = (pre_rule_label == "seizure") and (pre_p_sz >= float(HYBRID_RULE_AI_MIN_THRESHOLD))
            pre_hybrid_conf = round(float(ALPHA) * pre_p_sz + (1.0 - float(ALPHA)) * pre_rule_seizure_prob, 4)
            pre_blend_seizure = pre_hybrid_conf >= float(HYBRID_DECISION_THRESHOLD)

            # PRIMARY decision: the ALPHA-weighted blend of AI + rule confidence.
            # This is what makes the result genuinely hybrid — both engines are
            # always contributing, weighted by ALPHA, instead of one silently
            # overriding the other.
            if pre_blend_seizure:
                pre_label = "seizure"
                pre_reason = "hybrid_blend"
            # SECONDARY overrides: only for genuinely extreme, unambiguous cases
            # where the blended score alone said "bckg" but one signal is
            # overwhelming on its own.
            elif pre_ai_strong:
                pre_label = "seizure"
                pre_reason = "ai_strong_override"
            elif pre_rule_supported:
                pre_label = "seizure"
                pre_reason = "rule_confident_ai_not_vetoing"
            else:
                pre_label = "bckg"
                pre_reason = "insufficient_hybrid_support"

            rule_results_cache.append(pre_rule)
            raw_hybrid_flags.append(pre_label == "seizure")
            raw_hybrid_labels.append(pre_label)
            raw_hybrid_confs.append(pre_hybrid_conf)
            raw_hybrid_reasons.append(pre_reason)

        smoothed_hybrid_flags = _smooth_hybrid_seizure_flags(
            raw_hybrid_flags,
            min_consecutive=HYBRID_MIN_CONSECUTIVE_SEIZURE_WINDOWS,
            bridge_gap=HYBRID_BRIDGE_GAP_WINDOWS,
        )
        final_hybrid_labels = ["seizure" if x else "bckg" for x in smoothed_hybrid_flags]
        n_raw_hybrid_sz = int(sum(bool(x) for x in raw_hybrid_flags))
        n_final_hybrid_sz = int(sum(1 for x in final_hybrid_labels if x == "seizure"))
        log.info(
            f"[{job_id}] STEP 3C | Hybrid final detection ready | "
            f"mode=ai_rule_temporal decision_threshold={HYBRID_DECISION_THRESHOLD:.3f} "
            f"ai_strong_override>={HYBRID_AI_STRONG_THRESHOLD:.3f} "
            f"rule_ai_min_override>={HYBRID_RULE_AI_MIN_THRESHOLD:.3f} "
            f"min_consecutive={HYBRID_MIN_CONSECUTIVE_SEIZURE_WINDOWS} "
            f"bridge_gap={HYBRID_BRIDGE_GAP_WINDOWS} "
            f"raw_hybrid_seizure={n_raw_hybrid_sz}/{N} "
            f"final_hybrid_seizure={n_final_hybrid_sz}/{N}"
        )

        for sid in range(N):
            t_seg_start = float(start_times[sid])
            t_seg_end = float(stop_times[sid])
            ctx_start = float(context_start_times[sid])
            ctx_end = float(context_stop_times[sid])
            progress = round((sid + 1) / N * 100, 1)
            current_w = int(current_window_indices[sid])
            raw_window = raw_windows[current_w]  # (19, 800), current/latest 4-second window

            # Stage 1: detection checkpoint decides bckg/seizure for this 4-second window.
            ai_ev, p_sz, ai_label, ai_conf = det_engine.format_ai_event(
                sid,
                t_seg_start,
                t_seg_end,
                ctx_start,
                ctx_end,
                det_probs_all[sid],
                int(det_pred_indices[sid]),
            )
            final_hybrid_label = final_hybrid_labels[sid]
            raw_hybrid_label = raw_hybrid_labels[sid]
            hybrid_conf = raw_hybrid_confs[sid]
            hybrid_reason = raw_hybrid_reasons[sid]
            hybrid_changed_by_smoothing = (final_hybrid_label != raw_hybrid_label)
            if hybrid_changed_by_smoothing:
                hybrid_reason = f"temporal_smoothing_{raw_hybrid_label}_to_{final_hybrid_label}"

            ai_ev.update({
                "total": N,
                "progress": progress,
                "pipeline_mode": "detection_then_classification",
                "model_task": "detection",
                "detection_checkpoint": os.path.basename(NEURODECIPHER_DETECTION_CHECKPOINT_PATH),
                "classification_checkpoint": os.path.basename(NEURODECIPHER_CLASSIFICATION_CHECKPOINT_PATH),
                "scaler_mode": detection_scaler_mode,
                "detection_scaler_mode": detection_scaler_mode,
                "classification_scaler_mode": classification_scaler_mode,
                "detection_probabilities": ai_ev.get("probabilities", {}),
                "detection_probability_summary": det_prob_summary,
                "detection_threshold": ai_ev.get("detection_threshold"),
                "final_display_source": "hybrid",
                "final_label": final_hybrid_label,
                "hybrid_label": final_hybrid_label,
                "hybrid_raw_label": raw_hybrid_label,
                "hybrid_confidence": hybrid_conf,
                "hybrid_reason": hybrid_reason,
                "hybrid_smoothed": bool(hybrid_changed_by_smoothing),
            })

            # Stage 2: classification checkpoint gives subtype only when the
            # FINAL HYBRID decision says this 4-second window is seizure.
            # Your current system uses 3 seizure classes: gnsz, fnsz, cpsz.
            if final_hybrid_label == "seizure" and clf_engine is not None and clf_probs_all is not None:
                clf_ev, _clf_p, _clf_label, clf_conf = clf_engine.format_ai_event(
                    sid,
                    t_seg_start,
                    t_seg_end,
                    ctx_start,
                    ctx_end,
                    clf_probs_all[sid],
                    int(clf_pred_indices[sid]),
                )
                ai_ev.update({
                    "model_task": "detection_then_classification",
                    "ai_subtype": clf_ev.get("ai_subtype"),
                    "ai_subtype_full": clf_ev.get("ai_subtype_full"),
                    "ai_subtype_confidence": clf_ev.get("ai_subtype_confidence", round(float(clf_conf), 4)),
                    "ai_subtype_probs": clf_ev.get("ai_subtype_probs", clf_ev.get("probabilities", {})),
                    "classification_probabilities": clf_ev.get("ai_subtype_probs", clf_ev.get("probabilities", {})),
                    "classification_trigger": "hybrid_final_seizure",
                })
            else:
                ai_ev.update({
                    "ai_subtype": None,
                    "ai_subtype_full": None,
                    "ai_subtype_confidence": None,
                    "ai_subtype_probs": None,
                    "classification_probabilities": None,
                    "classification_trigger": None,
                })

            if ai_label == "seizure":
                n_seizure_ai += 1
            else:
                n_bckg_ai += 1

            if sid % PROGRESS_LOG_EVERY == 0 or sid == N - 1:
                log.info(
                    f"[AI][{job_id}] pred={sid:04d}/{N-1} "
                    f"window={t_seg_start:.1f}-{t_seg_end:.1f}s "
                    f"context={ctx_start:.1f}-{ctx_end:.1f}s "
                    f"label={ai_label} conf={ai_conf:.4f} subtype={ai_ev.get('ai_subtype', '-') }"
                )

            _put(job_id, ai_ev)
            if not PERSIST_PREDICTIONS_DURING_STREAM:
                prediction_events_buffer.append(ai_ev)

            if SEGMENT_DELAY > 0:
                time.sleep(SEGMENT_DELAY / 2)

            # Rule engine was precomputed in STEP 3C so temporal smoothing can
            # use the neighbouring windows before streaming events to frontend.
            rule_result = rule_results_cache[sid]
            rule_label = str(rule_result.get("label", "bckg"))
            r_conf = float(rule_result.get("confidence", 0.0))
            rule_seizure_prob = r_conf if rule_label == "seizure" else (1.0 - r_conf)

            if rule_label == "seizure":
                n_seizure_rule += 1
            else:
                n_bckg_rule += 1

            hybrid_label = final_hybrid_label
            if hybrid_label == "seizure":
                n_seizure_hybrid += 1
            else:
                n_bckg_hybrid += 1

            rule_clf_result = None
            if rule_label == "seizure" and ENABLE_LIVE_SUBTYPE_CLASSIFICATION:
                # Compute the rule engine's own subtype whenever the rule engine
                # itself calls this window a seizure — do NOT also require
                # hybrid_label == "seizure" here. Gating on hybrid agreement
                # meant that any time AI and rule disagreed (e.g. an
                # ai_strong_override), rule_subtype was silently left unset and
                # showed up as "pending"/"unavailable" downstream even though
                # the rule engine had a real opinion.
                try:
                    rule_clf_result = classify_seizure_rule(raw_window=raw_window, fs=float(fs))
                except Exception as exc:
                    log.warning(f"[CLF-RULE][{job_id}] rule subtype failed: {exc}")
                    rule_clf_result = None

            rule_ev = {
                "type": "prediction",
                "source": "rule",
                "index": sid,
                "start": t_seg_start,
                "end": t_seg_end,
                "context_start": ctx_start,
                "context_end": ctx_end,
                "window_seconds": int(TIME_STEP_SIZE),
                "context_windows": int(MODEL_SEQ_LEN),
                "label": rule_label,
                "prob": rule_result.get("prob"),
                "confidence": r_conf,
                "rules": rule_result.get("rules", []),
                "n_sz_rules": rule_result.get("n_sz_rules", 0),
                "hybrid_confidence": hybrid_conf,
                "hybrid_label": hybrid_label,
                "hybrid_raw_label": raw_hybrid_label,
                "hybrid_reason": hybrid_reason,
                "hybrid_smoothed": bool(hybrid_changed_by_smoothing),
                "hybrid_mode": "ai_rule_temporal",
                "hybrid_ai_strong_threshold": round(float(HYBRID_AI_STRONG_THRESHOLD), 4),
                "hybrid_rule_ai_min_threshold": round(float(HYBRID_RULE_AI_MIN_THRESHOLD), 4),
                "hybrid_min_consecutive_windows": int(HYBRID_MIN_CONSECUTIVE_SEIZURE_WINDOWS),
                "hybrid_bridge_gap_windows": int(HYBRID_BRIDGE_GAP_WINDOWS),
                "final_display_source": "hybrid",
                "final_label": hybrid_label,
                "label_for_display": hybrid_label,
                "alpha": ALPHA,
                "ai_prob_used": round(float(p_sz), 4),
                "rule_conf_used": round(float(rule_seizure_prob), 4),
                "ai_subtype": ai_ev.get("ai_subtype"),
                "ai_subtype_full": ai_ev.get("ai_subtype_full"),
                "ai_subtype_confidence": ai_ev.get("ai_subtype_confidence"),
                "classification_trigger": ai_ev.get("classification_trigger"),
                "total": N,
                "progress": progress,
            }
            if rule_clf_result:
                rule_ev.update({
                    "rule_subtype": rule_clf_result.get("rule_subtype", "unavailable"),
                    "rule_subtype_full": rule_clf_result.get("rule_subtype_full", ""),
                    "rule_subtype_confidence": rule_clf_result.get("rule_subtype_confidence", None),
                    "rule_subtype_rules": rule_clf_result.get("rule_subtype_rules", []),
                })

            # ── Hybrid subtype decision ─────────────────────────────────
            # Only meaningful once the FINAL hybrid decision has already
            # called this window "seizure" (same gate as ai_subtype above).
            #   - AI detection said bckg, rule said seizure -> rule subtype wins
            #   - Rule said bckg, AI detection said seizure -> AI subtype wins
            #   - Both agree it's seizure -> blend AI probs + rule scores and
            #     let the combined probability distribution decide
            if final_hybrid_label == "seizure":
                hybrid_subtype_result = classify_seizure_hybrid_subtype(
                    ai_label=ai_label,
                    rule_label=rule_label,
                    ai_result=ai_ev,
                    rule_result=rule_clf_result or {},
                    alpha=float(ALPHA),
                )
            else:
                hybrid_subtype_result = None

            rule_ev.update({
                "hybrid_subtype": (hybrid_subtype_result or {}).get("hybrid_subtype"),
                "hybrid_subtype_full": (hybrid_subtype_result or {}).get("hybrid_subtype_full"),
                "hybrid_subtype_confidence": (hybrid_subtype_result or {}).get("hybrid_subtype_confidence"),
                "hybrid_subtype_source": (hybrid_subtype_result or {}).get("hybrid_subtype_source"),
                "hybrid_subtype_probs": (hybrid_subtype_result or {}).get("hybrid_subtype_probs"),
            })

            if sid % PROGRESS_LOG_EVERY == 0 or sid == N - 1:
                log.info(
                    f"[RULE/HYBRID][{job_id}] pred={sid:04d} "
                    f"rule={rule_label} r_conf={r_conf:.4f} "
                    f"hybrid={hybrid_label} raw={raw_hybrid_label} "
                    f"hybrid_conf={hybrid_conf:.4f} reason={hybrid_reason}"
                )

            _put(job_id, rule_ev)
            if not PERSIST_PREDICTIONS_DURING_STREAM:
                prediction_events_buffer.append(rule_ev)

            if SEGMENT_DELAY > 0:
                time.sleep(SEGMENT_DELAY / 2)

        # ── FINALISE ────────────────────────────────────────────────────────
        elapsed = round(time.time() - t_start, 1)
        log.info(
            f"[{job_id}] Done | AI seizure={n_seizure_ai} bckg={n_bckg_ai} | "
            f"Rule seizure={n_seizure_rule} bckg={n_bckg_rule} | "
            f"Hybrid seizure={n_seizure_hybrid} bckg={n_bckg_hybrid} | elapsed={elapsed}s"
        )

        if not PERSIST_PREDICTIONS_DURING_STREAM and prediction_events_buffer:
            db_persist_prediction_events_bulk(job_id, prediction_events_buffer)

        interpretability_ready = False
        if PRECOMPUTE_INTERPRETABILITY_ON_DONE:
            precompute_fn = globals().get("precompute_interpretability_for_job")
            if callable(precompute_fn):
                interpretability_ready = bool(precompute_fn(job_id))
            else:
                log.info(f"[ANALYSIS] Interpretability precompute unavailable for {job_id}")

        jobs.update(job_id, {
            "done": True,
            "worker_alive": False,
            "finished_at": now_iso(),
            "status": "ready",
            "interpretability_ready": interpretability_ready,
        })

        _put(job_id, {
            "type": "done",
            "total": N,
            "raw_windows": int(pack["n_raw_windows"]),
            "window_seconds": int(TIME_STEP_SIZE),
            "context_windows": int(MODEL_SEQ_LEN),
            "n_seizure_ai": n_seizure_ai,
            "n_bckg_ai": n_bckg_ai,
            "n_seizure_rule": n_seizure_rule,
            "n_bckg_rule": n_bckg_rule,
            "n_seizure_hybrid": n_seizure_hybrid,
            "n_bckg_hybrid": n_bckg_hybrid,
            "final_display_source": "hybrid",
            "hybrid_mode": "ai_rule_temporal",
            "hybrid_ai_strong_threshold": round(float(HYBRID_AI_STRONG_THRESHOLD), 4),
            "hybrid_rule_ai_min_threshold": round(float(HYBRID_RULE_AI_MIN_THRESHOLD), 4),
            "hybrid_min_consecutive_windows": int(HYBRID_MIN_CONSECUTIVE_SEIZURE_WINDOWS),
            "hybrid_bridge_gap_windows": int(HYBRID_BRIDGE_GAP_WINDOWS),
            "elapsed_s": elapsed,
            "interpretability_ready": interpretability_ready,
        })

        log.info(f"[{job_id}] ── Final NeuroDecipher pipeline finished in {elapsed}s ──")

    except Exception as exc:
        friendly = (
            "Analysis failed. Check the backend logs for the full traceback. "
            f"Reason: {type(exc).__name__}: {exc}"
        )
        log.error(f"[{job_id}] Pipeline error: {exc}")
        log.error(traceback.format_exc())
        jobs.update(job_id, {"error": friendly, "done": True, "worker_alive": False, "finished_at": now_iso(), "status": "error"})
        _put(job_id, {"type": "error", "message": friendly})
