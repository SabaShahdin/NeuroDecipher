# Auto-split from app_celery_postgres_step4_login.py
# Section: SERVICES — FEATURE EXTRACTOR
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  SERVICES — FEATURE EXTRACTOR
# ══════════════════════════════════════════════════════════════════════════════
def extract_and_scale(X_raw, actual_freq, in_dim):
    import numpy as np
    from sklearn.preprocessing import StandardScaler
    from data.scripts.features import FeatureBuilder

    log.info(f"  Extracting spectral features (fs={actual_freq} Hz) ...")
    fb = FeatureBuilder(
        fs=actual_freq, rfft_bins=100, with_time=False,
        with_shapes=True, with_complexity=True, with_connectivity=False,
    )
    built  = fb.build(X_raw, mode="detection")
    X_feat = built[0] if isinstance(built, tuple) else built

    X_graph = X_feat.mean(axis=1)
    _N, nodes, feat_dim = X_graph.shape

    if feat_dim != in_dim:
        # Detection and classification checkpoints may intentionally differ:
        # detection can expect 34 engineered node features while classification
        # can expect 32. Adapt only this known 32/34 pair; otherwise fail loudly.
        if {int(feat_dim), int(in_dim)}.issubset({32, 34}):
            if feat_dim < in_dim:
                pad = np.zeros(X_graph.shape[:-1] + (int(in_dim) - int(feat_dim),), dtype=X_graph.dtype)
                X_graph = np.concatenate([X_graph, pad], axis=-1).astype(np.float32)
            else:
                X_graph = X_graph[..., :int(in_dim)].astype(np.float32)
            feat_dim = int(X_graph.shape[-1])
            log.info(f"  Feature dimension adapted for checkpoint: {feat_dim} features")
        else:
            raise RuntimeError(
                f"Feature dimension mismatch: feat_dim={feat_dim} vs model in_dim={in_dim}."
            )

    log.info("  Standardising features ...")
    X_flat = X_graph.reshape(-1, feat_dim)
    from sklearn.preprocessing import StandardScaler
    scaler = StandardScaler()
    X_sc   = scaler.fit_transform(X_flat).reshape(_N, nodes, feat_dim)
    return X_sc


