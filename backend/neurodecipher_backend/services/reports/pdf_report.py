# Auto-split from app_celery_postgres_step4_login.py
# Section: UTILS — PDF REPORT
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  UTILS — PDF REPORT
# ══════════════════════════════════════════════════════════════════════════════
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle,
        Paragraph, Spacer, HRFlowable, KeepTogether,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.graphics.shapes import Drawing, Line, String, Rect
    PDF_AVAILABLE = True
    log.info("[REPORT] reportlab loaded — PDF generation enabled.")
except ImportError:
    PDF_AVAILABLE = False
    log.warning("[REPORT] reportlab not installed — PDF disabled.")

# ── Palette ───────────────────────────────────────────────────────────────────
# Legacy PDF builder removed. The active phase-2 report builder is defined once near the report routes.




def _request_id() -> str:
    try:
        return request.headers.get("X-Request-ID") or request.headers.get("X-Correlation-ID") or uuid.uuid4().hex[:12]
    except Exception:
        return uuid.uuid4().hex[:12]


def _friendly_error_message(exc: Exception) -> tuple[str, str, int]:
    """Return (message, code, status) without leaking sensitive internals."""
    text = str(exc or "").strip()
    name = type(exc).__name__

    if isinstance(exc, ValueError):
        return text or "Invalid request data.", "VALIDATION_ERROR", 400
    if name in ("OperationalError", "InterfaceError") or "connection" in text.lower():
        return "Database or service connection failed. Please make sure PostgreSQL/Redis are running, then try again.", "SERVICE_UNAVAILABLE", 503
    if "Checkpoint not found" in text:
        return "Model checkpoint was not found. Set DETECTION_CHECKPOINT in .env and restart the backend.", "MODEL_CHECKPOINT_MISSING", 500
    if "Redis" in text or "stream" in text.lower():
        return "Live prediction stream failed. Please make sure Redis is running and restart the analysis.", "STREAM_ERROR", 503
    if "Celery" in text or "celery" in text:
        return "Background worker is not ready. Start the Celery worker and try again.", "CELERY_ERROR", 503
    return "An unexpected backend error occurred. Please check backend logs and try again.", "INTERNAL_ERROR", 500


def _error_payload(message: str, code: str = "ERROR", status: int = 500, details=None, **extra) -> dict:
    payload = {
        "error": message,
        "message": message,
        "code": code,
        "status": status,
        "requestId": _request_id(),
    }
    if SHOW_ERROR_DETAILS and details is not None:
        payload["details"] = str(details)
    payload.update(extra)
    return payload


def _json_error(message: str, status: int = 400, code: str = "REQUEST_ERROR", details=None, **extra):
    return jsonify(_error_payload(message, code=code, status=status, details=details, **extra)), status


def _json_exception(exc: Exception, fallback_message: str | None = None):
    message, code, status = _friendly_error_message(exc)
    if fallback_message:
        message = fallback_message
    return _json_error(message, status=status, code=code, details=f"{type(exc).__name__}: {exc}")


def _allowed_file(filename: str) -> bool:
    return bool(filename and "." in filename and filename.rsplit(".", 1)[-1].lower() in ALLOWED_EXTENSIONS)


def _unique_upload_path(filename: str) -> str:
    stem, ext = os.path.splitext(filename)
    safe_stem = secure_filename(stem) or "eeg_upload"
    safe_ext = ext.lower()
    return os.path.join(UPLOAD_FOLDER, f"{safe_stem}_{uuid.uuid4().hex[:10]}{safe_ext}")


