# Auto-split from app_celery_postgres_step4_login.py
# Section: FLASK APPLICATION
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  FLASK APPLICATION
# ══════════════════════════════════════════════════════════════════════════════
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

bootstrap_runtime_services()
init_db()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

CORS(
    app,
    resources={r"/*": {"origins": FRONTEND_ORIGIN}},
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-ND-Background-Prefetch", "Authorization"],
    expose_headers=["Content-Disposition", "Content-Type", "Content-Length"],
    supports_credentials=True,
    max_age=86400,
)

@app.before_request
def enforce_sign_in():
    """Require a signed-in user for every request except sign up / sign in.

    There is no admin account anywhere in this backend — every request must
    come from a regular user who has registered and logged in. This runs
    before every route in every blueprint, so individual route files do not
    need to be modified one by one.
    """
    if request.method == "OPTIONS":
        return None  # let CORS preflight through untouched

    load_current_user_into_g()

    path = request.path.rstrip("/") or "/"
    if path in AUTH_PUBLIC_PATHS or path == "/celery/health":
        return None

    if not getattr(g, "user_id", None):
        return _json_error(
            "Please sign in or create an account to continue.",
            status=401,
            code="AUTH_REQUIRED",
        )
    return None


@app.after_request
def add_sse_cors_headers(response):
    # Keeps EventSource + JSON preflight responses consistent with flask-cors.
    origin = request.headers.get("Origin")
    if origin == FRONTEND_ORIGIN:
        response.headers["Access-Control-Allow-Origin"] = FRONTEND_ORIGIN
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-ND-Background-Prefetch, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response.headers["Access-Control-Expose-Headers"] = "Content-Disposition, Content-Type, Content-Length"
        response.headers["Vary"] = "Origin"
    return response


@app.get("/celery/health")
def celery_health():
    payload = {
        "ok": True,
        "enabled": ENABLE_CELERY,
        "celeryInstalled": Celery is not None,
        "brokerUrl": CELERY_BROKER_URL,
        "resultBackend": CELERY_RESULT_BACKEND,
        "taskAlwaysEager": CELERY_TASK_ALWAYS_EAGER,
        "redisStreamsEnabled": redis_enabled(),
        "note": "Celery worker is auto-started when AUTO_START_CELERY=1 and this app is launched directly. Docker Compose scripts are included for PostgreSQL and Redis.",
    }
    if celery_app is None:
        payload["ok"] = False if ENABLE_CELERY else True
        payload["message"] = "celery package not installed" if ENABLE_CELERY else "Celery disabled"
    return jsonify(payload)


@app.errorhandler(413)
def request_entity_too_large(_exc):
    return _json_error(
        f"Upload too large. Maximum allowed size is {MAX_UPLOAD_MB} MB.",
        status=413,
        code="UPLOAD_TOO_LARGE",
        maxUploadMb=MAX_UPLOAD_MB,
    )


@app.errorhandler(HTTPException)
def handle_http_exception(exc):
    status = int(getattr(exc, "code", 500) or 500)
    message = getattr(exc, "description", None) or getattr(exc, "name", None) or "HTTP error"
    return _json_error(message, status=status, code=f"HTTP_{status}", details=exc)


@app.errorhandler(ValueError)
def handle_value_error(exc):
    return _json_error(str(exc) or "Invalid request data.", status=400, code="VALIDATION_ERROR", details=exc)


@app.errorhandler(Exception)
def handle_unexpected_exception(exc):
    message, code, status = _friendly_error_message(exc)
    log.error(f"[api] Unhandled error request_id={_request_id()} path={request.path}: {type(exc).__name__}: {exc}")
    if LOG_ERROR_TRACEBACKS:
        log.error(traceback.format_exc())
    return _json_error(message, status=status, code=code, details=f"{type(exc).__name__}: {exc}")

app.register_blueprint(auth_bp)
app.register_blueprint(recordings_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(upload_bp)
app.register_blueprint(predictions_bp)
app.register_blueprint(redis_bp)
app.register_blueprint(rule_predictions_bp)
app.register_blueprint(annotations_bp)
app.register_blueprint(report_bp)
app.register_blueprint(rule_annotations_bp)
app.register_blueprint(db_bp)


if __name__ == "__main__":
    log.info(f"Frontend origin allowed: {FRONTEND_ORIGIN}")
    log.info(f"Max active jobs: {MAX_ACTIVE_JOBS} | job TTL: {JOB_TTL_SECONDS}s | keep finished jobs: {MAX_FINISHED_JOBS}")
    log.info(f"Upload folder: {os.path.abspath(UPLOAD_FOLDER)} | max upload: {MAX_UPLOAD_MB} MB")
    log.info(f"PostgreSQL database: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")
    log.info(f"Redis Streams enabled: {ENABLE_REDIS_STREAMS} | url: {REDIS_URL}")
    log.info(f"Celery enabled: {ENABLE_CELERY} | broker: {CELERY_BROKER_URL} | eager: {CELERY_TASK_ALWAYS_EAGER}")
    log.info(f"Final NeuroDecipher detection checkpoint: {NEURODECIPHER_DETECTION_CHECKPOINT_PATH}")
    log.info(f"Final NeuroDecipher classification checkpoint: {NEURODECIPHER_CLASSIFICATION_CHECKPOINT_PATH}")
    log.info(f"Detection scaler: {NEURODECIPHER_DETECTION_SCALER_PATH or 'auto scaler.pkl beside detection checkpoint'}")
    log.info(f"Classification scaler: {NEURODECIPHER_CLASSIFICATION_SCALER_PATH or 'auto scaler.pkl beside classification checkpoint'}")
    log.info(f"Final model window: {TIME_STEP_SIZE}s at {RESAMPLED_FREQ} Hz | rolling context={MODEL_SEQ_LEN} windows | graph={GRAPH_PARAMS}")
    app.run(host=os.environ.get("FLASK_HOST", "0.0.0.0"), debug=False, port=int(os.environ.get("PORT", "5000")), threaded=True)
