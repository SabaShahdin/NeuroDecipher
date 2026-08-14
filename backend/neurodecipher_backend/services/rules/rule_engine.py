# Auto-split from app_celery_postgres_step4_login.py
# Section: SERVICES — RULE ENGINE  (per-window detection)
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  SERVICES — RULE ENGINE  (per-window detection)
# ══════════════════════════════════════════════════════════════════════════════
def _safe_bandpass(data, fs, lo, hi, order=3):
    nyq = fs / 2
    lo  = max(0.1, lo)
    hi  = min(hi, nyq * 0.95)
    if lo >= hi:
        return data
    b, a = sp_signal.butter(order, [lo/nyq, hi/nyq], btype="band")
    if data.ndim == 1:
        return sp_signal.filtfilt(b, a, data)
    return sp_signal.filtfilt(b, a, data, axis=1)

def _bandpower_re(data, fs, lo, hi):
    return np.mean(_safe_bandpass(data, fs, lo, hi) ** 2, axis=1)

def _cross_channel_sync_re(data):
    analytic = sp_signal.hilbert(data, axis=1)
    phase    = np.angle(analytic)
    vals = []
    for i in range(data.shape[0]):
        for j in range(i + 1, data.shape[0]):
            vals.append(np.mean(np.cos(np.abs(phase[i] - phase[j]))))
    return float(np.mean(vals)) if vals else 0.0

def _rhythmic_continuity_re(data, fs):
    sig = data.mean(axis=0)
    sig = _safe_bandpass(sig, fs, 3, 25)
    env = np.abs(sp_signal.hilbert(sig))
    return float(np.std(env) / (np.mean(env) + 1e-12))

def _spike_slow_complex_re(data, fs):
    sig    = data.mean(axis=0)
    spike  = _safe_bandpass(sig, fs, 20, 70)
    spikes = np.where(np.abs(spike) > 4 * np.std(spike))[0]
    slow   = _bandpower_re(data, fs, 0.5, 4)
    return len(spikes) > 3 and np.mean(slow) > 1e-10

def _seizure_features_re(data, fs):
    return {
        "slow":       float(np.mean(_bandpower_re(data, fs, 0.5, 4))),
        "ictal":      float(np.mean(_bandpower_re(data, fs, 3, 25))),
        "sync":       _cross_channel_sync_re(data),
        "rhythm":     _rhythmic_continuity_re(data, fs),
        "spike_slow": _spike_slow_complex_re(data, fs),
    }

def _is_normal_re(data, fs):
    alpha = np.mean(_bandpower_re(data, fs, 8, 12))
    theta = np.mean(_bandpower_re(data, fs, 4, 7))
    delta = np.mean(_bandpower_re(data, fs, 0.5, 4))
    return (alpha / (theta + delta + 1e-12)) > 1.5 and np.std(data) < 80e-6

def _is_seizure_re(features):
    score = 0
    if features["rhythm"] < 0.7:                                     score += 1
    if features["sync"]   > 0.25:                                    score += 1
    if features["spike_slow"]:                                       score += 2
    if features["ictal"] / (features["slow"] + 1e-12) > 1.05:       score += 1
    return score >= 2

def classify_window(data, fs, t):
    features = _seizure_features_re(data, fs)
    if _is_seizure_re(features):
        return {
            "label":      "seizure",
            "prob":       0.9,
            "confidence": 0.9,
            "rules":      [{"id": "S1"}, {"id": "S2"}, {"id": "S5"}],
            "n_sz_rules": 3,
        }
    if _is_normal_re(data, fs):
        return {
            "label":      "bckg",
            "prob":       0.85,
            "confidence": 0.85,
            "rules":      [{"id": "B1"}, {"id": "B3"}],
            "n_sz_rules": 0,
        }
    return {
        "label":      "bckg",
        "prob":       0.6,
        "confidence": 0.6,
        "rules":      [{"id": "B2"}],
        "n_sz_rules": 0,
    }


