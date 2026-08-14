# Auto-split from app_celery_postgres_step4_login.py
# Section: SERVICES — RULE ANNOTATOR  (full-file annotation)
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  SERVICES — RULE ANNOTATOR  (full-file annotation)
# ══════════════════════════════════════════════════════════════════════════════
def run_rule_annotations(filepath, window_sec=12, fs_override=None):
    import mne
    raw  = mne.io.read_raw_edf(filepath, preload=True, verbose=False)
    fs   = fs_override or raw.info["sfreq"]
    data = raw.get_data()

    win = int(window_sec * fs)
    n   = data.shape[1] // win
    events = []

    for i in range(n):
        s   = i * win
        e   = s + win
        seg = data[:, s:e]
        t   = s / fs
        out = classify_window(seg, fs, t)
        events.append({
            "index": i,
            "start": t,
            "end":   e / fs,
            **out,
        })
    return events


