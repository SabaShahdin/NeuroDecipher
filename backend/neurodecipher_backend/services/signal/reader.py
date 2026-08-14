# Auto-split from app_celery_postgres_step4_login.py
# Section: SERVICES — SIGNAL READER
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  SERVICES — SIGNAL READER
# ══════════════════════════════════════════════════════════════════════════════
_MAX_DISPLAY_SAMPLES = 180_000

def _downsample_for_display(data, times, sr, max_samples=_MAX_DISPLAY_SAMPLES):
    """Downsample signal for browser display and return the selected step.

    IMPORTANT: samplingRate remains the original EDF/H5 sampling rate for metadata.
    Frontend plotting must use the returned `times` array, because large files are
    downsampled for display and sample index no longer equals time * samplingRate.
    """
    step = 1
    if data.shape[1] > max_samples:
        import numpy as np
        step = max(1, int(np.ceil(data.shape[1] / float(max_samples))))
        data  = data[:, ::step]
        times = times[::step]
    return data, times, step

def read_signal_edf(path: str) -> dict:
    import mne
    raw   = mne.io.read_raw_edf(path, preload=True, verbose=False)
    sr    = int(raw.info["sfreq"])

    # Pick the 19 standard channels when available.  EDF channel labels are often
    # saved as "EEG FP1-REF", "FP1-LE", etc., so match by normalized labels but
    # keep the actual raw channel names for MNE picking.
    def _norm_ch(name):
        return (str(name).upper()
                .replace("EEG ", "")
                .replace("-REF", "")
                .replace("-LE", "")
                .replace("-AVG", "")
                .replace(" ", "")
                .strip())

    raw_name_by_norm = {_norm_ch(c): c for c in raw.ch_names}
    picked_raw_names = [raw_name_by_norm[c] for c in STANDARD_CHANNELS if c in raw_name_by_norm]
    display_names = [c for c in STANDARD_CHANNELS if c in raw_name_by_norm]

    if not picked_raw_names:
        picked_raw_names = raw.ch_names[:19]
        display_names = [str(c) for c in picked_raw_names]

    raw.pick(picked_raw_names)
    data, times = raw.get_data(return_times=True)
    data = _validate_signal_array(data, sr, display_names, context="EDF signal")
    data, times, display_step = _downsample_for_display(data, times, sr)
    data = _sanitize_signal_for_display(data)

    display_sr = float(sr) / float(max(1, display_step))
    duration = float(times[-1]) if len(times) else 0.0

    return {
        "channels": display_names,
        "times": times.tolist(),
        "data": data.tolist(),
        "samplingRate": sr,
        "originalSamplingRate": sr,
        "displaySamplingRate": display_sr,
        "displayDownsampleStep": int(display_step),
        "displaySampleCount": int(data.shape[1]),
        "duration": duration,
    }

def read_signal_h5(path: str) -> dict:
    import h5py
    import numpy as np
    with h5py.File(path, "r") as f:
        data = None
        for key in ("data", "resampled_signal", "signal", "signals", "eeg", "raw_signal"):
            if key in f:
                data = np.array(f[key], dtype=np.float32)
                break
        if data is None:
            raise KeyError(f"No EEG array found in H5. Keys: {list(f.keys())}")

        sr = None
        for key in ("sr", "sfreq", "sampling_rate", "resample_freq", "freq"):
            if key in f.attrs:
                sr = int(np.array(f.attrs[key]).item())
                break
            if key in f:
                sr = int(np.array(f[key]).item())
                break
        sr = int(sr or 256)

        chs = None
        for key in ("channels", "channel_names", "ch_names"):
            if key in f:
                chs = [x.decode() if isinstance(x, bytes) else str(x) for x in f[key]]
                break
        if chs is None:
            chs = STANDARD_CHANNELS[:data.shape[0]]

        # Prefer channels x samples for display.
        if data.ndim == 2 and data.shape[0] > data.shape[1] and data.shape[1] <= 512:
            data = data.T
        times = np.arange(data.shape[-1], dtype=np.float64) / float(sr)

    data = _validate_signal_array(data, sr, chs, context="H5 signal")
    data_d, times_d, display_step = _downsample_for_display(data, times, sr)
    data_d = _sanitize_signal_for_display(data_d)
    display_sr = float(sr) / float(max(1, display_step))
    duration = float(times_d[-1]) if len(times_d) else 0.0
    return {
        "channels": chs,
        "times": times_d.tolist(),
        "data": data_d.tolist(),
        "samplingRate": sr,
        "originalSamplingRate": sr,
        "displaySamplingRate": display_sr,
        "displayDownsampleStep": int(display_step),
        "displaySampleCount": int(data_d.shape[1]),
        "duration": duration,
    }

