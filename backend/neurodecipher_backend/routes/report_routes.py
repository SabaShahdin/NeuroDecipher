# Auto-split from app_celery_postgres_step4_login.py
# Section: ROUTES — REPORT  (AI + Rule + Hybrid PDF / JSON)
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES — REPORT  (AI + Rule + Hybrid PDF / JSON)
# ══════════════════════════════════════════════════════════════════════════════
report_bp = Blueprint("report", __name__)

def _resolve_events(raw_events, _unused=None):
    final = []
    for ev in raw_events:
        e = dict(ev)
        e["status"] = "ai"
        e["label"] = e.get("ai_label", "bckg")
        e["clinician"] = ""
        e["note"] = ""
        final.append(e)
    return final

def _rows_to_report_events(pred_rows):
    """Build legacy report records from persisted AI/rule prediction rows."""
    by_idx = {}
    for row in pred_rows:
        try:
            payload = json.loads(row.get("payload_json") or "{}")
        except Exception:
            payload = {}
        idx = payload.get("index", row.get("segment_index"))
        if idx is None:
            continue
        rec = by_idx.setdefault(idx, {
            "index": idx,
            "start": payload.get("start") if payload.get("start") is not None else row.get("start_time"),
            "end": payload.get("end") if payload.get("end") is not None else row.get("end_time"),
        })
        src = payload.get("source") or row.get("source")
        if src == "ai":
            rec.update({
                "ai_label": payload.get("label", row.get("label")),
                "ai_prob": payload.get("prob", row.get("probability")),
                "ai_confidence": payload.get("confidence", row.get("confidence")),
            })
            for key in ("ai_subtype", "ai_subtype_full", "ai_subtype_confidence", "ai_subtype_probs"):
                if key in payload:
                    rec[key] = payload[key]
        elif src == "rule":
            rec.update({
                "rule_label": payload.get("label", row.get("label")),
                "rule_confidence": payload.get("confidence", row.get("confidence")),
                "rule_rules": payload.get("rules", []),
                "rule_n_sz_rules": payload.get("n_sz_rules", 0),
                "hybrid_confidence": payload.get("hybrid_confidence", row.get("hybrid_confidence")),
                "hybrid_label": payload.get("hybrid_label", row.get("hybrid_label")),
                "alpha": payload.get("alpha", ALPHA),
                "ai_prob_used": payload.get("ai_prob_used", payload.get("ai_conf_used")),
                "rule_conf_used": payload.get("rule_conf_used"),
            })
            for key in ("rule_subtype", "rule_subtype_full", "rule_subtype_confidence"):
                if key in payload:
                    rec[key] = payload[key]
    return [by_idx[k] for k in sorted(by_idx)]


def _load_report_context_from_db(job_id: str):
    """Load report context from DB so reports work across Celery processes/restarts."""
    with db_lock:
        with _db_connect() as conn:
            job = _db_fetchone_dict(_db_execute(conn, "SELECT * FROM jobs WHERE id=?", (job_id,)))
            if not job:
                return None
            pred_rows = _db_fetchall_dict(_db_execute(
                conn,
                "SELECT * FROM predictions WHERE job_id=? ORDER BY segment_index ASC, source ASC",
                (job_id,),
            ))
            ann_rows = []
            audit_rows = _db_fetchall_dict(_db_execute(
                conn,
                "SELECT * FROM audit_logs WHERE job_id=? ORDER BY created_at ASC",
                (job_id,),
            ))

    raw_events = _rows_to_report_events(pred_rows)
    edits = {}
    clinician = "Unknown"
    for row in ann_rows:
        try:
            entry = json.loads(row.get("payload_json") or "{}")
        except Exception:
            entry = {}
        idx = entry.get("index", row.get("segment_index"))
        if idx is not None:
            edits[str(idx)] = entry
        if entry.get("clinician"):
            clinician = entry["clinician"]

    audit = []
    for row in audit_rows:
        try:
            payload = json.loads(row.get("payload_json") or "{}")
        except Exception:
            payload = {}
        audit.append({
            "action": row.get("action"),
            "clinician": row.get("actor") or payload.get("clinician") or "system",
            "label": payload.get("label"),
            "note": payload.get("note"),
            "ts": row.get("created_at"),
            "source": payload.get("source", "audit"),
        })

    return {
        "raw_events": raw_events,
        "edits": edits,
        "audit": audit,
        "file_name": job.get("file_name") or "unknown.edf",
        "duration": job.get("duration") or 0.0,
        "clinician": clinician,
    }




# ══════════════════════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 2 — UNIFIED ANNOTATIONS + REPORT EXPORT
#  One source of truth for:
#    • Annotation table preview
#    • Annotation CSV export
#    • PDF report generation
#  Rows include AI, Rule, and Hybrid predictions in the UI/PDF.
#  CSV export is intentionally minimal: start, stop, hybrid prediction, confidence.
# ══════════════════════════════════════════════════════════════════════════════

def _phase2_float(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def _phase2_clamp01(value, default=0.0):
    v = _phase2_float(value, default)
    if v > 1.0:
        v = v / 100.0
    return max(0.0, min(1.0, v))


def _phase2_pct(value):
    try:
        return f"{round(_phase2_clamp01(value) * 100)}%"
    except Exception:
        return "—"


def _phase2_label(value):
    txt = str(value or "bckg").replace("_", " ").replace("-", " ").strip()
    low = " ".join(txt.lower().split())
    if low in ("bckg", "background", "non seizure", "nonseizure", "normal", "none", "negative"):
        return "Non-seizure"
    if low in ("seiz", "sz"):
        return "Seizure"
    return " ".join(w[:1].upper() + w[1:] for w in txt.split())


def _phase2_is_seizure(value):
    low = str(value or "").replace("_", " ").replace("-", " ").strip().lower()
    if low in ("", "bckg", "background", "normal", "none", "negative"):
        return False
    if "non seizure" in low or "nonseizure" in low:
        return False
    return "seizure" in low or low in ("seiz", "sz")


def _phase2_subtype(ev: dict) -> str:
    subtype = (
        ev.get("hybrid_subtype_full") or ev.get("hybrid_subtype") or
        ev.get("rule_subtype_full") or ev.get("rule_subtype") or
        ev.get("ai_subtype_full") or ev.get("ai_subtype") or
        ev.get("subtype_full") or ev.get("subtype") or ""
    )
    subtype = str(subtype or "").strip()
    if not subtype or subtype.lower() in ("unavailable", "error", "none", "seiz", "seizure", "pending"):
        return ""
    return _phase2_label(subtype)


def _phase2_prediction_text(label, subtype=""):
    lbl = _phase2_label(label)
    if _phase2_is_seizure(label) and subtype:
        return f"{lbl} ({_phase2_label(subtype)})"
    return lbl


def _phase2_time_bounds(ev: dict, ctx_duration: float | None = None) -> tuple[float, float]:
    """Return reliable segment start/stop times in seconds.

    Older persisted rows can be missing start/end fields in either the AI or rule
    payload. When that happens, derive the window from the segment index and the
    configured model window length so CSV/PDF exports never show 0 → 0 for every
    row.
    """
    idx = int(_phase2_float(ev.get("index", ev.get("segment", 0)), 0))

    start_raw = ev.get("start")
    if start_raw is None:
        start_raw = ev.get("start_time")

    stop_raw = ev.get("end")
    if stop_raw is None:
        stop_raw = ev.get("stop_time")
    if stop_raw is None:
        stop_raw = ev.get("end_time")

    window_sec = float(globals().get("TIME_STEP_SIZE", 12) or 12)
    start = _phase2_float(start_raw, idx * window_sec)
    stop = _phase2_float(stop_raw, start + window_sec)

    if stop <= start:
        stop = start + window_sec

    duration = _phase2_float(ctx_duration, 0.0)
    if duration > 0:
        start = max(0.0, min(start, duration))
        stop = max(start, min(stop, duration))

    return round(start, 3), round(stop, 3)


def _phase2_rows_from_context(ctx: dict) -> list[dict]:
    raw_events = copy.deepcopy(ctx.get("raw_events") or [])
    final = _resolve_events(raw_events, copy.deepcopy(ctx.get("edits") or {}))
    rows = []
    ctx_duration = _phase2_float(ctx.get("duration"), 0.0)

    for ev in final:
        start, stop = _phase2_time_bounds(ev, ctx_duration)

        subtype = _phase2_subtype(ev)
        ai_label = ev.get("ai_label") or ev.get("label") or "bckg"
        rule_label = ev.get("rule_label") or "bckg"
        hybrid_label = ev.get("hybrid_label") or ev.get("final_label") or rule_label or ai_label

        ai_conf = ev.get("ai_confidence", ev.get("ai_prob", ev.get("prob")))
        rule_conf = ev.get("rule_confidence")
        hybrid_conf = ev.get("hybrid_confidence", ev.get("hybrid_score"))
        if hybrid_conf is None:
            hybrid_conf = (0.70 * _phase2_clamp01(ai_conf)) + (0.30 * _phase2_clamp01(rule_conf))

        rows.append({
            "segment": ev.get("index", ev.get("segment", len(rows))),
            "file_name": ctx.get("file_name") or "unknown.edf",
            "recording_duration": _phase2_float(ctx.get("duration"), 0.0),
            "start_time": round(start, 3),
            "stop_time": round(stop, 3),
            "start_label": fmt_time(start),
            "stop_label": fmt_time(stop),
            "duration_seconds": round(max(0.0, stop - start), 3),
            "ai_prediction": _phase2_prediction_text(ai_label, subtype if _phase2_is_seizure(ai_label) else ""),
            "ai_label": _phase2_label(ai_label),
            "ai_confidence": round(_phase2_clamp01(ai_conf), 4),
            "ai_confidence_label": _phase2_pct(ai_conf),
            "rule_prediction": _phase2_prediction_text(rule_label, subtype if _phase2_is_seizure(rule_label) else ""),
            "rule_label": _phase2_label(rule_label),
            "rule_confidence": round(_phase2_clamp01(rule_conf), 4),
            "rule_confidence_label": _phase2_pct(rule_conf),
            "hybrid_prediction": _phase2_prediction_text(hybrid_label, subtype if _phase2_is_seizure(hybrid_label) else ""),
            "hybrid_label": _phase2_label(hybrid_label),
            "hybrid_confidence": round(_phase2_clamp01(hybrid_conf), 4),
            "hybrid_confidence_label": _phase2_pct(hybrid_conf),
            "seizure_type": subtype if _phase2_is_seizure(hybrid_label) else "",
            "is_hybrid_seizure": _phase2_is_seizure(hybrid_label),
        })

    rows.sort(key=lambda r: (_phase2_float(r.get("start_time")), int(_phase2_float(r.get("segment"), 0))))
    return rows


def _phase2_report_summary(rows: list[dict]) -> dict:
    total = len(rows)
    hybrid_sz = [r for r in rows if r.get("is_hybrid_seizure")]
    ai_sz = [r for r in rows if _phase2_is_seizure(r.get("ai_label")) or _phase2_is_seizure(r.get("ai_prediction"))]
    rule_sz = [r for r in rows if _phase2_is_seizure(r.get("rule_label")) or _phase2_is_seizure(r.get("rule_prediction"))]
    avg_hybrid = sum(_phase2_float(r.get("hybrid_confidence"), 0.0) for r in rows) / max(1, total)
    burden = sum(_phase2_float(r.get("duration_seconds"), 0.0) for r in hybrid_sz)
    final_prediction = "Seizure Detected" if hybrid_sz else "No Seizure Detected"
    return {
        "total_segments": total,
        "ai_seizure_segments": len(ai_sz),
        "rule_seizure_segments": len(rule_sz),
        "hybrid_seizure_segments": len(hybrid_sz),
        "avg_hybrid_confidence": round(avg_hybrid, 4),
        "avg_hybrid_confidence_label": _phase2_pct(avg_hybrid),
        "seizure_burden_seconds": round(burden, 3),
        "final_prediction": final_prediction,
    }


def _phase2_build_analysis_plot(rows: list[dict], file_name: str) -> str | None:
    """Create a report PNG showing AI, rule, and hybrid confidence traces."""
    if not rows:
        return None
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np

        xs = np.array([_phase2_float(r.get("start_time"), i) for i, r in enumerate(rows)], dtype=float)
        ai_conf = np.array([_phase2_clamp01(r.get("ai_confidence"), 0.0) * 100.0 for r in rows], dtype=float)
        rule_conf = np.array([_phase2_clamp01(r.get("rule_confidence"), 0.0) * 100.0 for r in rows], dtype=float)
        hybrid_conf = np.array([_phase2_clamp01(r.get("hybrid_confidence"), 0.0) * 100.0 for r in rows], dtype=float)

        fig, ax = plt.subplots(figsize=(7.8, 2.55), dpi=160)
        for r in rows:
            if r.get("is_hybrid_seizure"):
                ax.axvspan(_phase2_float(r.get("start_time")), _phase2_float(r.get("stop_time")), color="#DC2626", alpha=0.10, linewidth=0)
        ax.plot(xs, ai_conf, color="#2563EB", linewidth=1.55, marker="o", markersize=2.9, label="AI confidence")
        ax.plot(xs, rule_conf, color="#D97706", linewidth=1.55, marker="s", markersize=2.7, label="Rule confidence")
        ax.plot(xs, hybrid_conf, color="#7C3AED", linewidth=2.05, marker="^", markersize=3.1, label="Hybrid confidence")
        ax.set_title("AI vs Rule vs Hybrid Confidence Timeline", fontsize=10, fontweight="bold")
        ax.set_xlabel("Time (seconds)", fontsize=8)
        ax.set_ylabel("Confidence (%)", fontsize=8)
        ax.set_ylim(0, 105)
        ax.grid(True, alpha=0.22, linewidth=0.5)
        ax.legend(loc="upper right", fontsize=7, frameon=True)
        ax.tick_params(axis="both", labelsize=7)
        fig.tight_layout(pad=1.1)
        out_dir = os.path.join(BASE_DIR, "generated_reports")
        os.makedirs(out_dir, exist_ok=True)
        safe_stem = secure_filename(str(file_name or "recording").rsplit(".", 1)[0]) or "recording"
        path = os.path.join(out_dir, f"{safe_stem}_all_confidence_timeline.png")
        fig.savefig(path, bbox_inches="tight")
        plt.close(fig)
        return path
    except Exception as exc:
        log.warning(f"[REPORT] could not build analysis plot: {exc}")
        return None


if PDF_AVAILABLE:
    def build_pdf_report(file_name, duration, rows, summary, clinician="Unknown", job_id="", plot_path=None):
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        buf = io.BytesIO()
        rid = f"ND-{uuid.uuid4().hex[:8].upper()}"
        now_str = fmt_ts(now_iso())
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle("nd_title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=colors.HexColor("#0F172A"), alignment=TA_CENTER)
        sub_style = ParagraphStyle("nd_sub", parent=styles["Normal"], fontSize=8.5, leading=11, textColor=colors.HexColor("#475569"), alignment=TA_CENTER)
        h_style = ParagraphStyle("nd_h", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=colors.HexColor("#0F172A"), spaceBefore=7, spaceAfter=5)
        small = ParagraphStyle("nd_small", parent=styles["Normal"], fontSize=7.1, leading=8.7, textColor=colors.HexColor("#334155"))
        small_bold = ParagraphStyle("nd_small_bold", parent=small, fontName="Helvetica-Bold")
        cell = ParagraphStyle("nd_cell", parent=styles["Normal"], fontSize=6.5, leading=7.6, textColor=colors.HexColor("#0F172A"))
        cell_center = ParagraphStyle("nd_cell_center", parent=cell, alignment=TA_CENTER)
        th = ParagraphStyle("nd_th", parent=cell_center, fontName="Helvetica-Bold", textColor=colors.white)

        doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=1.0*cm, rightMargin=1.0*cm, topMargin=1.0*cm, bottomMargin=1.0*cm)
        story = []
        story += [Paragraph("NEURO DECIPHER", title_style), Paragraph("EEG Hybrid Prediction Annotation & Report", sub_style), Spacer(1, 0.18*cm)]

        meta = [
            [Paragraph("File", small_bold), Paragraph(str(file_name or "—"), small), Paragraph("Duration", small_bold), Paragraph(f"{round(float(duration or 0), 2)} s", small)],
            [Paragraph("Clinician", small_bold), Paragraph(str(clinician or "Unknown"), small), Paragraph("Generated", small_bold), Paragraph(now_str, small)],
            [Paragraph("Report ID", small_bold), Paragraph(rid, small), Paragraph("Job ID", small_bold), Paragraph(str(job_id or "—"), small)],
            [Paragraph("Hybrid Summary", small_bold), Paragraph(f"{summary.get('final_prediction')} · Hybrid seizure windows: {summary.get('hybrid_seizure_segments')} / {summary.get('total_segments')} · Avg confidence: {summary.get('avg_hybrid_confidence_label')}", small), Paragraph("Burden", small_bold), Paragraph(f"{summary.get('seizure_burden_seconds')} s", small)],
        ]
        mt = Table(meta, colWidths=[2.2*cm, 10.4*cm, 2.2*cm, 10.0*cm])
        mt.setStyle(TableStyle([
            ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0,0), (-1,-1), 0.25, colors.HexColor("#E2E8F0")),
            ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F1F5F9")),
            ("BACKGROUND", (2,0), (2,-1), colors.HexColor("#F1F5F9")),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        story += [mt, Spacer(1, 0.22*cm)]

        if plot_path and os.path.exists(plot_path):
            story.append(Paragraph("1. Confidence Plot — AI, Rule, and Hybrid", h_style))
            story.append(Image(plot_path, width=24.5*cm, height=7.0*cm))
            story.append(Spacer(1, 0.15*cm))

        ai_avg = sum(_phase2_clamp01(r.get("ai_confidence"), 0.0) for r in rows) / max(1, len(rows))
        rule_avg = sum(_phase2_clamp01(r.get("rule_confidence"), 0.0) for r in rows) / max(1, len(rows))
        hybrid_avg = sum(_phase2_clamp01(r.get("hybrid_confidence"), 0.0) for r in rows) / max(1, len(rows))
        first_sz = next((r for r in rows if r.get("is_hybrid_seizure")), None)
        quick_rows = [
            [Paragraph("Final result", small_bold), Paragraph(str(summary.get("final_prediction") or "—"), small), Paragraph("Total segments", small_bold), Paragraph(str(summary.get("total_segments") or 0), small)],
            [Paragraph("AI / Rule / Hybrid seizure windows", small_bold), Paragraph(f"{summary.get('ai_seizure_segments', 0)} / {summary.get('rule_seizure_segments', 0)} / {summary.get('hybrid_seizure_segments', 0)}", small), Paragraph("Seizure burden", small_bold), Paragraph(f"{summary.get('seizure_burden_seconds', 0)} s", small)],
            [Paragraph("Avg AI / Rule / Hybrid confidence", small_bold), Paragraph(f"{_phase2_pct(ai_avg)} / {_phase2_pct(rule_avg)} / {_phase2_pct(hybrid_avg)}", small), Paragraph("First hybrid seizure", small_bold), Paragraph((first_sz.get("start_label") + " – " + first_sz.get("stop_label")) if first_sz else "—", small)],
        ]
        qt = Table(quick_rows, colWidths=[5.0*cm, 8.0*cm, 4.0*cm, 7.2*cm])
        qt.setStyle(TableStyle([
            ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0,0), (-1,-1), 0.25, colors.HexColor("#E2E8F0")),
            ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F8FAFC")),
            ("BACKGROUND", (2,0), (2,-1), colors.HexColor("#F8FAFC")),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        story.append(Paragraph("2. Quick Analysis", h_style))
        story.append(qt)
        story.append(Spacer(1, 0.15*cm))

        story.append(Paragraph("3. Automated Annotation Table", h_style))
        header = ["Start", "Stop", "AI Prediction", "AI Conf.", "Rule Prediction", "Rule Conf.", "Hybrid Prediction", "Hybrid Conf."]
        table_rows = [[Paragraph(h, th) for h in header]]
        for r in rows:
            table_rows.append([
                Paragraph(r.get("start_label") or fmt_time(r.get("start_time") or 0), cell_center),
                Paragraph(r.get("stop_label") or fmt_time(r.get("stop_time") or 0), cell_center),
                Paragraph(str(r.get("ai_prediction") or "—"), cell),
                Paragraph(str(r.get("ai_confidence_label") or "—"), cell_center),
                Paragraph(str(r.get("rule_prediction") or "—"), cell),
                Paragraph(str(r.get("rule_confidence_label") or "—"), cell_center),
                Paragraph(str(r.get("hybrid_prediction") or "—"), cell),
                Paragraph(str(r.get("hybrid_confidence_label") or "—"), cell_center),
            ])
        col_widths = [1.75*cm, 1.75*cm, 4.3*cm, 1.55*cm, 4.3*cm, 1.55*cm, 5.2*cm, 1.75*cm]
        seg_tbl = Table(table_rows, colWidths=col_widths, repeatRows=1)
        ts = TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0F172A")),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#CBD5E1")),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("TOPPADDING", (0,0), (-1,-1), 3.5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 3.5),
        ])
        for i, r in enumerate(rows, start=1):
            if i % 2 == 0:
                ts.add("BACKGROUND", (0,i), (-1,i), colors.HexColor("#F8FAFC"))
            if r.get("is_hybrid_seizure"):
                ts.add("TEXTCOLOR", (6,i), (7,i), colors.HexColor("#DC2626"))
        seg_tbl.setStyle(ts)
        story.append(seg_tbl)
        story.append(Spacer(1, 0.18*cm))
        story.append(Paragraph("4. Disclaimer", h_style))
        story.append(Paragraph("This report is generated by NeuroDecipher for clinical decision support. It must be reviewed by a qualified clinician before diagnostic or treatment decisions.", small))

        def _page(canvas, doc_obj):
            canvas.saveState()
            canvas.setFont("Helvetica", 6.5)
            canvas.setFillColor(colors.HexColor("#64748B"))
            canvas.drawString(1.0*cm, 0.55*cm, "CONFIDENTIAL — NeuroDecipher AI-assisted EEG analysis")
            canvas.drawRightString(landscape(A4)[0] - 1.0*cm, 0.55*cm, f"{rid} · page {doc_obj.page}")
            canvas.restoreState()
        doc.build(story, onFirstPage=_page, onLaterPages=_page)
        buf.seek(0)
        return buf
else:
    def build_pdf_report(**kwargs):
        raise ImportError("reportlab not installed")


@annotations_bp.route("/annotations/<job_id>/table", methods=["GET"])
def get_auto_annotation_table(job_id):
    ctx = _load_report_context_from_db(job_id)
    if not ctx:
        return jsonify({"error": "Job not found"}), 404
    rows = _phase2_rows_from_context(ctx)
    return jsonify({
        "ok": True,
        "job": {
            "jobId": job_id,
            "fileName": ctx.get("file_name"),
            "duration": ctx.get("duration"),
            "clinician": ctx.get("clinician"),
        },
        "summary": _phase2_report_summary(rows),
        "annotations": rows,
    })


@annotations_bp.route("/annotations/<job_id>/csv", methods=["GET"])
def download_auto_annotations_csv(job_id):
    import csv
    ctx = _load_report_context_from_db(job_id)
    if not ctx:
        return jsonify({"error": "Job not found"}), 404
    rows = _phase2_rows_from_context(ctx)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "segment",
        "start_time",
        "stop_time",
        "start_seconds",
        "stop_seconds",
        "duration_seconds",
        "hybrid_segment_prediction",
        "hybrid_confidence",
    ])
    for r in rows:
        writer.writerow([
            r.get("segment"),
            r.get("start_label") or fmt_time(r.get("start_time") or 0),
            r.get("stop_label") or fmt_time(r.get("stop_time") or 0),
            f'{_phase2_float(r.get("start_time"), 0.0):.3f}',
            f'{_phase2_float(r.get("stop_time"), 0.0):.3f}',
            f'{_phase2_float(r.get("duration_seconds"), 0.0):.3f}',
            r.get("hybrid_prediction"),
            r.get("hybrid_confidence_label") or _phase2_pct(r.get("hybrid_confidence")),
        ])
    csv_bytes = output.getvalue().encode("utf-8-sig")
    stem = secure_filename(str(ctx.get("file_name") or "recording").rsplit(".", 1)[0]) or "recording"
    response = make_response(csv_bytes)
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers["Content-Disposition"] = f'attachment; filename="neurodecipher_{stem}_hybrid_annotations.csv"'
    response.headers["Access-Control-Allow-Origin"] = FRONTEND_ORIGIN
    response.headers["Access-Control-Expose-Headers"] = "Content-Disposition, Content-Type, Content-Length"
    response.headers["Content-Length"] = str(len(csv_bytes))
    return response


@report_bp.route("/report/<job_id>", methods=["GET"])
def get_report(job_id):
    log.info(f"[REPORT] GET /report/{job_id}")
    ctx = _load_report_context_from_db(job_id)
    if not ctx:
        return jsonify({"error": "Job not found"}), 404

    rows = _phase2_rows_from_context(ctx)
    summary = _phase2_report_summary(rows)
    file_name = ctx.get("file_name") or "recording.edf"
    duration = ctx.get("duration") or 0.0
    clinician = ctx.get("clinician") or "Unknown"

    log.info(
        f"[REPORT] {job_id} — rows={len(rows)} hybrid_seizure={summary.get('hybrid_seizure_segments')} "
        f"burden={summary.get('seizure_burden_seconds')}s"
    )

    if not PDF_AVAILABLE:
        return jsonify({
            "file": file_name,
            "duration_s": round(_phase2_float(duration), 1),
            "summary": summary,
            "annotations": rows,
        })

    try:
        plot_path = _phase2_build_analysis_plot(rows, file_name)
        buf = build_pdf_report(
            file_name=file_name,
            duration=duration,
            rows=rows,
            summary=summary,
            clinician=clinician,
            job_id=job_id,
            plot_path=plot_path,
        )
    except Exception as exc:
        log.exception(f"[REPORT] build_pdf_report failed for {job_id}: {exc}")
        return jsonify({"error": f"PDF generation failed: {exc}"}), 500

    buf.seek(0)
    pdf_bytes = buf.getvalue()
    if not pdf_bytes:
        return jsonify({"error": "PDF buffer is empty — check server logs."}), 500

    stem = secure_filename(str(file_name).rsplit(".", 1)[0]) or "recording"
    pdf_name = f"neurodecipher_{stem}_annotation_report.pdf"
    response = make_response(pdf_bytes)
    response.headers["Content-Type"] = "application/pdf"
    response.headers["Content-Length"] = str(len(pdf_bytes))
    response.headers["Content-Disposition"] = f'attachment; filename="{pdf_name}"'
    response.headers["Access-Control-Allow-Origin"] = FRONTEND_ORIGIN
    response.headers["Access-Control-Expose-Headers"] = "Content-Disposition, Content-Type, Content-Length"
    response.headers["Cache-Control"] = "no-cache, no-store"
    db_insert_audit(job_id, clinician or "clinician", "annotation_report_generated", {"file": file_name, "pdf": pdf_name})
    return response




