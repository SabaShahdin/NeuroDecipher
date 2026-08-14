# """
# Runtime inference engine for the final NeuroDecipher trained model.

# This module is intentionally self-contained so the backend does not depend on the
# training folder layout at prediction time.

# Expected trained model input:
#     X = (batch, 10, 19, 32)
#     A = (batch, 10, 19, 19)

# Raw uploaded EEG is converted to:
#     rolling 10-window sequences of non-overlapping 4-second windows
#     each 4-second window = 800 samples at 200 Hz

# For a 10-window context, the first prediction is for 36-40 s, then every 4 s.
# """
# from __future__ import annotations
from __future__ import annotations

import math
import os
import pickle
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
import logging
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import logging

log = logging.getLogger(__name__)

try:
    from sklearn.preprocessing import StandardScaler
except Exception:  # pragma: no cover
    StandardScaler = None  # type: ignore

"""
Runtime inference engine for the final NeuroDecipher trained model.

This module is intentionally self-contained so the backend does not depend on the
training folder layout at prediction time.

Expected trained model input:
    X = (batch, 10, 19, 32)
    A = (batch, 10, 19, 19)

Raw uploaded EEG is converted to:
    rolling 10-window sequences of non-overlapping 4-second windows
    each 4-second window = 800 samples at 200 Hz

For a 10-window context, the first prediction is for 36-40 s, then every 4 s.
"""

STANDARD_19_CHANNELS = [
    "FP1", "FP2", "F3", "F4", "C3", "C4", "P3", "P4", "O1", "O2",
    "F7", "F8", "T3", "T4", "T5", "T6", "FZ", "CZ", "PZ",
]

CLF_FULL_NAMES = {
    "gnsz": "Generalised Non-Specific Seizure",
    "fnsz": "Focal Non-Specific Seizure",
    "cpsz": "Complex Partial Seizure",
    "bckg": "Background / Non-Seizure",
    "seizure": "Seizure",
}

ELECTRODE_POSITIONS: Dict[str, Tuple[float, float]] = {
    "FP1": (-0.45, 1.00), "FP2": (0.45, 1.00),
    "F7": (-1.00, 0.55), "F3": (-0.45, 0.55), "FZ": (0.00, 0.62), "F4": (0.45, 0.55), "F8": (1.00, 0.55),
    "T3": (-1.05, 0.00), "T7": (-1.05, 0.00), "C3": (-0.45, 0.00), "CZ": (0.00, 0.00), "C4": (0.45, 0.00), "T4": (1.05, 0.00), "T8": (1.05, 0.00),
    "T5": (-1.00, -0.55), "P7": (-1.00, -0.55), "P3": (-0.45, -0.55), "PZ": (0.00, -0.62), "P4": (0.45, -0.55), "T6": (1.00, -0.55), "P8": (1.00, -0.55),
    "O1": (-0.45, -1.00), "O2": (0.45, -1.00),
}


def normalize_channel_name(name: str) -> str:
    n = str(name or "").strip().upper()
    n = re.sub(r"^EEG\s+", "", n)
    n = re.sub(r"\s+", "", n)
    n = re.sub(r"[-_](REF|LE|AVG|CZ|A1|A2)$", "", n)
    n = n.replace("-", "").replace("_", "")
    aliases = {
        "FPZ": "FPZ",
        "T7": "T3",
        "T8": "T4",
        "P7": "T5",
        "P8": "T6",
        "FZREF": "FZ",
        "CZREF": "CZ",
        "PZREF": "PZ",
    }
    return aliases.get(n, n)


def _safe_float_array(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    x = np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)
    return x.astype(np.float32, copy=False)


def _resample_signal_if_needed(signal: np.ndarray, src_fs: int, target_fs: int) -> np.ndarray:
    signal = _safe_float_array(signal)
    src_fs = int(round(float(src_fs)))
    target_fs = int(round(float(target_fs)))
    if src_fs == target_fs:
        return signal
    if src_fs <= 0 or target_fs <= 0:
        raise ValueError(f"Invalid sampling rate: src_fs={src_fs}, target_fs={target_fs}")
    try:
        from scipy.signal import resample_poly
        g = math.gcd(src_fs, target_fs)
        up = target_fs // g
        down = src_fs // g
        return resample_poly(signal, up=up, down=down, axis=1).astype(np.float32)
    except Exception:
        # Fallback to FFT resampling if scipy polyphase fails.
        from scipy.signal import resample
        n_target = int(round(signal.shape[1] * target_fs / src_fs))
        return resample(signal, n_target, axis=1).astype(np.float32)


def _order_to_standard_channels(signal: np.ndarray, channel_names: Sequence[str], num_nodes: int = 19) -> Tuple[np.ndarray, List[str], int]:
    signal = _safe_float_array(signal)
    normalised = [normalize_channel_name(c) for c in channel_names]
    ordered = np.zeros((num_nodes, signal.shape[1]), dtype=np.float32)
    matched = 0
    for dst_idx, ch in enumerate(STANDARD_19_CHANNELS[:num_nodes]):
        if ch in normalised:
            src_idx = normalised.index(ch)
            ordered[dst_idx] = signal[src_idx]
            matched += 1
    if matched == 0:
        n_use = min(num_nodes, signal.shape[0])
        ordered[:n_use] = signal[:n_use]
    return ordered, STANDARD_19_CHANNELS[:num_nodes], matched


# Typical scalp EEG amplitude, expressed in volts (MNE's native unit for
# raw.get_data()). Real scalp EEG lives roughly in the 1 uV - 500 uV range,
# i.e. 1e-6 - 5e-4 V of *median absolute* sample amplitude. Training H5 files
# were built from EDFs read the same way, so a training-distribution file's
# median |amplitude| should sit inside (or very near) this band. If a new
# upload comes back orders of magnitude outside this band, the EDF header's
# physical_min/physical_max/units almost certainly disagree with what MNE
# assumed, and every downstream feature (band power, variance, etc.) will be
# silently wrong even though the pipeline "runs fine" and channel names match.
EXPECTED_EEG_VOLT_LOW = float(os.environ.get("NEURODECIPHER_EEG_VOLT_LOW", "1e-7"))
EXPECTED_EEG_VOLT_HIGH = float(os.environ.get("NEURODECIPHER_EEG_VOLT_HIGH", "2e-3"))
# When enabled, if the recording's amplitude is off by roughly a clean power
# of ten from the expected band, rescale it back into range instead of just
# warning. This fixes the extremely common "EDF exported in the wrong unit"
# case (V vs mV vs uV mislabeling) without touching the model or thresholds.
AUTO_FIX_AMPLITUDE_SCALE = os.environ.get("NEURODECIPHER_AUTO_FIX_AMPLITUDE_SCALE", "1").strip().lower() in ("1", "true", "yes", "on")


def _diagnose_and_fix_amplitude_scale(data: np.ndarray, job_tag: str = "") -> np.ndarray:
    """Log per-channel amplitude stats and correct obvious unit-scale bugs.

    Returns (possibly rescaled) data. Only ever applies a power-of-ten
    correction, and only when AUTO_FIX_AMPLITUDE_SCALE is enabled - it will
    never "fix" a file that is merely noisy or has a few bad channels.
    """
    data = _safe_float_array(data)
    if data.size == 0:
        return data

    per_channel_std = data.std(axis=1)
    per_channel_ptp = data.max(axis=1) - data.min(axis=1)
    flat_channels = int(np.sum(per_channel_std < 1e-9))
    median_abs = float(np.median(np.abs(data)))
    median_std = float(np.median(per_channel_std))

    log.info(
        f"[{job_tag}] Amplitude diagnostic | median|x|={median_abs:.3e} median_std={median_std:.3e} "
        f"min_std={per_channel_std.min():.3e} max_std={per_channel_std.max():.3e} "
        f"median_ptp={float(np.median(per_channel_ptp)):.3e} flat_channels={flat_channels}/{data.shape[0]}"
    )

    if flat_channels > 0:
        log.warning(
            f"[{job_tag}] {flat_channels}/{data.shape[0]} channel(s) are effectively flat "
            f"(std < 1e-9) - likely disconnected electrodes or a bad export for those channels."
        )

    reference = median_std if median_std > 0 else median_abs
    if reference <= 0:
        return data

    if EXPECTED_EEG_VOLT_LOW <= reference <= EXPECTED_EEG_VOLT_HIGH:
        return data  # amplitude looks like normal scalp EEG in volts, nothing to do

    # Estimate how many powers of ten we're off by from the expected band.
    band_mid = math.sqrt(EXPECTED_EEG_VOLT_LOW * EXPECTED_EEG_VOLT_HIGH)
    exponent = round(math.log10(band_mid / reference))
    log.warning(
        f"[{job_tag}] Recording amplitude looks out of range for scalp EEG in volts "
        f"(median_std={reference:.3e}, expected {EXPECTED_EEG_VOLT_LOW:.0e}-{EXPECTED_EEG_VOLT_HIGH:.0e}). "
        f"This usually means the EDF header's physical units/calibration differ from training data "
        f"and will silently corrupt every downstream feature."
    )
    if AUTO_FIX_AMPLITUDE_SCALE and exponent != 0 and abs(exponent) <= 6:
        factor = 10.0 ** exponent
        data = (data * factor).astype(np.float32)
        log.warning(
            f"[{job_tag}] Auto-corrected amplitude scale by 10^{exponent} "
            f"(set NEURODECIPHER_AUTO_FIX_AMPLITUDE_SCALE=0 to disable this)."
        )
    return data


def read_uploaded_eeg_for_model(path: str, target_fs: int = 200, num_nodes: int = 19) -> Tuple[np.ndarray, int, List[str], int]:
    """Read EDF/H5/HDF5 as (19, samples) float32 at target_fs."""
    path = str(path)
    ext = os.path.splitext(path)[1].lower()
    job_tag = os.path.basename(path)

    if ext == ".edf":
        import mne
        raw = mne.io.read_raw_edf(path, preload=True, verbose=False)
        src_fs = int(round(float(raw.info["sfreq"])))
        channel_names = list(raw.ch_names)

        # Montage/reference diagnostic. normalize_channel_name() strips
        # suffixes like -REF / -LE / -AVG so "FP1-REF" and "FP1-LE" both
        # become "FP1" - but those are DIFFERENT reference montages (common
        # in TUH-style corpora: 01_tcp_ar='-REF', 02_tcp_le='-LE', etc.), so
        # the actual voltage values are not interchangeable even though the
        # anatomical position is the same. Log the raw suffixes seen so a
        # montage mismatch between this file and the training data is
        # visible instead of silently producing shifted features.
        raw_suffixes = sorted(set(
            m.group(1) for m in (re.search(r"[-_](REF|LE|AVG|A1|A2)$", str(c).strip().upper()) for c in channel_names) if m
        ))
        log.info(f"[{job_tag}] Channel montage diagnostic | raw_names_sample={channel_names[:5]} detected_reference_suffixes={raw_suffixes or 'NONE'}")
        if len(raw_suffixes) > 1:
            log.warning(
                f"[{job_tag}] Multiple different reference suffixes found in one file ({raw_suffixes}) - "
                f"channels may be mixed-montage."
            )

        data = raw.get_data().astype(np.float32)
        data = _diagnose_and_fix_amplitude_scale(data, job_tag=job_tag)
        data = _resample_signal_if_needed(data, src_fs, target_fs)
        ordered, ordered_names, matched = _order_to_standard_channels(data, channel_names, num_nodes=num_nodes)
        return ordered, int(target_fs), ordered_names, matched

    if ext in {".h5", ".hdf5"}:
        import h5py
        with h5py.File(path, "r") as f:
            signal = None
            for key in ("resampled_signal", "data", "signal", "signals", "eeg", "raw_signal"):
                if key in f:
                    signal = np.asarray(f[key], dtype=np.float32)
                    break
            if signal is None:
                raise KeyError(f"No EEG signal array found in H5. Keys: {list(f.keys())}")

            fs = None
            for key in ("resample_freq", "sampling_rate", "sfreq", "sr", "freq"):
                if key in f.attrs:
                    fs = int(np.asarray(f.attrs[key]).item())
                    break
                if key in f:
                    fs = int(np.asarray(f[key]).item())
                    break
            src_fs = int(fs or target_fs)

            channel_names = None
            for key in ("channel_names", "channels", "ch_names"):
                if key in f:
                    raw_names = list(f[key])
                    channel_names = [x.decode() if isinstance(x, bytes) else str(x) for x in raw_names]
                    break
            if channel_names is None:
                channel_names = [f"CH{i}" for i in range(signal.shape[0])]

        if signal.ndim != 2:
            raise ValueError(f"Expected 2D H5 signal, got shape={signal.shape}")
        # Prefer channels x samples. If transposed, fix it.
        if signal.shape[0] > signal.shape[1] and signal.shape[1] <= 512:
            signal = signal.T
        # Diagnostics only here (no auto-fix): H5 files are normally already
        # in training-converted form, so silently rescaling them would be
        # more likely to hide a real bug than fix one.
        per_channel_std = _safe_float_array(signal).std(axis=1)
        log.info(
            f"[{job_tag}] H5 amplitude diagnostic | median_std={float(np.median(per_channel_std)):.3e} "
            f"min_std={per_channel_std.min():.3e} max_std={per_channel_std.max():.3e}"
        )
        data = _resample_signal_if_needed(signal, src_fs, target_fs)
        ordered, ordered_names, matched = _order_to_standard_channels(data, channel_names, num_nodes=num_nodes)
        return ordered, int(target_fs), ordered_names, matched

    raise ValueError(f"Unsupported EEG file extension: {ext}. Use EDF, H5, or HDF5.")


def make_rolling_4s_sequences(
    signal_19: np.ndarray,
    fs: int = 200,
    window_seconds: int = 4,
    seq_len: int = 10,
) -> Dict[str, np.ndarray | list | int | float]:
    """
    Convert a full recording into rolling 10-window sequences.

    Returns X shape (num_predictions, seq_len, 19, 800), where prediction i is
    assigned to the current/latest 4-second window X[i, -1].
    """
    signal_19 = _safe_float_array(signal_19)
    fs = int(fs)
    window_samples = int(window_seconds * fs)
    if window_samples <= 0:
        raise ValueError("window_samples must be positive")
    total_samples = int(signal_19.shape[1])
    n_windows = total_samples // window_samples
    if n_windows < seq_len:
        duration = total_samples / max(fs, 1)
        raise RuntimeError(
            f"Recording is too short for rolling context: {duration:.1f}s available, "
            f"need at least {seq_len * window_seconds}s for seq_len={seq_len}."
        )

    windows = []
    win_start_times = []
    win_stop_times = []
    for w in range(n_windows):
        s = w * window_samples
        e = s + window_samples
        windows.append(signal_19[:, s:e])
        win_start_times.append(round(s / fs, 3))
        win_stop_times.append(round(e / fs, 3))
    windows = np.stack(windows, axis=0).astype(np.float32)  # (W,19,800)

    sequences = []
    pred_start_times = []
    pred_stop_times = []
    context_start_times = []
    context_stop_times = []
    current_window_indices = []
    for current_w in range(seq_len - 1, n_windows):
        first_w = current_w - seq_len + 1
        sequences.append(windows[first_w:current_w + 1])
        pred_start_times.append(win_start_times[current_w])
        pred_stop_times.append(win_stop_times[current_w])
        context_start_times.append(win_start_times[first_w])
        context_stop_times.append(win_stop_times[current_w])
        current_window_indices.append(current_w)

    X = np.stack(sequences, axis=0).astype(np.float32)
    return {
        "X": X,
        "windows": windows,
        "start_times": pred_start_times,
        "stop_times": pred_stop_times,
        "context_start_times": context_start_times,
        "context_stop_times": context_stop_times,
        "current_window_indices": current_window_indices,
        "n_raw_windows": int(n_windows),
        "n_predictions": int(X.shape[0]),
        "window_seconds": int(window_seconds),
        "window_samples": int(window_samples),
        "seq_len": int(seq_len),
        "fs": int(fs),
    }


class FeatureBuilder:
    BANDS = {
        "delta": (1.0, 4.0),
        "theta": (4.0, 8.0),
        "alpha": (8.0, 13.0),
        "beta": (13.0, 30.0),
        "gamma": (30.0, 70.0),
    }

    def __init__(
        self,
        fs: int = 200,
        feature_input_mode: str = "raw",
        keep_original: bool = False,
        with_bandpower: bool = True,
        with_entropy: bool = True,
        with_shapes: bool = True,
        with_complexity: bool = True,
        with_time: bool = True,
        with_connectivity: bool = False,
        target_feature_dim: Optional[int] = None,
    ):
        self.fs = int(fs)
        self.feature_input_mode = str(feature_input_mode).lower().strip()
        self.keep_original = bool(keep_original)
        self.with_bandpower = bool(with_bandpower)
        self.with_entropy = bool(with_entropy)
        self.with_shapes = bool(with_shapes)
        self.with_complexity = bool(with_complexity)
        self.with_time = bool(with_time)
        self.with_connectivity = bool(with_connectivity)
        self.target_feature_dim = int(target_feature_dim) if target_feature_dim is not None else None

    @staticmethod
    def _safe_stats(x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype=np.float32)
        mean = x.mean(axis=-1, keepdims=True)
        centered = x - mean
        var = np.mean(centered ** 2, axis=-1, keepdims=True)
        std = np.sqrt(var + 1e-12)
        skew = np.mean((centered / std) ** 3, axis=-1, keepdims=True)
        kurt = np.mean((centered / std) ** 4, axis=-1, keepdims=True)
        energy = np.mean(x ** 2, axis=-1, keepdims=True)
        return np.concatenate([mean, var, std, skew, kurt, energy], axis=-1).astype(np.float32)

    @staticmethod
    def _training_time_features_34(x: np.ndarray) -> np.ndarray:
        """Time-domain feature group used by the training FeatureBuilder.

        This returns 13 features per node. Combined with the spectral groups
        (13 bandpower + 1 entropy + 6 shape + 1 complexity), the total node
        feature dimension becomes 34. This is required for the detection
        checkpoint when its first GCN layer expects 34 input features.
        """
        x = np.asarray(x, dtype=np.float32)
        x = np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)
        eps = 1e-8
        mean = np.mean(x, axis=-1, keepdims=True)
        centered = x - mean
        var = np.var(x, axis=-1, keepdims=True)
        std = np.sqrt(var + eps)
        min_v = np.min(x, axis=-1, keepdims=True)
        max_v = np.max(x, axis=-1, keepdims=True)
        amp_range = max_v - min_v
        energy = np.mean(x * x, axis=-1, keepdims=True)
        line_length = np.mean(np.abs(np.diff(x, axis=-1)), axis=-1, keepdims=True)
        zcr = np.mean((x[..., 1:] * x[..., :-1]) < 0, axis=-1, keepdims=True).astype(np.float32)
        skew = np.mean((centered / np.maximum(std, eps)) ** 3, axis=-1, keepdims=True)
        kurt = np.mean((centered / np.maximum(std, eps)) ** 4, axis=-1, keepdims=True)
        dx = np.diff(x, axis=-1)
        ddx = np.diff(dx, axis=-1) if dx.shape[-1] > 1 else dx
        var_dx = np.var(dx, axis=-1, keepdims=True) if dx.shape[-1] > 0 else np.zeros_like(var)
        var_ddx = np.var(ddx, axis=-1, keepdims=True) if ddx.shape[-1] > 0 else np.zeros_like(var)
        mobility = np.sqrt(var_dx / np.maximum(var, eps))
        mobility_dx = np.sqrt(var_ddx / np.maximum(var_dx, eps))
        complexity = mobility_dx / np.maximum(mobility, eps)
        return np.concatenate([
            mean, std, var, min_v, max_v, amp_range, energy, line_length,
            zcr, skew, kurt, mobility, complexity,
        ], axis=-1).astype(np.float32)

    @staticmethod
    def _hjorth_features(x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype=np.float32)
        dx = np.diff(x, axis=-1)
        ddx = np.diff(dx, axis=-1)
        var0 = np.var(x, axis=-1, keepdims=True) + 1e-12
        var1 = np.var(dx, axis=-1, keepdims=True) + 1e-12
        var2 = np.var(ddx, axis=-1, keepdims=True) + 1e-12
        activity = var0
        mobility = np.sqrt(var1 / var0)
        complexity = np.sqrt(var2 / var1) / np.maximum(mobility, 1e-12)
        return np.concatenate([activity, mobility, complexity], axis=-1).astype(np.float32)

    @staticmethod
    def _line_length_zcr(x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype=np.float32)
        dx = np.diff(x, axis=-1)
        line_length = np.sum(np.abs(dx), axis=-1, keepdims=True) / max(1, x.shape[-1] - 1)
        signs = np.signbit(x)
        zcr = np.mean(signs[..., 1:] != signs[..., :-1], axis=-1, keepdims=True)
        return np.concatenate([line_length, zcr], axis=-1).astype(np.float32)

    def _permutation_entropy_nodes(self, x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype=np.float32)
        if x.shape[-1] < 4:
            return np.zeros((x.shape[0], 1), dtype=np.float32)
        try:
            windows = np.lib.stride_tricks.sliding_window_view(x, window_shape=3, axis=-1)
            orders = np.argsort(windows, axis=-1, kind="mergesort")
            codes = orders[..., 0] * 9 + orders[..., 1] * 3 + orders[..., 2]
            out = []
            for row in codes:
                _vals, counts = np.unique(row, return_counts=True)
                p = counts.astype(np.float64) / max(counts.sum(), 1)
                ent = -np.sum(p * np.log(p + 1e-12)) / np.log(math.factorial(3))
                out.append([float(ent)])
            return np.asarray(out, dtype=np.float32)
        except Exception:
            return np.zeros((x.shape[0], 1), dtype=np.float32)

    def _power_from_raw(self, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        x = np.asarray(x, dtype=np.float32)
        x_centered = x - x.mean(axis=-1, keepdims=True)
        spec = np.fft.rfft(x_centered, axis=-1)
        power = (np.abs(spec) ** 2) / max(1, x.shape[-1])
        freqs = np.fft.rfftfreq(x.shape[-1], d=1.0 / self.fs)
        power = np.maximum(power.astype(np.float32), 1e-12)
        return power, freqs.astype(np.float32)

    def _band_mask(self, freqs: np.ndarray, lo: float, hi: float) -> np.ndarray:
        return (freqs >= float(lo)) & (freqs < float(hi))

    def _bandpower_features(self, power: np.ndarray, freqs: np.ndarray) -> np.ndarray:
        bps = []
        for _, (lo, hi) in self.BANDS.items():
            mask = self._band_mask(freqs, lo, hi)
            if not np.any(mask):
                bps.append(np.zeros((power.shape[0], 1), dtype=np.float32))
            else:
                bps.append(power[:, mask].sum(axis=-1, keepdims=True).astype(np.float32))
        total = power[:, freqs >= 1.0].sum(axis=-1, keepdims=True).astype(np.float32)
        total = np.maximum(total, 1e-12)
        rel = [bp / total for bp in bps]
        alpha = bps[2]
        theta = bps[1]
        beta = bps[3]
        ratio_alpha_theta = alpha / np.maximum(theta, 1e-12)
        ratio_beta_alpha = beta / np.maximum(alpha, 1e-12)
        return np.concatenate(bps + [total] + rel + [ratio_alpha_theta, ratio_beta_alpha], axis=-1).astype(np.float32)

    @staticmethod
    def _spectral_entropy(power: np.ndarray) -> np.ndarray:
        p = np.asarray(power, dtype=np.float32)
        p = np.maximum(p, 1e-12)
        p = p / np.maximum(p.sum(axis=-1, keepdims=True), 1e-12)
        ent = -(p * np.log(p + 1e-12)).sum(axis=-1, keepdims=True)
        ent = ent / np.log(max(p.shape[-1], 2))
        return ent.astype(np.float32)

    @staticmethod
    def _spectral_shape_features(power: np.ndarray, freqs: np.ndarray) -> np.ndarray:
        p = np.asarray(power, dtype=np.float32)
        f = np.asarray(freqs, dtype=np.float32).reshape(1, -1)
        p = np.maximum(p, 1e-12)
        psum = np.maximum(p.sum(axis=-1, keepdims=True), 1e-12)
        centroid = (p * f).sum(axis=-1, keepdims=True) / psum
        spread = np.sqrt(((f - centroid) ** 2 * p).sum(axis=-1, keepdims=True) / psum + 1e-12)
        skew = (((f - centroid) / np.maximum(spread, 1e-12)) ** 3 * p).sum(axis=-1, keepdims=True) / psum
        kurt = (((f - centroid) / np.maximum(spread, 1e-12)) ** 4 * p).sum(axis=-1, keepdims=True) / psum
        cumsum = np.cumsum(p, axis=-1)
        threshold = 0.85 * psum
        roll_idx = (cumsum >= threshold).argmax(axis=-1)
        rolloff = freqs[np.clip(roll_idx, 0, len(freqs) - 1)].reshape(-1, 1).astype(np.float32)
        flatness = np.exp(np.mean(np.log(p + 1e-12), axis=-1, keepdims=True)) / (np.mean(p, axis=-1, keepdims=True) + 1e-12)
        return np.concatenate([centroid, spread, skew, kurt, rolloff, flatness], axis=-1).astype(np.float32)

    def _adapt_feature_dim_if_needed(self, node_features: np.ndarray) -> np.ndarray:
        """Final safety adapter for 32/34 feature checkpoints.

        Normal path:
          - classification checkpoint expects 32 -> runtime builds 32
          - detection checkpoint expects 34 -> runtime builds 34

        If an older checkpoint/scaler combination reaches this point with a
        small 32/34 difference, adapt deterministically instead of crashing.
        """
        target = self.target_feature_dim
        if target is None:
            return node_features
        current = int(node_features.shape[-1])
        target = int(target)
        if current == target:
            return node_features
        if {current, target}.issubset({32, 34}):
            if current < target:
                pad = np.zeros(node_features.shape[:-1] + (target - current,), dtype=node_features.dtype)
                return np.concatenate([node_features, pad], axis=-1).astype(np.float32)
            return node_features[..., :target].astype(np.float32)
        return node_features

    def build(self, X: np.ndarray) -> np.ndarray:
        X = np.asarray(X, dtype=np.float32)
        if X.ndim != 4:
            raise ValueError(f"FeatureBuilder expected X=(N,seq_len,19,800), got {X.shape}")
        N, seq_len, num_nodes, _F = X.shape
        features_all = []
        for n in range(N):
            seq_features = []
            for t in range(seq_len):
                x_node = X[n, t].astype(np.float32)
                power, freqs = self._power_from_raw(x_node)
                parts = []
                if self.keep_original:
                    parts.append(x_node)
                if self.with_bandpower:
                    parts.append(self._bandpower_features(power, freqs))
                if self.with_entropy:
                    parts.append(self._spectral_entropy(power))
                if self.with_shapes:
                    parts.append(self._spectral_shape_features(power, freqs))
                if self.with_complexity:
                    parts.append(self._permutation_entropy_nodes(x_node))
                if self.with_time:
                    if self.target_feature_dim == 34:
                        # Detection checkpoint was trained with the AI/data/scripts/features.py
                        # time-domain block: 13 time features, total node dim=34.
                        parts.append(self._training_time_features_34(x_node))
                    else:
                        # Classification checkpoint was trained with the compact runtime block:
                        # 11 time features, total node dim=32.
                        parts.append(self._hjorth_features(x_node))
                        parts.append(self._line_length_zcr(x_node))
                        parts.append(self._safe_stats(x_node))
                node_features = np.concatenate(parts, axis=-1)
                node_features = np.nan_to_num(node_features, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)
                node_features = self._adapt_feature_dim_if_needed(node_features)
                seq_features.append(node_features)
            features_all.append(np.stack(seq_features, axis=0))
        return np.stack(features_all, axis=0).astype(np.float32)


def _resolve_rfft_bins_override() -> Optional[int]:
    """Return None (no bin trimming, matches training) unless the user has
    explicitly set NEURODECIPHER_RFFT_BINS / RFFT_BINS to a positive integer
    for a deliberately different (e.g. older) checkpoint."""
    raw = os.environ.get("NEURODECIPHER_RFFT_BINS", os.environ.get("RFFT_BINS", "")).strip()
    if not raw:
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value > 0 else None


class TrainingCompatibleFeatureBuilder:
    """Backend feature builder that mirrors the training FeatureBuilder.

    Important: the previous runtime builder used continuous-frequency masks and
    raw power directly. The training pipeline first converts raw EEG to log-power
    positive rFFT bins, drops the DC bin, optionally trims to 100 bins, and then
    computes engineered features. Using a different feature recipe can collapse
    seizure probabilities even when the checkpoint itself is fine.

    target_feature_dim:
      34 -> detection checkpoint: 13 band + 1 entropy + 6 spectral shape +
            1 permutation entropy + 13 time-domain features.
      32 -> classification checkpoint: same spectral groups + compact 11
            time-domain features.
    """

    BANDS = {
        "delta": (1, 4),
        "theta": (4, 8),
        "alpha": (8, 13),
        "beta": (13, 30),
        "gamma": (30, 70),
    }

    def __init__(self, fs: int = 200, target_feature_dim: Optional[int] = None, rfft_bins: Optional[int] = None):
        self.fs = int(fs)
        self.target_feature_dim = int(target_feature_dim) if target_feature_dim is not None else None
        # Training's FeatureBuilder (models/trainer.py) is never given an
        # rfft_bins argument, so it defaults to None and keeps every
        # positive-frequency bin. Match that here: only trim if the caller
        # (or an explicit env var, for an older/different checkpoint) asks
        # for it - do NOT silently default to a fixed bin count.
        env_bins = os.environ.get("NEURODECIPHER_RFFT_BINS", os.environ.get("RFFT_BINS", "")).strip()
        if rfft_bins is not None:
            self.rfft_bins = int(rfft_bins)
        elif env_bins:
            try:
                parsed = int(env_bins)
                self.rfft_bins = parsed if parsed > 0 else None
            except Exception:
                self.rfft_bins = None
        else:
            self.rfft_bins = None

    @staticmethod
    def _nanfix(x: np.ndarray) -> np.ndarray:
        return np.nan_to_num(np.asarray(x, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)

    def _raw_to_log_power(self, x_raw: np.ndarray) -> np.ndarray:
        x_raw = self._nanfix(x_raw)
        x_raw = x_raw - np.mean(x_raw, axis=-1, keepdims=True)
        n = max(1, x_raw.shape[-1])
        fft = np.fft.rfft(x_raw, axis=-1)
        # EXACT training behavior: drop DC, use positive-frequency log power.
        power = (np.abs(fft[..., 1:]) ** 2) / float(n)
        if self.rfft_bins is not None and self.rfft_bins > 0:
            target = int(self.rfft_bins)
            if power.shape[-1] > target:
                power = power[..., :target]
            elif power.shape[-1] < target:
                pad = target - power.shape[-1]
                power = np.pad(power, [(0, 0)] * (power.ndim - 1) + [(0, pad)], mode="constant")
        return np.log(np.maximum(power, 1e-12)).astype(np.float32)

    def _band_indices(self, F: int, lo: float, hi: float):
        lo = max(1, int(np.floor(lo)))
        hi = min(F, int(np.floor(hi)))
        return slice(lo - 1, hi)

    def _bandpowers(self, x_bins: np.ndarray) -> np.ndarray:
        F = x_bins.shape[-1]
        p_lin = np.exp(x_bins)
        p_lin = np.maximum(p_lin, 1e-12)
        out = {}
        for name, (lo, hi) in self.BANDS.items():
            idx = self._band_indices(F, lo, hi)
            out[f"bp_{name}"] = p_lin[..., idx].sum(axis=-1, keepdims=True)
        out["bp_total"] = p_lin.sum(axis=-1, keepdims=True)
        for name in self.BANDS.keys():
            out[f"rp_{name}"] = out[f"bp_{name}"] / np.maximum(out["bp_total"], 1e-12)
        out["ratio_alpha_theta"] = out["bp_alpha"] / np.maximum(out["bp_theta"], 1e-12)
        out["ratio_beta_alpha"] = out["bp_beta"] / np.maximum(out["bp_alpha"], 1e-12)
        features = [
            out["bp_delta"], out["bp_theta"], out["bp_alpha"], out["bp_beta"], out["bp_gamma"],
            out["bp_total"],
            out["rp_delta"], out["rp_theta"], out["rp_alpha"], out["rp_beta"], out["rp_gamma"],
            out["ratio_alpha_theta"], out["ratio_beta_alpha"],
        ]
        return np.concatenate(features, axis=-1).astype(np.float32)

    @staticmethod
    def _spectral_entropy(x_bins: np.ndarray) -> np.ndarray:
        p = np.exp(np.asarray(x_bins, dtype=np.float32))
        p = np.maximum(p, 1e-12)
        p = p / np.maximum(p.sum(axis=-1, keepdims=True), 1e-12)
        return (-(p * np.log(np.maximum(p, 1e-12))).sum(axis=-1, keepdims=True)).astype(np.float32)

    @staticmethod
    def _spectral_shapes(log_bins: np.ndarray) -> np.ndarray:
        log_bins = np.asarray(log_bins, dtype=np.float32)
        V, F = log_bins.shape
        if F == 0:
            return np.zeros((V, 6), dtype=np.float32)
        p = np.maximum(np.exp(log_bins), 1e-12)
        freqs = np.arange(1, F + 1, dtype=np.float32)[None, :]
        p_sum = np.maximum(p.sum(axis=1, keepdims=True), 1e-12)
        centroid = (p * freqs).sum(axis=1, keepdims=True) / p_sum
        spread = np.sqrt(((freqs - centroid) ** 2 * p).sum(axis=1, keepdims=True) / p_sum)
        cdf = np.cumsum(p / p_sum, axis=1)
        sef_idx = (cdf >= 0.90).argmax(axis=1).reshape(-1, 1) + 1
        f_safe = np.arange(1, F + 1, dtype=np.float32)
        design = np.vstack([np.log(f_safe), np.ones(F, dtype=np.float32)]).T
        try:
            coef = np.linalg.lstsq(design, log_bins.T, rcond=None)[0]
            slope = coef[0, :].reshape(-1, 1)
            offset = coef[1, :].reshape(-1, 1)
        except Exception:
            slope = np.zeros((V, 1), dtype=np.float32)
            offset = np.zeros((V, 1), dtype=np.float32)
        geo = np.exp(np.mean(log_bins, axis=1, keepdims=True))
        arith = np.mean(p, axis=1, keepdims=True)
        flatness = geo / np.maximum(arith, 1e-12)
        features = np.concatenate([centroid, spread, sef_idx.astype(np.float32), slope, offset, flatness], axis=1)
        return np.nan_to_num(features, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)

    @staticmethod
    def _permutation_entropy(x: np.ndarray, m: int = 3, delay: int = 1) -> np.ndarray:
        x = np.asarray(x, dtype=np.float32)
        V, L = x.shape
        if L < m * delay:
            return np.zeros((V, 1), dtype=np.float32)
        out = np.zeros((V, 1), dtype=np.float32)
        denom = math.log(math.factorial(m))
        for i in range(V):
            counts = {}
            for j in range(L - (m - 1) * delay):
                window = x[i, j:(j + m * delay):delay]
                key = tuple(np.argsort(window))
                counts[key] = counts.get(key, 0) + 1
            values = np.array(list(counts.values()), dtype=np.float32)
            if values.size:
                p = values / np.maximum(values.sum(), 1e-12)
                out[i, 0] = float(-np.sum(p * np.log(np.maximum(p, 1e-12))) / denom)
        return np.nan_to_num(out, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)

    @staticmethod
    def _time_features_34(x_raw_node: np.ndarray) -> np.ndarray:
        x = np.asarray(x_raw_node, dtype=np.float32)
        x = np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)
        eps = 1e-8
        mean = np.mean(x, axis=-1, keepdims=True)
        centered = x - mean
        var = np.var(x, axis=-1, keepdims=True)
        std = np.sqrt(var + eps)
        min_v = np.min(x, axis=-1, keepdims=True)
        max_v = np.max(x, axis=-1, keepdims=True)
        amp_range = max_v - min_v
        energy = np.mean(x * x, axis=-1, keepdims=True)
        line_length = np.mean(np.abs(np.diff(x, axis=-1)), axis=-1, keepdims=True)
        zcr = np.mean((x[..., 1:] * x[..., :-1]) < 0, axis=-1, keepdims=True).astype(np.float32)
        skew = np.mean((centered / np.maximum(std, eps)) ** 3, axis=-1, keepdims=True)
        kurt = np.mean((centered / np.maximum(std, eps)) ** 4, axis=-1, keepdims=True)
        dx = np.diff(x, axis=-1)
        ddx = np.diff(dx, axis=-1) if dx.shape[-1] > 1 else dx
        var_dx = np.var(dx, axis=-1, keepdims=True) if dx.shape[-1] > 0 else np.zeros_like(var)
        var_ddx = np.var(ddx, axis=-1, keepdims=True) if ddx.shape[-1] > 0 else np.zeros_like(var)
        mobility = np.sqrt(var_dx / np.maximum(var, eps))
        mobility_dx = np.sqrt(var_ddx / np.maximum(var_dx, eps))
        complexity = mobility_dx / np.maximum(mobility, eps)
        feats = [mean, std, var, min_v, max_v, amp_range, energy, line_length, zcr, skew, kurt, mobility, complexity]
        return np.concatenate(feats, axis=-1).astype(np.float32)

    @staticmethod
    def _time_features_32(x_raw_node: np.ndarray) -> np.ndarray:
        x = np.asarray(x_raw_node, dtype=np.float32)
        x = np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)
        V, L = x.shape
        if L < 3:
            return np.zeros((V, 11), dtype=np.float32)
        eps = 1e-12
        dx = np.diff(x, axis=1)
        line_len = np.sum(np.abs(dx), axis=1, keepdims=True)
        rms = np.sqrt(np.mean(x ** 2, axis=1, keepdims=True))
        var = np.var(x, axis=1, keepdims=True)
        std = np.std(x, axis=1, keepdims=True)
        zcr = ((x[:, 1:] * x[:, :-1]) < 0).mean(axis=1, keepdims=True)
        psi = x[:, 1:-1] ** 2 - x[:, :-2] * x[:, 2:]
        tkeo = np.mean(np.abs(psi), axis=1, keepdims=True)
        activity = var
        mobility = np.sqrt(np.var(dx, axis=1, keepdims=True) / (var + eps))
        ddx = np.diff(dx, axis=1)
        complexity = (np.sqrt(np.var(ddx, axis=1, keepdims=True) / (np.var(dx, axis=1, keepdims=True) + eps)) / (mobility + eps))
        # Avoid scipy dependency here; match fisher-style excess kurtosis closely enough.
        centered = x - x.mean(axis=1, keepdims=True)
        sd = x.std(axis=1, keepdims=True) + eps
        sk = np.mean((centered / sd) ** 3, axis=1, keepdims=True)
        ku = np.mean((centered / sd) ** 4, axis=1, keepdims=True) - 3.0
        features = np.concatenate([line_len, rms, var, std, zcr, tkeo, activity, mobility, complexity, sk, ku], axis=1)
        return np.nan_to_num(features, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)

    def _adapt(self, node_features: np.ndarray) -> np.ndarray:
        target = self.target_feature_dim
        if target is None:
            return node_features.astype(np.float32)
        current = int(node_features.shape[-1])
        target = int(target)
        if current == target:
            return node_features.astype(np.float32)
        if {current, target}.issubset({32, 34}):
            if current < target:
                pad = np.zeros(node_features.shape[:-1] + (target - current,), dtype=node_features.dtype)
                return np.concatenate([node_features, pad], axis=-1).astype(np.float32)
            return node_features[..., :target].astype(np.float32)
        raise RuntimeError(f"Feature dimension mismatch after training-compatible builder: built {current}, expected {target}")

    def build(self, X: np.ndarray) -> np.ndarray:
        X = np.asarray(X, dtype=np.float32)
        if X.ndim != 4:
            raise ValueError(f"TrainingCompatibleFeatureBuilder expected X=(N,seq_len,19,samples), got {X.shape}")
        X_bins_all = self._raw_to_log_power(X)
        features_all = []
        for n in range(X.shape[0]):
            seq_features = []
            for t in range(X.shape[1]):
                x_bins = X_bins_all[n, t]
                x_raw = X[n, t]
                parts = [
                    self._bandpowers(x_bins),
                    self._spectral_entropy(x_bins),
                    self._spectral_shapes(x_bins),
                    self._permutation_entropy(np.exp(x_bins), m=3, delay=1),
                ]
                if int(self.target_feature_dim or 34) == 34:
                    parts.append(self._time_features_34(x_raw))
                else:
                    parts.append(self._time_features_32(x_raw))
                node_features = np.concatenate(parts, axis=-1)
                node_features = np.nan_to_num(node_features, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)
                seq_features.append(self._adapt(node_features))
            features_all.append(np.stack(seq_features, axis=0))
        return np.stack(features_all, axis=0).astype(np.float32)


@dataclass
class GraphConfig:
    alpha: float = 0.30
    functional_method: str = "pearson"
    top_k: int = 6
    add_self_loops: bool = True
    self_loop_weight: float = 1.0
    normalize: str = "symmetric"
    abs_connectivity: bool = True
    sigma: Optional[float] = None


class RuntimeGraphBuilder:
    def __init__(self, channel_names: Optional[Sequence[str]] = None, graph_params: Optional[dict] = None):
        self.channel_names = [normalize_channel_name(c) for c in (channel_names or STANDARD_19_CHANNELS)]
        self.num_nodes = len(self.channel_names)
        gp = graph_params or {}
        self.config = GraphConfig(
            alpha=float(gp.get("alpha", 0.30)),
            functional_method=str(gp.get("functional_method", "pearson")),
            top_k=int(gp.get("top_k", 6)),
            add_self_loops=bool(gp.get("add_self_loops", True)),
            self_loop_weight=float(gp.get("self_loop_weight", 1.0)),
            normalize=str(gp.get("normalize", "symmetric")),
            abs_connectivity=bool(gp.get("abs_connectivity", True)),
            sigma=gp.get("sigma", None),
        )
        self.distance_graph = self._compute_distance_graph()

    @staticmethod
    def _minmax01(A: np.ndarray) -> np.ndarray:
        A = np.asarray(A, dtype=np.float64)
        mn, mx = float(np.min(A)), float(np.max(A))
        if mx - mn < 1e-12:
            return np.zeros_like(A, dtype=np.float64)
        return (A - mn) / (mx - mn)

    def _compute_distance_graph(self) -> np.ndarray:
        coords = np.asarray([ELECTRODE_POSITIONS.get(ch, (0.0, 0.0)) for ch in self.channel_names], dtype=np.float64)
        distances = np.linalg.norm(coords[:, None, :] - coords[None, :, :], axis=-1)
        nonzero = distances[distances > 0]
        sigma = self.config.sigma if self.config.sigma is not None else (float(np.median(nonzero)) if nonzero.size else 1.0)
        A = np.exp(-(distances ** 2) / (2.0 * float(sigma) ** 2 + 1e-12))
        np.fill_diagonal(A, 0.0)
        return self._minmax01(A).astype(np.float32)

    def _functional_graph(self, X_window: np.ndarray) -> np.ndarray:
        X = np.asarray(X_window, dtype=np.float64)
        if X.ndim != 2:
            raise ValueError(f"X_window must be 2D, got {X.shape}")
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        X = X - X.mean(axis=1, keepdims=True)
        std = X.std(axis=1, keepdims=True) + 1e-8
        Xn = X / std
        A = (Xn @ Xn.T) / max(1, Xn.shape[1] - 1)
        if self.config.abs_connectivity:
            A = np.abs(A)
        A = np.nan_to_num(A, nan=0.0, posinf=0.0, neginf=0.0)
        np.fill_diagonal(A, 0.0)
        A = np.clip(A, 0.0, None)
        return self._minmax01(A).astype(np.float32)

    @staticmethod
    def _topk_symmetric(A: np.ndarray, k: int) -> np.ndarray:
        A = np.asarray(A, dtype=np.float64).copy()
        N = A.shape[0]
        np.fill_diagonal(A, 0.0)
        k = int(max(1, min(k, N - 1)))
        mask = np.zeros_like(A, dtype=bool)
        for i in range(N):
            idx = np.argsort(A[i])[-k:]
            mask[i, idx] = True
        mask = np.logical_or(mask, mask.T)
        B = np.where(mask, A, 0.0)
        B = 0.5 * (B + B.T)
        np.fill_diagonal(B, 0.0)
        return B.astype(np.float32)

    def _normalize(self, A: np.ndarray) -> np.ndarray:
        A = np.asarray(A, dtype=np.float64).copy()
        if self.config.add_self_loops:
            np.fill_diagonal(A, float(self.config.self_loop_weight))
        deg = A.sum(axis=1)
        norm = self.config.normalize.lower()
        if norm in {"none", "false", "no"}:
            return A.astype(np.float32)
        if norm in {"symmetric", "sym"}:
            inv_sqrt = 1.0 / np.sqrt(deg + 1e-8)
            A = inv_sqrt[:, None] * A * inv_sqrt[None, :]
        elif norm in {"row", "random_walk"}:
            A = A / (deg[:, None] + 1e-8)
        else:
            raise ValueError(f"Unknown graph normalization: {self.config.normalize}")
        return np.nan_to_num(A, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)

    def build_sequence_graphs(self, X_sequence: np.ndarray) -> np.ndarray:
        X = np.asarray(X_sequence, dtype=np.float32)
        if X.ndim != 3:
            raise ValueError(f"X_sequence must be (T,19,F), got {X.shape}")
        graphs = []
        for t in range(X.shape[0]):
            A_func = self._functional_graph(X[t])
            A_hybrid = float(self.config.alpha) * self.distance_graph + (1.0 - float(self.config.alpha)) * A_func
            A_hybrid = 0.5 * (A_hybrid + A_hybrid.T)
            np.fill_diagonal(A_hybrid, 0.0)
            A_topk = self._topk_symmetric(A_hybrid, self.config.top_k)
            graphs.append(self._normalize(A_topk))
        return np.stack(graphs, axis=0).astype(np.float32)

    def build_batch_graphs(self, X: np.ndarray) -> np.ndarray:
        return np.stack([self.build_sequence_graphs(seq) for seq in np.asarray(X, dtype=np.float32)], axis=0).astype(np.float32)


class DenseResidualGCNLayer(nn.Module):
    def __init__(self, in_dim: int, out_dim: int, dropout: float = 0.45, use_residual: bool = True):
        super().__init__()
        self.linear = nn.Linear(in_dim, out_dim)
        self.residual = nn.Linear(in_dim, out_dim) if in_dim != out_dim else nn.Identity()
        self.norm = nn.LayerNorm(out_dim)
        self.dropout = nn.Dropout(dropout)
        self.use_residual = bool(use_residual)

    def forward(self, x: torch.Tensor, A: torch.Tensor) -> torch.Tensor:
        h = torch.bmm(A, x)
        h = self.linear(h)
        if self.use_residual:
            h = h + self.residual(x)
        h = self.norm(h)
        h = F.relu(h)
        h = self.dropout(h)
        return h


class LightweightHybridGraphMeanMax(nn.Module):
    def __init__(
        self,
        in_dim: int,
        hidden_dim: int,
        num_classes: int,
        seq_len: int = 10,
        num_nodes: int = 19,
        dropout: float = 0.45,
        lstm_hidden: int = 96,
        num_gcn_layers: int = 2,
        use_gcn_residual: bool = True,
    ):
        super().__init__()
        self.in_dim = int(in_dim)
        self.hidden_dim = int(hidden_dim)
        self.num_classes = int(num_classes)
        self.seq_len = int(seq_len)
        self.num_nodes = int(num_nodes)
        self.lstm_hidden = int(lstm_hidden)

        layers = []
        prev = self.in_dim
        for _ in range(int(num_gcn_layers)):
            layers.append(DenseResidualGCNLayer(prev, self.hidden_dim, dropout=dropout, use_residual=use_gcn_residual))
            prev = self.hidden_dim
        self.gcn_layers = nn.ModuleList(layers)

        self.pool_projection = nn.Sequential(
            nn.Linear(self.hidden_dim * 2, self.hidden_dim),
            nn.LayerNorm(self.hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
        )

        self.lstm = nn.LSTM(
            input_size=self.hidden_dim,
            hidden_size=self.lstm_hidden,
            num_layers=1,
            batch_first=True,
            bidirectional=True,
        )
        temporal_dim = self.lstm_hidden * 2
        self.temporal_score = nn.Sequential(
            nn.Linear(temporal_dim, max(32, temporal_dim // 2)),
            nn.Tanh(),
            nn.Linear(max(32, temporal_dim // 2), 1),
        )

        self.classifier = nn.Sequential(
            nn.Linear(temporal_dim, self.hidden_dim),
            nn.LayerNorm(self.hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(self.hidden_dim, max(32, self.hidden_dim // 2)),
            nn.LayerNorm(max(32, self.hidden_dim // 2)),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(max(32, self.hidden_dim // 2), self.num_classes),
        )

    def forward(self, X: torch.Tensor, A_windows: torch.Tensor, return_details: bool = False):
        B, T, N, Fdim = X.shape
        x = X.reshape(B * T, N, Fdim)
        A = A_windows.reshape(B * T, N, N)
        for layer in self.gcn_layers:
            x = layer(x, A)
        h = x.view(B, T, N, self.hidden_dim)
        mean_pool = h.mean(dim=2)
        max_pool = h.max(dim=2).values
        window_embeddings = self.pool_projection(torch.cat([mean_pool, max_pool], dim=-1))
        lstm_out, _ = self.lstm(window_embeddings)
        scores = self.temporal_score(lstm_out).squeeze(-1)
        temporal_weights = torch.softmax(scores, dim=1)
        temporal_vec = torch.sum(lstm_out * temporal_weights.unsqueeze(-1), dim=1)
        logits = self.classifier(temporal_vec)
        if return_details:
            return {"logits": logits, "temporal_weights": temporal_weights, "window_embeddings": window_embeddings}
        return logits


def _torch_load_checkpoint(path: str, device: torch.device):
    try:
        return torch.load(path, map_location=device, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=device)


def _strip_module_prefix(state: dict) -> dict:
    if not state:
        return state
    if all(str(k).startswith("module.") for k in state.keys()):
        return {str(k)[7:]: v for k, v in state.items()}
    return state


def _infer_model_config(ckpt: dict, state: dict) -> dict:
    first_w = state.get("gcn_layers.0.linear.weight")
    if first_w is None:
        raise RuntimeError("Checkpoint is not a LightweightHybridGraphMeanMax checkpoint: missing gcn_layers.0.linear.weight")
    in_dim = int(ckpt.get("num_features", first_w.shape[1]))
    hidden_dim = int(ckpt.get("num_hiddens", ckpt.get("hidden_dim", first_w.shape[0])))
    last_weight = None
    for key in ("classifier.8.weight", "classifier.7.weight", "classifier.6.weight"):
        if key in state:
            last_weight = state[key]
    if last_weight is None:
        # Find the final classifier linear weight by key order.
        classifier_weights = [(k, v) for k, v in state.items() if str(k).startswith("classifier.") and str(k).endswith(".weight") and getattr(v, "ndim", 0) == 2]
        if classifier_weights:
            last_weight = classifier_weights[-1][1]
    num_classes = int(ckpt.get("num_classes", last_weight.shape[0] if last_weight is not None else 3))
    seq_len = int(ckpt.get("seq_len", 10))
    num_nodes = int(ckpt.get("num_nodes", 19))
    graph_params = dict(ckpt.get("graph_params", {}) or {})
    lstm_hidden = int(graph_params.get("lstm_hidden", ckpt.get("lstm_hidden", 96)))
    if "lstm.weight_hh_l0" in state:
        lstm_hidden = int(state["lstm.weight_hh_l0"].shape[0] // 4)
    num_gcn_layers = len({int(str(k).split(".")[1]) for k in state.keys() if str(k).startswith("gcn_layers.") and str(k).endswith("linear.weight")}) or int(graph_params.get("num_gcn_layers", 2))
    dropout = float(ckpt.get("dropout", graph_params.get("dropout", 0.45)))
    task_mode = str(ckpt.get("task_mode", graph_params.get("task_mode", "classification" if num_classes == 3 else "detection"))).lower()
    class_names = list(ckpt.get("class_names", graph_params.get("class_names", [])) or [])
    if not class_names:
        class_names = ["gnsz", "fnsz", "cpsz"] if num_classes == 3 else ["bckg", "seizure"] if num_classes == 2 else [f"class_{i}" for i in range(num_classes)]
    graph_params.setdefault("alpha", float(ckpt.get("alpha", graph_params.get("alpha", 0.30))))
    graph_params.setdefault("top_k", int(ckpt.get("top_k", graph_params.get("top_k", 6))))
    graph_params.setdefault("functional_method", "pearson")
    graph_params.setdefault("abs_connectivity", True)
    return {
        "in_dim": in_dim,
        "hidden_dim": hidden_dim,
        "num_classes": num_classes,
        "seq_len": seq_len,
        "num_nodes": num_nodes,
        "dropout": dropout,
        "lstm_hidden": lstm_hidden,
        "num_gcn_layers": num_gcn_layers,
        "graph_params": graph_params,
        "task_mode": task_mode,
        "class_names": class_names[:num_classes],
    }


class NeuroDecipherSequenceEngine:
    def __init__(self, checkpoint_path: str, device: torch.device | str = "cpu", scaler_path: Optional[str] = None, batch_size: int = 32):
        self.checkpoint_path = os.path.abspath(os.path.expanduser(os.path.expandvars(str(checkpoint_path))))
        if not os.path.exists(self.checkpoint_path):
            raise FileNotFoundError(
                f"NeuroDecipher checkpoint not found: {self.checkpoint_path}. "
                "Set DETECTION_CHECKPOINT / NEURODECIPHER_DETECTION_CHECKPOINT or "
                "CLASSIFICATION_CHECKPOINT / NEURODECIPHER_CLASSIFICATION_CHECKPOINT in .env."
            )
        self.device = torch.device(device)
        self.batch_size = int(batch_size)
        self.ckpt = _torch_load_checkpoint(self.checkpoint_path, self.device)
        state = self.ckpt.get("model_state_dict", self.ckpt)
        state = _strip_module_prefix(state)
        self.config = _infer_model_config(self.ckpt if isinstance(self.ckpt, dict) else {}, state)
        self.class_names = list(self.config["class_names"])
        self.task_mode = str(self.config["task_mode"]).lower()
        self.graph_builder = RuntimeGraphBuilder(STANDARD_19_CHANNELS[: self.config["num_nodes"]], self.config["graph_params"])
        self.feature_builder = TrainingCompatibleFeatureBuilder(
            fs=200,
            target_feature_dim=self.config["in_dim"],
            # CRITICAL: training's FeatureBuilder (models/trainer.py) is never
            # given an rfft_bins argument, so it defaults to None and keeps
            # ALL positive-frequency bins from the 800-sample/4s window (400
            # bins after dropping DC). TrainingCompatibleFeatureBuilder's own
            # default falls back to an env var defaulting to 100, which would
            # silently truncate the spectrum to ~0-25 Hz before computing any
            # engineered feature - a systematic train/inference mismatch on
            # every file, not just some. Pin this explicitly to None (all
            # bins, no trimming) unless NEURODECIPHER_RFFT_BINS is set on
            # purpose for an older checkpoint that really was trained with a
            # trimmed bin count.
            rfft_bins=_resolve_rfft_bins_override(),
        )
        log.info(
            f"[FeatureBuilder init] task={self.task_mode} in_dim={self.config['in_dim']} "
            f"rfft_bins={self.feature_builder.rfft_bins} (None = full spectrum, matches training)"
        )
        self.scaler_path = self._resolve_scaler_path(scaler_path)
        self.scaler = self._load_scaler(self.scaler_path)
        self.model = LightweightHybridGraphMeanMax(
            in_dim=self.config["in_dim"],
            hidden_dim=self.config["hidden_dim"],
            num_classes=self.config["num_classes"],
            seq_len=self.config["seq_len"],
            num_nodes=self.config["num_nodes"],
            dropout=self.config["dropout"],
            lstm_hidden=self.config["lstm_hidden"],
            num_gcn_layers=self.config["num_gcn_layers"],
            use_gcn_residual=True,
        ).to(self.device)
        self.model.load_state_dict(state, strict=True)
        self.model.eval()

        # Live detection threshold.
        #
        # STABLE-AI CHECKPOINT MODE
        # The new detection checkpoint was retrained with mild balancing
        # (target seizure exposure ~= 0.10) and validation selected a raw-softmax
        # threshold near 0.30 at epoch 1:
        #   val score ~= 0.7687, f1_seizure ~= 0.564, pred_sz ~= 0.022, true_sz ~= 0.018
        #
        # Therefore the backend default for the NEW stable checkpoint is:
        #   prior calibration OFF
        #   adaptive file-rate guard OFF
        #   fixed raw AI threshold = 0.30
        #
        # Prior calibration/adaptive guard remain available through env variables,
        # but they are no longer enabled by default because they made AI outputs
        # swing between all-seizure and all-background during testing.
        env_use_cal = os.environ.get(
            "NEURODECIPHER_DETECTION_USE_PRIOR_CALIBRATION",
            os.environ.get("DETECTION_USE_PRIOR_CALIBRATION", "0"),
        )
        self.detection_use_prior_calibration = str(env_use_cal).strip().lower() in {"1", "true", "yes", "on"}

        def _env_float(name: str, fallback: float) -> float:
            val = os.environ.get(name)
            try:
                if val is None or str(val).strip() == "":
                    return float(fallback)
                return float(val)
            except Exception:
                return float(fallback)

        self.detection_train_seizure_prior = float(np.clip(
            _env_float("NEURODECIPHER_DETECTION_TRAIN_SEIZURE_PRIOR", 0.35), 1e-4, 1.0 - 1e-4
        ))
        self.detection_deploy_seizure_prior = float(np.clip(
            _env_float("NEURODECIPHER_DETECTION_DEPLOY_SEIZURE_PRIOR", 0.02), 1e-4, 1.0 - 1e-4
        ))

        if self.detection_use_prior_calibration:
            self.detection_threshold = float(np.clip(
                _env_float("NEURODECIPHER_DETECTION_CALIBRATED_THRESHOLD", 0.15), 0.001, 0.999
            ))
            self.detection_threshold_source = "prior_calibrated_env_or_default"
        else:
            # Precedence without calibration: explicit env > checkpoint threshold > safe default.
            env_thr = os.environ.get("NEURODECIPHER_DETECTION_THRESHOLD", os.environ.get("DETECTION_THRESHOLD"))
            ckpt_thr = self.ckpt.get("detection_threshold") if isinstance(self.ckpt, dict) else None
            try:
                if env_thr is not None and str(env_thr).strip() != "":
                    self.detection_threshold = float(env_thr)
                    self.detection_threshold_source = "env_raw_softmax"
                elif ckpt_thr is not None:
                    self.detection_threshold = float(ckpt_thr)
                    self.detection_threshold_source = "checkpoint_raw_softmax"
                else:
                    self.detection_threshold = 0.30
                    self.detection_threshold_source = "stable_ai_default_raw_softmax"
            except Exception:
                self.detection_threshold = 0.30
                self.detection_threshold_source = "stable_ai_default_after_parse_error_raw_softmax"
            self.detection_threshold = float(np.clip(self.detection_threshold, 0.01, 0.99))

        # Optional file-adaptive guard. It is OFF by default for the stable AI
        # checkpoint because we want to evaluate the actual retrained AI model,
        # not force a per-file seizure percentage. Enable only for experiments
        # with NEURODECIPHER_DETECTION_THRESHOLD_MODE=adaptive_guard.
        self.detection_threshold_mode = str(os.environ.get(
            "NEURODECIPHER_DETECTION_THRESHOLD_MODE",
            os.environ.get("DETECTION_THRESHOLD_MODE", "fixed"),
        )).strip().lower()
        self.detection_adaptive_min_rate = float(np.clip(
            _env_float("NEURODECIPHER_DETECTION_ADAPTIVE_MIN_RATE", 0.02), 0.0, 0.95
        ))
        self.detection_adaptive_max_rate = float(np.clip(
            _env_float("NEURODECIPHER_DETECTION_ADAPTIVE_MAX_RATE", 0.20), 0.01, 0.95
        ))
        if self.detection_adaptive_min_rate > self.detection_adaptive_max_rate:
            self.detection_adaptive_min_rate = min(0.02, self.detection_adaptive_max_rate)
        self.detection_adaptive_min_evidence = float(np.clip(
            _env_float("NEURODECIPHER_DETECTION_ADAPTIVE_MIN_EVIDENCE", 0.03), 0.0, 0.999
        ))
        self._last_runtime_detection_threshold = float(self.detection_threshold)
        self._last_threshold_adaptation = {"mode": self.detection_threshold_mode, "action": "not_yet_evaluated"}

    def _resolve_scaler_path(self, scaler_path: Optional[str]) -> Optional[str]:
        if scaler_path:
            p = os.path.abspath(os.path.expanduser(os.path.expandvars(str(scaler_path))))
            return p if os.path.exists(p) else p
        candidate = os.path.join(os.path.dirname(self.checkpoint_path), "scaler.pkl")
        return candidate if os.path.exists(candidate) else None

    def _load_scaler(self, scaler_path: Optional[str]):
        if scaler_path and os.path.exists(scaler_path):
            with open(scaler_path, "rb") as f:
                return pickle.load(f)
        # Newer patched training checkpoints can store the scaler directly.
        # Use it before falling back to dangerous per-file scaling.
        if isinstance(self.ckpt, dict):
            for key in ("feature_scaler", "scaler", "standard_scaler", "X_scaler"):
                scaler = self.ckpt.get(key)
                if scaler is not None:
                    return scaler
        return None

    def _is_binary_detection_model(self) -> bool:
        if int(self.config.get("num_classes", 0)) != 2:
            return False
        lowered = {str(c).lower() for c in self.class_names}
        return bool(lowered.intersection({"bckg", "background", "normal"}) or lowered.intersection({"seizure", "seiz", "sz"}))

    def _seizure_class_index(self) -> int:
        override = os.environ.get("NEURODECIPHER_DETECTION_SEIZURE_INDEX", os.environ.get("DETECTION_SEIZURE_INDEX"))
        if override is not None and str(override).strip() != "":
            try:
                return int(np.clip(int(override), 0, int(self.config.get("num_classes", 2)) - 1))
            except Exception:
                pass
        for j, c in enumerate(self.class_names):
            if str(c).lower() in {"seizure", "seiz", "sz"}:
                return int(j)
        # Training maps 0=bckg and 1=seizure when class_names are absent.
        return 1 if int(self.config.get("num_classes", 2)) > 1 else 0

    def _background_class_index(self) -> int:
        override = os.environ.get("NEURODECIPHER_DETECTION_BACKGROUND_INDEX", os.environ.get("DETECTION_BACKGROUND_INDEX"))
        if override is not None and str(override).strip() != "":
            try:
                return int(np.clip(int(override), 0, int(self.config.get("num_classes", 2)) - 1))
            except Exception:
                pass
        for j, c in enumerate(self.class_names):
            if str(c).lower() in {"bckg", "background", "normal"}:
                return int(j)
        return 0

    @staticmethod
    def _safe_logit_np(p: np.ndarray) -> np.ndarray:
        p = np.asarray(p, dtype=np.float64)
        p = np.clip(p, 1e-6, 1.0 - 1e-6)
        return np.log(p / (1.0 - p))

    @staticmethod
    def _safe_sigmoid_np(x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype=np.float64)
        out = np.empty_like(x, dtype=np.float64)
        pos = x >= 0
        out[pos] = 1.0 / (1.0 + np.exp(-x[pos]))
        ex = np.exp(x[~pos])
        out[~pos] = ex / (1.0 + ex)
        return out

    def _prior_calibrate_binary_detection_probs(self, probs_np: np.ndarray) -> tuple[np.ndarray, dict]:
        """Correct balanced-training prior shift for binary detection probabilities.

        WeightedRandomSampler/focal/class-weight training changes the class prior seen
        by the model. This correction maps raw softmax p(seizure) from the training
        prior to an approximate deployment prior before thresholding. It does not
        change the model weights; it only calibrates the reported probability.
        """
        probs_np = np.asarray(probs_np, dtype=np.float32)
        if not self._is_binary_detection_model() or not bool(getattr(self, "detection_use_prior_calibration", False)):
            return probs_np, {"enabled": False}

        seizure_idx = self._seizure_class_index()
        bckg_idx = self._background_class_index()
        p_raw = probs_np[:, seizure_idx].astype(np.float64)
        train_prior = float(np.clip(getattr(self, "detection_train_seizure_prior", 0.35), 1e-4, 1.0 - 1e-4))
        deploy_prior = float(np.clip(getattr(self, "detection_deploy_seizure_prior", 0.02), 1e-4, 1.0 - 1e-4))
        correction = float(self._safe_logit_np(np.array([deploy_prior]))[0] - self._safe_logit_np(np.array([train_prior]))[0])
        p_cal = self._safe_sigmoid_np(self._safe_logit_np(p_raw) + correction).astype(np.float32)

        out = probs_np.copy().astype(np.float32)
        out[:, seizure_idx] = p_cal
        out[:, bckg_idx] = 1.0 - p_cal
        # If class order is unusual, normalize as a guard.
        denom = out.sum(axis=1, keepdims=True)
        denom[denom == 0] = 1.0
        out = (out / denom).astype(np.float32)
        return out, {
            "enabled": True,
            "train_seizure_prior": train_prior,
            "deploy_seizure_prior": deploy_prior,
            "logit_correction": correction,
            "raw_min": float(np.min(p_raw)) if p_raw.size else 0.0,
            "raw_median": float(np.median(p_raw)) if p_raw.size else 0.0,
            "raw_mean": float(np.mean(p_raw)) if p_raw.size else 0.0,
            "raw_p90": float(np.percentile(p_raw, 90)) if p_raw.size else 0.0,
            "raw_p95": float(np.percentile(p_raw, 95)) if p_raw.size else 0.0,
            "raw_max": float(np.max(p_raw)) if p_raw.size else 0.0,
            "calibrated_min": float(np.min(p_cal)) if p_cal.size else 0.0,
            "calibrated_median": float(np.median(p_cal)) if p_cal.size else 0.0,
            "calibrated_mean": float(np.mean(p_cal)) if p_cal.size else 0.0,
            "calibrated_p90": float(np.percentile(p_cal, 90)) if p_cal.size else 0.0,
            "calibrated_p95": float(np.percentile(p_cal, 95)) if p_cal.size else 0.0,
            "calibrated_max": float(np.max(p_cal)) if p_cal.size else 0.0,
        }

    def _runtime_detection_threshold(self, p_sz: np.ndarray) -> tuple[float, dict]:
        """Return the threshold used for this uploaded file.

        The base threshold is still configured from env/checkpoint. In
        ``adaptive_guard`` mode we only adjust when a fixed threshold would
        produce a pathological file-level distribution. This makes inference
        moderate without changing the trained model or using ground truth.
        """
        p_sz = np.asarray(p_sz, dtype=np.float64)
        base = float(np.clip(getattr(self, "detection_threshold", 0.5), 0.001, 0.999))
        mode = str(getattr(self, "detection_threshold_mode", "fixed")).strip().lower()
        if p_sz.size == 0 or mode in {"fixed", "off", "none", "0", "false"}:
            return base, {
                "mode": mode,
                "action": "fixed",
                "base_threshold": base,
                "runtime_threshold": base,
                "predicted_rate_at_base": 0.0,
            }

        min_rate = float(np.clip(getattr(self, "detection_adaptive_min_rate", 0.02), 0.0, 0.95))
        max_rate = float(np.clip(getattr(self, "detection_adaptive_max_rate", 0.20), 0.01, 0.95))
        min_evidence = float(np.clip(getattr(self, "detection_adaptive_min_evidence", 0.03), 0.0, 0.999))
        if min_rate > max_rate:
            min_rate = min(0.02, max_rate)

        pred_rate_base = float(np.mean(p_sz >= base))
        thr = base
        action = "kept_base_threshold"

        # Too many positives: raise threshold to cap the file-level rate.
        if pred_rate_base > max_rate:
            thr = float(np.quantile(p_sz, 1.0 - max_rate, method="linear"))
            thr = max(thr, base)
            action = "raised_threshold_to_cap_high_seizure_rate"

        # Too few positives: only lower threshold if the file has some real
        # model evidence. This avoids blindly forcing seizures into clean files.
        elif pred_rate_base < min_rate and float(np.max(p_sz)) >= min_evidence and min_rate > 0:
            thr = float(np.quantile(p_sz, 1.0 - min_rate, method="linear"))
            thr = max(thr, min_evidence)
            thr = min(thr, base)
            action = "lowered_threshold_to_avoid_all_background"

        thr = float(np.clip(thr, 0.001, 0.999))
        pred_rate_runtime = float(np.mean(p_sz >= thr))
        return thr, {
            "mode": mode,
            "action": action,
            "base_threshold": base,
            "runtime_threshold": thr,
            "predicted_rate_at_base": pred_rate_base,
            "predicted_rate_at_runtime": pred_rate_runtime,
            "min_rate": min_rate,
            "max_rate": max_rate,
            "min_evidence": min_evidence,
        }

    def _apply_detection_threshold(self, probs_np: np.ndarray, threshold: Optional[float] = None) -> np.ndarray:
        seizure_idx = self._seizure_class_index()
        bckg_idx = self._background_class_index()
        p_sz = probs_np[:, seizure_idx]
        thr = float(self.detection_threshold if threshold is None else threshold)
        pred = np.full((probs_np.shape[0],), bckg_idx, dtype=int)
        pred[p_sz >= thr] = seizure_idx
        return pred

    def build_features_and_graphs(self, X_raw: np.ndarray) -> Tuple[np.ndarray, np.ndarray, str]:
        X_feat = self.feature_builder.build(X_raw)
        expected_dim = int(self.config["in_dim"])
        built_dim = int(X_feat.shape[-1])
        if built_dim != expected_dim:
            if {built_dim, expected_dim}.issubset({32, 34}):
                if built_dim < expected_dim:
                    pad = np.zeros(X_feat.shape[:-1] + (expected_dim - built_dim,), dtype=X_feat.dtype)
                    X_feat = np.concatenate([X_feat, pad], axis=-1).astype(np.float32)
                else:
                    X_feat = X_feat[..., :expected_dim].astype(np.float32)
                built_dim = int(X_feat.shape[-1])
            else:
                raise RuntimeError(
                    f"Feature dimension mismatch: built {built_dim} features but checkpoint expects {expected_dim}. "
                    "This backend now supports detection=34 and classification=32; other dimensions need the matching training FeatureBuilder."
                )

        scaler_mode = "training_scaler"
        B, T, N, Fdim = X_feat.shape
        if self.scaler is not None:
            X_scaled = self.scaler.transform(X_feat.reshape(-1, Fdim)).reshape(X_feat.shape).astype(np.float32)
        else:
            if StandardScaler is None:
                # Last-resort per-file standardization without sklearn.
                scaler_mode = "per_file_manual_standardization_no_training_scaler"
                flat = X_feat.reshape(-1, Fdim)
                mean = flat.mean(axis=0, keepdims=True)
                std = flat.std(axis=0, keepdims=True) + 1e-8
                X_scaled = ((flat - mean) / std).reshape(X_feat.shape).astype(np.float32)
            else:
                scaler_mode = "per_file_scaler_fallback_no_training_scaler"
                scaler = StandardScaler()
                X_scaled = scaler.fit_transform(X_feat.reshape(-1, Fdim)).reshape(X_feat.shape).astype(np.float32)

        graphs = self.graph_builder.build_batch_graphs(X_scaled)
        return X_scaled.astype(np.float32), graphs.astype(np.float32), scaler_mode

    @torch.no_grad()
    def predict_sequences(self, X_raw: np.ndarray) -> Dict[str, object]:
        X_scaled, graphs, scaler_mode = self.build_features_and_graphs(X_raw)
        probs_all = []
        temporal_all = []
        for s in range(0, X_scaled.shape[0], self.batch_size):
            e = min(X_scaled.shape[0], s + self.batch_size)
            xb = torch.tensor(X_scaled[s:e], dtype=torch.float32, device=self.device)
            ab = torch.tensor(graphs[s:e], dtype=torch.float32, device=self.device)
            details = self.model(xb, ab, return_details=True)
            logits = details["logits"]
            if self.config["num_classes"] == 1:
                p = torch.sigmoid(logits).reshape(-1, 1)
                probs = torch.cat([1.0 - p, p], dim=1)
            else:
                probs = F.softmax(logits, dim=-1)
            probs_all.append(probs.detach().cpu().numpy())
            temporal_all.append(details["temporal_weights"].detach().cpu().numpy())
        probs_np_raw = np.concatenate(probs_all, axis=0).astype(np.float32)
        temporal_np = np.concatenate(temporal_all, axis=0).astype(np.float32)
        probs_np, calibration_summary = self._prior_calibrate_binary_detection_probs(probs_np_raw)

        if self._is_binary_detection_model():
            seizure_idx = self._seizure_class_index()
            p_sz = probs_np[:, seizure_idx].astype(np.float32)
            runtime_threshold, threshold_adaptation = self._runtime_detection_threshold(p_sz)
            self._last_runtime_detection_threshold = float(runtime_threshold)
            self._last_threshold_adaptation = dict(threshold_adaptation)
            pred_idx = self._apply_detection_threshold(probs_np, threshold=runtime_threshold)
            class_stats = {}
            for j in range(probs_np.shape[1]):
                name = self.class_names[j] if j < len(self.class_names) else f"class_{j}"
                pj = probs_np[:, j].astype(np.float32)
                class_stats[str(name)] = {
                    "index": int(j),
                    "min": float(np.min(pj)) if pj.size else 0.0,
                    "median": float(np.median(pj)) if pj.size else 0.0,
                    "mean": float(np.mean(pj)) if pj.size else 0.0,
                    "p90": float(np.percentile(pj, 90)) if pj.size else 0.0,
                    "p95": float(np.percentile(pj, 95)) if pj.size else 0.0,
                    "max": float(np.max(pj)) if pj.size else 0.0,
                }
            prob_summary = {
                "threshold": float(getattr(self, "_last_runtime_detection_threshold", self.detection_threshold)),
                "configured_threshold": float(self.detection_threshold),
                "threshold_source": str(getattr(self, "detection_threshold_source", "unknown")),
                "threshold_mode": str(getattr(self, "detection_threshold_mode", "fixed")),
                "threshold_adaptation": dict(getattr(self, "_last_threshold_adaptation", {})),
                "probability_mode": "prior_calibrated" if bool(getattr(self, "detection_use_prior_calibration", False)) else "raw_softmax",
                "prior_calibration": calibration_summary,
                "seizure_index": int(seizure_idx),
                "background_index": int(self._background_class_index()),
                "min": float(np.min(p_sz)) if p_sz.size else 0.0,
                "mean": float(np.mean(p_sz)) if p_sz.size else 0.0,
                "median": float(np.median(p_sz)) if p_sz.size else 0.0,
                "p90": float(np.percentile(p_sz, 90)) if p_sz.size else 0.0,
                "p95": float(np.percentile(p_sz, 95)) if p_sz.size else 0.0,
                "max": float(np.max(p_sz)) if p_sz.size else 0.0,
                "n_above_threshold": int(np.sum(p_sz >= float(getattr(self, "_last_runtime_detection_threshold", self.detection_threshold)))),
                "n_total": int(p_sz.size),
                "class_probability_stats": class_stats,
                "feature_builder": "training_compatible_log_power_rfft",
                "rfft_bins": int(getattr(self.feature_builder, "rfft_bins", 0) or 0),
            }
        else:
            pred_idx = probs_np.argmax(axis=1).astype(int)
            prob_summary = {}

        return {
            "probabilities": probs_np,
            "raw_probabilities": probs_np_raw,
            "pred_indices": pred_idx,
            "temporal_attention": temporal_np,
            "scaler_mode": scaler_mode,
            "config": dict(self.config),
            "checkpoint_path": self.checkpoint_path,
            "scaler_path": self.scaler_path,
            "detection_threshold": float(getattr(self, "_last_runtime_detection_threshold", self.detection_threshold)),
            "configured_detection_threshold": float(self.detection_threshold),
            "detection_threshold_source": str(getattr(self, "detection_threshold_source", "unknown")),
            "detection_threshold_mode": str(getattr(self, "detection_threshold_mode", "fixed")),
            "detection_threshold_adaptation": dict(getattr(self, "_last_threshold_adaptation", {})),
            "probability_summary": prob_summary,
        }

    def format_ai_event(self, i: int, start: float, end: float, context_start: float, context_end: float, probs: np.ndarray, pred_idx: int) -> Tuple[dict, float, str, float]:
        probs = np.asarray(probs, dtype=np.float32)
        pred_idx = int(pred_idx)
        raw_label = self.class_names[pred_idx] if 0 <= pred_idx < len(self.class_names) else f"class_{pred_idx}"
        conf = float(probs[pred_idx]) if pred_idx < probs.size else float(np.max(probs))
        prob_map = {self.class_names[j] if j < len(self.class_names) else f"class_{j}": round(float(p), 4) for j, p in enumerate(probs)}

        # Detection checkpoint: true bckg/seizure decision.
        if self._is_binary_detection_model():
            seizure_idx = self._seizure_class_index()
            p_sz = float(probs[seizure_idx])
            threshold = float(getattr(self, "_last_runtime_detection_threshold", self.detection_threshold))
            ai_label = "seizure" if p_sz >= threshold else "bckg"
            ai_conf = p_sz if ai_label == "seizure" else 1.0 - p_sz
            ev = {
                "type": "prediction",
                "source": "ai",
                "index": int(i),
                "start": float(start),
                "end": float(end),
                "context_start": float(context_start),
                "context_end": float(context_end),
                "window_seconds": 4,
                "context_windows": int(self.config["seq_len"]),
                "label": ai_label,
                "prob": round(p_sz, 4),
                "confidence": round(float(ai_conf), 4),
                "model_task": "detection",
                "model_raw_label": raw_label,
                "model_class_index": int(pred_idx),
                "probabilities": prob_map,
                "seizure_probability": round(p_sz, 4),
                "probability_mode": "prior_calibrated" if bool(getattr(self, "detection_use_prior_calibration", False)) else "raw_softmax",
                "detection_threshold": round(threshold, 4),
                "detection_threshold_source": str(getattr(self, "detection_threshold_source", "unknown")),
                "configured_detection_threshold": round(float(getattr(self, "detection_threshold", threshold)), 4),
                "detection_threshold_mode": str(getattr(self, "detection_threshold_mode", "fixed")),
                "detection_threshold_adaptation": dict(getattr(self, "_last_threshold_adaptation", {})),
                "threshold_note": "seizure if calibrated seizure_probability >= runtime detection_threshold" if bool(getattr(self, "detection_use_prior_calibration", False)) else "seizure if seizure_probability >= runtime detection_threshold",
            }
            return ev, p_sz, ai_label, float(ai_conf)

        # 3-class subtype checkpoint: every prediction is a seizure subtype.
        ai_label = "seizure"
        p_sz = conf
        ev = {
            "type": "prediction",
            "source": "ai",
            "index": int(i),
            "start": float(start),
            "end": float(end),
            "context_start": float(context_start),
            "context_end": float(context_end),
            "window_seconds": 4,
            "context_windows": int(self.config["seq_len"]),
            "label": ai_label,
            "prob": round(float(p_sz), 4),
            "confidence": round(float(conf), 4),
            "model_task": "classification",
            "model_raw_label": raw_label,
            "model_class_index": int(pred_idx),
            "probabilities": prob_map,
            "ai_subtype": raw_label,
            "ai_subtype_full": CLF_FULL_NAMES.get(raw_label, raw_label.upper()),
            "ai_subtype_confidence": round(float(conf), 4),
            "ai_subtype_probs": prob_map,
        }
        return ev, p_sz, ai_label, float(conf)


_ENGINE_CACHE: Dict[Tuple[str, str, str, int], NeuroDecipherSequenceEngine] = {}


def get_neurodecipher_sequence_engine(
    checkpoint_path: str,
    device: torch.device | str = "cpu",
    scaler_path: Optional[str] = None,
    batch_size: int = 32,
) -> NeuroDecipherSequenceEngine:
    key = (
        os.path.abspath(os.path.expanduser(os.path.expandvars(str(checkpoint_path)))),
        str(device),
        os.path.abspath(os.path.expanduser(os.path.expandvars(str(scaler_path)))) if scaler_path else "",
        int(batch_size),
    )
    engine = _ENGINE_CACHE.get(key)
    if engine is None:
        engine = NeuroDecipherSequenceEngine(checkpoint_path=key[0], device=device, scaler_path=scaler_path, batch_size=batch_size)
        _ENGINE_CACHE[key] = engine
    return engine
