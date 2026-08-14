# Auto-split from app_celery_postgres_step4_login.py
# Section: SERVICES — WINDOWING
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  SERVICES — WINDOWING
# ══════════════════════════════════════════════════════════════════════════════
def _normalise_ch(name: str) -> str:
    n = name.strip().upper()
    n = re.sub(r'^EEG\s+', '', n)
    n = re.sub(r'[-_](REF|LE|AVG|CZ|A1|A2)$', '', n)
    n = n.replace('-', '').replace('_', '')
    aliases = {"T7": "T3", "T8": "T4", "P7": "T5", "P8": "T6"}
    return aliases.get(n, n)


def slide_windows_from_h5(
    h5_path:         str,
    window_sec:      int = TIME_STEP_SIZE,
    target_time_pts: int = TARGET_TIME_PTS,
    num_nodes:       int = NUM_NODES,
    resampled_freq:  int = RESAMPLED_FREQ,
) -> tuple:
    """Compatibility helper.

    The old backend returned one fake sequence per 4/12-second segment by stacking
    the same segment repeatedly. The final trained model needs real rolling
    10-window context, so this helper now returns:

        X = (num_predictions, MODEL_SEQ_LEN, 19, 800)

    Start/stop times refer to the current/latest 4-second window of each
    sequence, so the frontend timeline receives true 4-second predictions.
    """
    from neurodecipher_backend.services.ai.neurodecipher_sequence_engine import (
        read_uploaded_eeg_for_model,
        make_rolling_4s_sequences,
    )

    signal, fs, _channels, matched = read_uploaded_eeg_for_model(
        h5_path,
        target_fs=resampled_freq,
        num_nodes=num_nodes,
    )
    pack = make_rolling_4s_sequences(
        signal,
        fs=fs,
        window_seconds=window_sec,
        seq_len=MODEL_SEQ_LEN,
    )
    X = pack["X"]
    log.info(
        "  Rolling windowing: raw_windows=%d predictions=%d | X=%s | matched_channels=%d/%d",
        pack["n_raw_windows"], pack["n_predictions"], X.shape, matched, num_nodes,
    )
    return X, pack["start_times"], pack["stop_times"], fs
