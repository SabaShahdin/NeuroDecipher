# Auto-split from app_celery_postgres_step4_login.py
# Section: SERVICES — SEIZURE SUBTYPE RULES  (TUSZ v39 guidelines)
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  SERVICES — SEIZURE SUBTYPE RULES  (TUSZ v39 guidelines)
# ══════════════════════════════════════════════════════════════════════════════
_FRONTAL_IDXS  = [0, 1, 2, 3, 10, 11, 16]
_TEMPORAL_IDXS = [10, 11, 12, 13, 14, 15]

def _bp(data, fs, lo, hi, order=3):
    nyq = fs / 2.0
    lo  = max(0.1, float(lo))
    hi  = min(float(hi), nyq * 0.95)
    if lo >= hi: return data
    b, a = sp_signal.butter(order, [lo/nyq, hi/nyq], btype="band")
    return sp_signal.filtfilt(b, a, data, axis=-1)

def _bandpower(data, fs, lo, hi):
    return float(np.mean(_bp(data, fs, lo, hi) ** 2))

def _per_channel_bp(data, fs, lo, hi):
    return np.mean(_bp(data, fs, lo, hi) ** 2, axis=-1)

def _ch_count_above(data, fs, lo, hi, z=2.5):
    bp  = _per_channel_bp(data, fs, lo, hi)
    thr = np.mean(bp) + z * np.std(bp)
    return int(np.sum(bp > thr))

def _hf_power(data, fs):
    return _bandpower(data, fs, 30.0, 70.0)

def _plv_sync(data):
    analytic = sp_signal.hilbert(data, axis=-1)
    phase    = np.angle(analytic)
    vals = []
    for i in range(data.shape[0]):
        for j in range(i+1, data.shape[0]):
            vals.append(float(np.mean(np.cos(phase[i] - phase[j]))))
    return float(np.mean(vals)) if vals else 0.0

def _rhythm_cv(data, fs):
    sig = _bp(data.mean(axis=0), fs, 3.0, 25.0)
    env = np.abs(sp_signal.hilbert(sig))
    return float(np.std(env) / (np.mean(env) + 1e-12))

def _spike_slow_present(data, fs):
    hi = _bandpower(data, fs, 20.0, 70.0)
    lo = _bandpower(data, fs, 0.5,  4.0)
    return bool(hi > lo * 0.3 and lo > 1e-14)

def _spike_rate(data, fs):
    sig = _bp(data.mean(axis=0), fs, 20.0, 70.0)
    thr = 4.0 * np.std(sig)
    idx = np.where(np.abs(sig) > thr)[0]
    if len(idx) == 0: return 0.0
    min_gap  = int(0.05 * fs)
    n_spikes = 1 + int(np.sum(np.diff(idx) > min_gap))
    return float(n_spikes / max(data.shape[-1] / fs, 1e-6))

def _burst_periodicity(data, fs):
    sig    = data.mean(axis=0)
    env    = np.abs(sp_signal.hilbert(sig))
    nyq    = fs / 2.0
    hi_cut = min(3.0, nyq * 0.95)
    if hi_cut <= 0.5: return False
    b, a = sp_signal.butter(2, [0.5/nyq, hi_cut/nyq], btype="band")
    mod  = sp_signal.filtfilt(b, a, env)
    return bool(np.std(mod) > 0.3 * np.mean(env + 1e-12))

def _amp_flat(data, threshold_uv=15e-6):
    w = min(data.shape[-1] // 4, 512)
    return bool(np.std(data[:, :w]) < threshold_uv)

def _amp_evolution(data, fs):
    mid  = data.shape[-1] // 2
    filt = _bp(data, fs, 3.0, 25.0)
    rms_e = float(np.sqrt(np.mean(filt[:, :mid] ** 2)))
    rms_l = float(np.sqrt(np.mean(filt[:, mid:] ** 2)))
    return rms_l > 1.20 * rms_e

def _freq_evolution(data, fs):
    mid = data.shape[-1] // 2
    sig = data.mean(axis=0)
    def centroid(seg):
        freqs = np.fft.rfftfreq(len(seg), 1.0/fs)
        mask  = (freqs >= 2.0) & (freqs <= 25.0)
        spec  = np.abs(np.fft.rfft(seg)) ** 2
        return float(np.sum(freqs[mask] * spec[mask]) / (np.sum(spec[mask]) + 1e-12))
    return centroid(sig[:mid]) > centroid(sig[mid:]) * 1.10

def _three_hz_power(data, fs):
    return _bandpower(data, fs, 2.5, 4.5)

def _extract_subtype_features(data, fs):
    return {
        "slow":           _bandpower(data, fs, 0.5,  4.0),
        "ictal":          _bandpower(data, fs, 4.0, 30.0),
        "hf":             _hf_power(data, fs),
        "sync":           _plv_sync(data),
        "rhythm_cv":      _rhythm_cv(data, fs),
        "spike_slow":     _spike_slow_present(data, fs),
        "spike_rate":     _spike_rate(data, fs),
        "burst_periodic": _burst_periodicity(data, fs),
        "amp_flat":       _amp_flat(data),
        "amp_evolution":  _amp_evolution(data, fs),
        "freq_evolution": _freq_evolution(data, fs),
        "p_3hz":          _three_hz_power(data, fs),
    }

def _score_fnsz(data, fs, f, n_ch):
    s, r = 0, []
    if f["spike_slow"]:                                              s += 2; r.append("FN1")
    if f["rhythm_cv"] < 0.70:                                        s += 1; r.append("FN2")
    if f["ictal"] / (f["slow"] + 1e-12) > 1.05:                    s += 1; r.append("FN3")
    if f["amp_evolution"]:                                           s += 1; r.append("FN4")
    if f["freq_evolution"]:                                          s += 1; r.append("FN5")
    if _ch_count_above(data, fs, 3.0, 25.0) < max(1, int(0.5*n_ch)): s += 2; r.append("FN6")
    if 0.10 < f["sync"] < 0.70:                                     s += 1; r.append("FN7")
    return s, r

def _score_gnsz(data, fs, f, n_ch):
    s, r = 0, []
    if f["spike_slow"]:                                              s += 2; r.append("GN1")
    if f["rhythm_cv"] < 0.70:                                        s += 1; r.append("GN2")
    if f["ictal"] / (f["slow"] + 1e-12) > 1.05:                    s += 1; r.append("GN3")
    if f["amp_evolution"] or f["freq_evolution"]:                    s += 1; r.append("GN4")
    if _ch_count_above(data, fs, 3.0, 25.0) >= max(1, int(0.5*n_ch)): s += 2; r.append("GN5")
    if f["sync"] > 0.50:                                             s += 2; r.append("GN6")
    return s, r

def _score_cpsz(data, fs, f, n_ch):
    fnsz_s, fnsz_r = _score_fnsz(data, fs, f, n_ch)
    return fnsz_s, [rule.replace("FN", "CP") for rule in fnsz_r]

_SUBTYPE_THRESHOLDS = {"gnsz": 5, "fnsz": 4, "cpsz": 4}
_SUBTYPE_MAX        = {"gnsz": 9.0, "fnsz": 9.0, "cpsz": 11.0}
_SUBTYPE_PRIORITY   = ["gnsz", "fnsz", "cpsz"]

def classify_seizure_subtype_rules(
    data: np.ndarray,
    fs: float,
    clinical_report: Optional[str] = None,
) -> dict:
    if data.ndim != 2 or data.shape[0] == 0 or data.shape[1] == 0:
        raise ValueError(f"data must be 2-D (n_channels, n_samples); got {data.shape}.")

    n_ch = data.shape[0]
    f    = _extract_subtype_features(data, fs)

    raw = {
        "fnsz": _score_fnsz(data, fs, f, n_ch),
        "gnsz": _score_gnsz(data, fs, f, n_ch),
        "cpsz": _score_cpsz(data, fs, f, n_ch),
    }
    all_scores = {lbl: sc for lbl, (sc, _) in raw.items()}

    if clinical_report in ("cpsz", "fnsz"):
        sc, ru = raw[clinical_report]
        raw[clinical_report] = (sc + 2, ru + ["CP8" if clinical_report == "cpsz" else "FN8"])

    candidates = {
        lbl: (sc, ru)
        for lbl, (sc, ru) in raw.items()
        if sc >= _SUBTYPE_THRESHOLDS[lbl]
    }

    if not candidates:
        return {"label": "seiz", "confidence": 0.55,
                "rules": [{"id": "S_GENERIC"}], "scores": all_scores}

    best_label = max(candidates, key=lambda k: (candidates[k][0], -_SUBTYPE_PRIORITY.index(k)))
    best_score, best_rules = candidates[best_label]
    normalised = min(best_score / _SUBTYPE_MAX[best_label], 1.0)
    confidence = round(0.60 + 0.35 * normalised, 3)

    return {
        "label":      best_label,
        "confidence": confidence,
        "rules":      [{"id": r} for r in best_rules],
        "scores":     all_scores,
    }


