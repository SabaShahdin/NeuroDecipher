# Auto-split from app_celery_postgres_step4_login.py
# Section: VALIDATION — EEG FILE / SIGNAL SAFETY
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  VALIDATION — EEG FILE / SIGNAL SAFETY
# ══════════════════════════════════════════════════════════════════════════════
ALLOWED_EXTENSIONS = {"edf"}
MIN_CHANNELS = int(os.environ.get("MIN_EEG_CHANNELS", "1"))
MAX_CHANNELS = int(os.environ.get("MAX_EEG_CHANNELS", "512"))
MIN_SAMPLING_RATE = float(os.environ.get("MIN_EEG_SAMPLING_RATE", "1"))
MAX_SAMPLING_RATE = float(os.environ.get("MAX_EEG_SAMPLING_RATE", "5000"))
MAX_SIGNAL_SECONDS = float(os.environ.get("MAX_SIGNAL_SECONDS", str(24 * 3600)))
MAX_FRONTEND_SAMPLES_PER_CHANNEL = int(os.environ.get("MAX_FRONTEND_SAMPLES_PER_CHANNEL", "180000"))


def _validate_upload_file(file_storage) -> tuple[str, str]:
    if file_storage is None:
        raise ValueError("No file provided.")
    if not file_storage.filename:
        raise ValueError("Uploaded file has no filename.")
    safe_name = secure_filename(file_storage.filename)
    ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported format: .{ext or 'unknown'}. Please upload an .edf file.")
    return safe_name, ext


def _validate_signal_array(data, sampling_rate, channels=None, context="EEG signal"):
    arr = np.asarray(data)
    if arr.ndim != 2:
        raise ValueError(f"{context} must be 2-D with shape (channels, samples); got {arr.shape}.")
    n_channels, n_samples = arr.shape
    if not (MIN_CHANNELS <= n_channels <= MAX_CHANNELS):
        raise ValueError(f"{context} channel count {n_channels} outside allowed range {MIN_CHANNELS}-{MAX_CHANNELS}.")
    if n_samples <= 0:
        raise ValueError(f"{context} contains no samples.")
    sr = float(sampling_rate or 0)
    if not np.isfinite(sr) or not (MIN_SAMPLING_RATE <= sr <= MAX_SAMPLING_RATE):
        raise ValueError(f"{context} sampling rate {sampling_rate} is invalid.")
    duration = n_samples / sr
    if duration > MAX_SIGNAL_SECONDS:
        raise ValueError(f"{context} duration {duration:.1f}s exceeds MAX_SIGNAL_SECONDS={MAX_SIGNAL_SECONDS}.")
    if not np.all(np.isfinite(arr)):
        bad = int(np.size(arr) - np.isfinite(arr).sum())
        raise ValueError(f"{context} contains {bad} NaN/Inf values.")
    if channels is not None and len(channels) not in (0, n_channels):
        raise ValueError(f"{context} channel label count {len(channels)} does not match data channels {n_channels}.")
    return arr


def _sanitize_signal_for_display(data, max_samples=MAX_FRONTEND_SAMPLES_PER_CHANNEL):
    """Return a finite float32 signal capped for frontend transport."""
    arr = np.asarray(data, dtype=np.float32)
    if arr.shape[1] > max_samples:
        step = max(1, int(np.ceil(arr.shape[1] / max_samples)))
        arr = arr[:, ::step]
    return arr


