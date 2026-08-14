# Auto-split from app_celery_postgres_step4_login.py
# Section: CONFIG / SETTINGS
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG / SETTINGS
# ══════════════════════════════════════════════════════════════════════════════
# Folder where the backend stages uploaded EDF/H5/HDF5 files for analysis.
# Important: the user may select a file from ANY folder in the browser. The
# browser sends bytes to Flask, and Flask saves a server-side copy here so the
# Celery worker can read it later. Keep this folder on the same machine/volume
# that runs both Flask and Celery. Use an absolute path in .env for production.
def _normalize_server_path(path_value: str | None, default_name: str) -> str:
    raw = (path_value or default_name or "uploads").strip().strip('"').strip("'")
    raw = os.path.expandvars(os.path.expanduser(raw))
    if not os.path.isabs(raw):
        raw = os.path.join(BASE_DIR, raw)
    return os.path.abspath(raw)

UPLOAD_FOLDER = _normalize_server_path(
    os.environ.get("NEURODECIPHER_UPLOAD_DIR") or os.environ.get("UPLOAD_FOLDER"),
    "neurodecipher_uploaded_files",
)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def resolve_recording_file_path(path: str | None) -> str:
    """Resolve an EEG file path robustly for Flask/Celery workers.

    This prevents failures when Flask and Celery have different working
    directories. It also makes old database records recoverable by checking the
    uploaded-file basename inside the configured server upload folder.
    """
    if not path:
        raise FileNotFoundError("No EEG file path was provided to the analysis worker.")

    raw = os.path.expandvars(os.path.expanduser(str(path).strip().strip('"').strip("'")))
    checked: list[str] = []

    def add_candidate(p: str | None):
        if not p:
            return
        p = os.path.abspath(os.path.expandvars(os.path.expanduser(str(p))))
        if p not in checked:
            checked.append(p)

    # 1) exact path first
    add_candidate(raw)

    # 2) if relative, try common roots used by Flask/Celery
    if not os.path.isabs(raw):
        for base in (UPLOAD_FOLDER, BASE_DIR, BACKEND_DIR, PROJECT_ROOT, os.getcwd()):
            add_candidate(os.path.join(base, raw))

    # 3) recover by basename in server-side upload folders
    base_name = os.path.basename(raw)
    if base_name:
        for base in (
            UPLOAD_FOLDER,
            os.path.join(BASE_DIR, "uploads"),
            os.path.join(BASE_DIR, "neurodecipher_uploaded_files"),
            os.path.join(BACKEND_DIR, "uploads"),
            os.path.join(BACKEND_DIR, "neurodecipher_uploaded_files"),
            os.path.join(os.getcwd(), "uploads"),
            os.path.join(os.getcwd(), "neurodecipher_uploaded_files"),
        ):
            add_candidate(os.path.join(base, base_name))

    for candidate in checked:
        if os.path.isfile(candidate):
            return candidate

    checked_preview = "\n".join(f"  - {p}" for p in checked[:20])
    more = "" if len(checked) <= 20 else f"\n  ... and {len(checked) - 20} more"
    raise FileNotFoundError(
        "Uploaded EEG file was not found by the analysis worker.\n"
        "The user can upload a file from any folder, but the backend must save "
        "a server-side copy before Celery analyzes it. Make sure Flask and "
        "Celery are using the same UPLOAD_FOLDER / NEURODECIPHER_UPLOAD_DIR and "
        "that cleanup did not delete the file before analysis.\n"
        f"Original path: {path}\nChecked paths:\n{checked_preview}{more}"
    )

STANDARD_CHANNELS = [
    "FP1", "FP2", "F3", "F4", "C3", "C4", "P3", "P4", "O1", "O2",
    "F7",  "F8",  "T3", "T4", "T5", "T6", "FZ", "CZ", "PZ",
]
NUM_NODES = len(STANDARD_CHANNELS)   # 19

# Final trained NeuroDecipher model configuration
# 4-second non-overlapping windows at 200 Hz -> 800 raw samples per window.
# The model predicts each current 4-second window using rolling 10-window context.
RESAMPLED_FREQ  = int(os.environ.get("NEURODECIPHER_RESAMPLED_FREQ", "200"))
TIME_STEP_SIZE  = int(os.environ.get("NEURODECIPHER_WINDOW_SECONDS", "4"))
TARGET_TIME_PTS = RESAMPLED_FREQ * TIME_STEP_SIZE
MODEL_SEQ_LEN   = int(os.environ.get("NEURODECIPHER_SEQ_LEN", "10"))

GRAPH_METHOD = "hybrid"
GRAPH_PARAMS = {
    "alpha": float(os.environ.get("NEURODECIPHER_GRAPH_ALPHA", "0.30")),
    "top_k": int(os.environ.get("NEURODECIPHER_TOP_K", "6")),
    "functional_method": os.environ.get("NEURODECIPHER_FUNCTIONAL_METHOD", "pearson"),
    "abs_connectivity": os.environ.get("NEURODECIPHER_ABS_CONNECTIVITY", "1").strip().lower() in ("1", "true", "yes", "on"),
}

BATCH_SIZE = 32
DETECTION_INT_TO_STR = {0: "bckg", 1: "seizure"}

# Final trained GCN-BiLSTM checkpoints used by the live system.
# IMPORTANT:
#   1) Detection checkpoint:      bckg vs seizure
#   2) Classification checkpoint: gnsz vs fnsz vs cpsz
#
# The previous one-checkpoint variable NEURODECIPHER_CHECKPOINT is intentionally
# NOT used by the live pipeline anymore. Use the two explicit paths below.
def _resolve_model_path(value: str | None, default_path: str) -> str:
    raw = (value or default_path or "").strip().strip('"').strip("'")
    raw = os.path.expandvars(os.path.expanduser(raw))
    if raw and not os.path.isabs(raw):
        raw = os.path.join(BASE_DIR, raw)
    return os.path.abspath(raw)

DEFAULT_NEURODECIPHER_DETECTION_CHECKPOINT = os.path.join(
    BASE_DIR, "detection", "checkpoints", "BEST_alpha_0.30_topk_6_meanmax.pth"
)
DEFAULT_NEURODECIPHER_CLASSIFICATION_CHECKPOINT = os.path.join(
    BASE_DIR, "classification", "checkpoints", "BEST_alpha_0.30_topk_6_meanmax.pth"
)

NEURODECIPHER_DETECTION_CHECKPOINT_PATH = _resolve_model_path(
    os.environ.get("NEURODECIPHER_DETECTION_CHECKPOINT")
    or os.environ.get("DETECTION_CHECKPOINT"),
    DEFAULT_NEURODECIPHER_DETECTION_CHECKPOINT,
)
NEURODECIPHER_CLASSIFICATION_CHECKPOINT_PATH = _resolve_model_path(
    os.environ.get("NEURODECIPHER_CLASSIFICATION_CHECKPOINT")
    or os.environ.get("CLASSIFICATION_CHECKPOINT"),
    DEFAULT_NEURODECIPHER_CLASSIFICATION_CHECKPOINT,
)

# Backwards-compatible aliases used by older dashboard/report routes.
CHECKPOINT_PATH = NEURODECIPHER_DETECTION_CHECKPOINT_PATH
CLASSIFICATION_CHECKPOINT = NEURODECIPHER_CLASSIFICATION_CHECKPOINT_PATH

REQUIRE_DETECTION_CHECKPOINT = os.environ.get("REQUIRE_DETECTION_CHECKPOINT", "1").strip().lower() in ("1", "true", "yes", "on")
REQUIRE_CLASSIFICATION_CHECKPOINT = os.environ.get("REQUIRE_CLASSIFICATION_CHECKPOINT", "1").strip().lower() in ("1", "true", "yes", "on")

# Separate scalers are supported because detection and classification may have
# been trained in different output folders. If a scaler path is empty, the engine
# automatically tries scaler.pkl beside that checkpoint, then falls back to
# per-file scaling.
NEURODECIPHER_DETECTION_SCALER_PATH = os.environ.get("NEURODECIPHER_DETECTION_SCALER", os.environ.get("DETECTION_SCALER", "")).strip() or None
NEURODECIPHER_CLASSIFICATION_SCALER_PATH = os.environ.get("NEURODECIPHER_CLASSIFICATION_SCALER", os.environ.get("CLASSIFICATION_SCALER", "")).strip() or None
NEURODECIPHER_INFERENCE_BATCH_SIZE = int(os.environ.get("NEURODECIPHER_INFERENCE_BATCH_SIZE", "32"))

# Detection decision threshold used by the live UI.
# IMPORTANT: accuracy/weighted-F1 can look good on imbalanced EEG data even when
# the detector is biased toward bckg. Keep this configurable and log probability
# summaries per file. Lower values increase seizure sensitivity; higher values
# reduce false positives.
def _env_float(name: str, default: str) -> float:
    try:
        return float(os.environ.get(name, default))
    except Exception:
        return float(default)

NEURODECIPHER_DETECTION_THRESHOLD = _env_float(
    "NEURODECIPHER_DETECTION_THRESHOLD",
    os.environ.get("DETECTION_THRESHOLD", "0.50"),
)
NEURODECIPHER_WARN_IF_NO_SEIZURE_MAX_PROB = _env_float(
    "NEURODECIPHER_WARN_IF_NO_SEIZURE_MAX_PROB",
    "0.20",
)

CLF_CLASSES    = ["gnsz", "fnsz", "cpsz"]
CLF_FULL_NAMES = {
    "gnsz": "Generalised Non-Specific Seizure",
    "fnsz": "Focal Non-Specific Seizure",
    "cpsz": "Complex Partial Seizure",
    "seiz": "Seizure (Subtype Unclear)",
}
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173").rstrip("/")

# ─────────────────────────────────────────────────────────────────────────────
#  AUTHENTICATION — user sign in / sign up (no admin role)
# ─────────────────────────────────────────────────────────────────────────────
# Every account created through /auth/register is a normal user. There is no
# separate admin login anywhere in this backend.
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "").strip()
if not JWT_SECRET_KEY:
    # Falls back to a per-process random secret so the app still boots, but this
    # means tokens stop working after a restart. Set JWT_SECRET_KEY in .env for
    # real deployments so logins persist across restarts.
    JWT_SECRET_KEY = uuid.uuid4().hex + uuid.uuid4().hex
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRES_HOURS = int(os.environ.get("JWT_EXPIRES_HOURS", "168"))  # 7 days
MIN_PASSWORD_LENGTH = int(os.environ.get("MIN_PASSWORD_LENGTH", "8"))
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "4096"))
MAX_ACTIVE_JOBS = int(os.environ.get("MAX_ACTIVE_JOBS", "1"))  # keep 1 for single GPU / demo stability
JOB_TTL_SECONDS = int(os.environ.get("JOB_TTL_SECONDS", "14400"))  # 4 hours after completion
MAX_FINISHED_JOBS = int(os.environ.get("MAX_FINISHED_JOBS", "20"))
DELETE_UPLOADS_ON_CLEANUP = os.environ.get("DELETE_UPLOADS_ON_CLEANUP", "0") == "1"
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@127.0.0.1:5433/neurodecipher",
).strip()
if DATABASE_URL.startswith("postgresql+psycopg2://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://", 1)
if not DATABASE_URL.lower().startswith(("postgresql://", "postgres://")):
    raise RuntimeError("DATABASE_URL must be a PostgreSQL DSN, e.g. postgresql://postgres:postgres@localhost:5432/neurodecipher")

# Production runtime defaults. Redis Streams and Celery are enabled by default.
# The bootstrap helper below can start Docker Compose services and a local Celery
# worker automatically when this file is started directly with Python.
REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")
ENABLE_REDIS_STREAMS = os.environ.get("ENABLE_REDIS_STREAMS", "1").strip().lower() in ("1", "true", "yes", "on")
REDIS_STREAM_TTL_SECONDS = int(os.environ.get("REDIS_STREAM_TTL_SECONDS", "86400"))
REDIS_SSE_BLOCK_MS = int(os.environ.get("REDIS_SSE_BLOCK_MS", "15000"))

ENABLE_CELERY = os.environ.get("ENABLE_CELERY", "1").strip().lower() in ("1", "true", "yes", "on")
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", REDIS_URL)
CELERY_TASK_ALWAYS_EAGER = os.environ.get("CELERY_TASK_ALWAYS_EAGER", "0").strip().lower() in ("1", "true", "yes", "on")

AUTO_START_INFRA = os.environ.get("AUTO_START_INFRA", "0").strip().lower() in ("1", "true", "yes", "on")
AUTO_START_CELERY = os.environ.get("AUTO_START_CELERY", "0").strip().lower() in ("1", "true", "yes", "on")
CELERY_AUTOSTART_LOG = os.environ.get("CELERY_AUTOSTART_LOG", os.path.join(BASE_DIR, "celery_worker.log"))

# Performance controls: publish SSE events before slow persistence work and reuse
# PostgreSQL connections so live predictions reach the frontend quickly.
ENABLE_DB_POOL = os.environ.get("ENABLE_DB_POOL", "1").strip().lower() in ("1", "true", "yes", "on")
DB_POOL_MINCONN = int(os.environ.get("DB_POOL_MINCONN", "1"))
DB_POOL_MAXCONN = int(os.environ.get("DB_POOL_MAXCONN", "8"))
STRICT_REDIS_STREAMING = os.environ.get("STRICT_REDIS_STREAMING", "1").strip().lower() in ("1", "true", "yes", "on")
REDIS_STREAM_MAXLEN = int(os.environ.get("REDIS_STREAM_MAXLEN", "200000"))
SHOW_ERROR_DETAILS = os.environ.get("SHOW_ERROR_DETAILS", "0").strip().lower() in ("1", "true", "yes", "on")
LOG_ERROR_TRACEBACKS = os.environ.get("LOG_ERROR_TRACEBACKS", "1").strip().lower() in ("1", "true", "yes", "on")
# Low latency live streaming: by default prediction rows are bulk-persisted
# after the live stream completes instead of blocking every SSE event on DB I/O.
PERSIST_PREDICTIONS_DURING_STREAM = os.environ.get("PERSIST_PREDICTIONS_DURING_STREAM", "0").strip().lower() in ("1", "true", "yes", "on")
BULK_PERSIST_PAGE_SIZE = int(os.environ.get("BULK_PERSIST_PAGE_SIZE", "500"))
# Subtype classification can be expensive. Keep it optional for fastest live detection.
ENABLE_LIVE_SUBTYPE_CLASSIFICATION = os.environ.get("ENABLE_LIVE_SUBTYPE_CLASSIFICATION", "1").strip().lower() in ("1", "true", "yes", "on")
PROGRESS_LOG_EVERY = max(1, int(os.environ.get("PROGRESS_LOG_EVERY", "25")))




def _host_port_from_url(url: str, default_port: int):
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.hostname or "localhost", int(parsed.port or default_port)
    except Exception:
        return "localhost", default_port


def _tcp_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _run_detached(cmd, cwd=None, log_file=None):
    try:
        stdout = subprocess.DEVNULL
        stderr = subprocess.DEVNULL
        if log_file:
            f = open(log_file, "ab")
            stdout = stderr = f
        flags = 0
        if os.name == "nt":
            flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
        return subprocess.Popen(cmd, cwd=cwd or BASE_DIR, stdout=stdout, stderr=stderr, stdin=subprocess.DEVNULL, creationflags=flags)
    except Exception as exc:
        log.warning(f"[bootstrap] Could not start {' '.join(map(str, cmd))}: {exc}")
        return None


def _try_start_docker_compose_services() -> bool:
    compose_path = os.path.join(BASE_DIR, "docker-compose.yml")
    if not os.path.exists(compose_path):
        return False
    for cmd in (["docker", "compose", "up", "-d", "postgres", "redis"], ["docker-compose", "up", "-d", "postgres", "redis"]):
        try:
            result = subprocess.run(cmd, cwd=BASE_DIR, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=90)
            if result.returncode == 0:
                log.info("[bootstrap] PostgreSQL and Redis requested through Docker Compose.")
                return True
            log.warning(f"[bootstrap] {' '.join(cmd)} failed: {result.stderr.strip()[:500]}")
        except FileNotFoundError:
            continue
        except Exception as exc:
            log.warning(f"[bootstrap] {' '.join(cmd)} failed: {exc}")
    return False


def _wait_for_port(name: str, host: str, port: int, seconds: int = 45) -> bool:
    deadline = time.time() + seconds
    while time.time() < deadline:
        if _tcp_open(host, port, timeout=1.0):
            log.info(f"[bootstrap] {name} is reachable at {host}:{port}")
            return True
        time.sleep(1)
    log.warning(f"[bootstrap] {name} is not reachable at {host}:{port}")
    return False


def _start_celery_worker_if_needed():
    if not (AUTO_START_CELERY and ENABLE_CELERY and celery_app is not None):
        return
    if os.environ.get("NEURODECIPHER_CELERY_CHILD") == "1":
        return
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        return
    module_name = os.path.splitext(os.path.basename(__file__))[0]
    env = os.environ.copy()
    env["NEURODECIPHER_CELERY_CHILD"] = "1"
    env.setdefault("ENABLE_CELERY", "1")
    env.setdefault("ENABLE_REDIS_STREAMS", "1")
    cmd = [sys.executable, "-m", "celery", "-A", f"{module_name}:celery_app", "worker", "--pool=solo", "--loglevel=INFO"]
    try:
        log_path = os.path.abspath(CELERY_AUTOSTART_LOG)
        f = open(log_path, "ab")
        flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        subprocess.Popen(cmd, cwd=BASE_DIR, env=env, stdout=f, stderr=f, stdin=subprocess.DEVNULL, creationflags=flags)
        log.info(f"[bootstrap] Celery worker auto-started. Log: {log_path}")
    except Exception as exc:
        log.warning(f"[bootstrap] Celery worker could not be auto-started: {exc}")


def bootstrap_runtime_services():
    """Best-effort local developer bootstrap for PostgreSQL, Redis and Celery.

    This removes the need to type separate Redis/Celery/PostgreSQL commands when
    Docker Desktop is available and docker-compose.yml is next to this file.
    In production, use system services or Docker Compose directly.
    """
    if not AUTO_START_INFRA:
        return
    pg_host, pg_port = _host_port_from_url(DATABASE_URL, 5432)
    redis_host, redis_port = _host_port_from_url(REDIS_URL, 6379)
    needs_pg = not _tcp_open(pg_host, pg_port, timeout=1.0)
    needs_redis = ENABLE_REDIS_STREAMS and not _tcp_open(redis_host, redis_port, timeout=1.0)
    if needs_pg or needs_redis:
        _try_start_docker_compose_services()
    _wait_for_port("PostgreSQL", pg_host, pg_port, seconds=60)
    if ENABLE_REDIS_STREAMS:
        _wait_for_port("Redis", redis_host, redis_port, seconds=60)
    _start_celery_worker_if_needed()




