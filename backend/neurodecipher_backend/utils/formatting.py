# Auto-split from app_celery_postgres_step4_login.py
# Section: UTILS — FORMATTING
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  UTILS — FORMATTING
# ══════════════════════════════════════════════════════════════════════════════
def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def fmt_ts(ts: str) -> str:
    try:    return ts[:19].replace("T", "  ")
    except Exception: return str(ts)

def fmt_dur(start: float, end: float) -> str:
    total = end - start
    if total < 60: return f"{total:.1f} s"
    return f"{int(total // 60)}m {total % 60:.0f}s"

def fmt_time(t: float) -> str:
    t = max(0.0, t)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}" if h else f"{m:02d}:{s:05.2f}"


