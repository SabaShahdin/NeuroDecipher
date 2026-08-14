# Auto-split from app_celery_postgres_step4_login.py
# Section: SERVICES — MODEL LOADERS
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  SERVICES — MODEL LOADERS
# ══════════════════════════════════════════════════════════════════════════════
_det_model  = None
_det_cfg    = None
_det_device = None

def load_detection_model(device):
    _ensure_required_project_imports()
    global _det_model, _det_cfg, _det_device
    if _det_model is not None and _det_device == device:
        return _det_model, _det_cfg

    from models.model import HybridCNNLSTM

    if not os.path.exists(CHECKPOINT_PATH):
        raise FileNotFoundError(
            f"Checkpoint not found: {CHECKPOINT_PATH} "
            "(set env DETECTION_CHECKPOINT to override)"
        )

    ckpt  = torch.load(CHECKPOINT_PATH, map_location=device)
    state = ckpt["model_state_dict"]

    # ----------------------------------------------------------------------
    # MODEL-CHECKPOINT COMPATIBILITY FIX
    # ----------------------------------------------------------------------
    # Your error showed that the checkpoint was trained with CNN channels=32,
    # while the current code was building HybridCNNLSTM with CNN channels=64.
    #
    # strict=False does NOT ignore tensor shape mismatches. Therefore we infer
    # the architecture from checkpoint tensor shapes before constructing model.
    if "cnn_spatial.4.weight" in state:
        inferred_cnn_output_channels = int(state["cnn_spatial.4.weight"].shape[0])
    elif "cnn_spatial.8.weight" in state:
        inferred_cnn_output_channels = int(state["cnn_spatial.8.weight"].shape[0])
    else:
        inferred_cnn_output_channels = int(ckpt.get("cnn_output_channels", 32))

    cfg = {
        "in_dim":              ckpt.get("in_dim",              1221),
        "hidden_dim":          ckpt.get("hidden_dim",            64),
        "num_classes":         ckpt.get("num_classes",            7),
        "dropout":             ckpt.get("dropout",              0.3),
        "seq_len":             ckpt.get("seq_len",   TARGET_TIME_PTS),
        "task":                ckpt.get("task",          "detection"),
        "num_nodes":           ckpt.get("num_nodes",             19),
        "cnn_kernel_size":     ckpt.get("cnn_kernel_size",        3),
        "cnn_output_channels": inferred_cnn_output_channels,
    }

    if "node_encoder.weight" in state:
        cfg["in_dim"] = int(state["node_encoder.weight"].shape[1])

    log.info(
        f"Detection checkpoint architecture inferred | "
        f"in_dim={cfg['in_dim']} cnn_output_channels={cfg['cnn_output_channels']} "
        f"kernel={cfg['cnn_kernel_size']} hidden={cfg['hidden_dim']}"
    )

    model = HybridCNNLSTM(
        hidden_dim          = cfg["hidden_dim"],
        in_dim              = cfg["in_dim"],
        num_classes         = cfg["num_classes"],
        forecast_classes    = cfg["num_classes"],
        dropout             = cfg["dropout"],
        seq_len             = cfg["seq_len"],
        use_uncertainty     = False,
        cnn_kernel_size     = cfg["cnn_kernel_size"],
        cnn_output_channels = cfg["cnn_output_channels"],
    ).to(device)

    try:
        model.load_state_dict(state, strict=False)
    except RuntimeError as exc:
        mismatch_hint = (
            "Detection checkpoint could not be loaded because the model architecture "
            "still does not match the checkpoint tensor shapes. Check that "
            "models.model.HybridCNNLSTM is the same definition used during training. "
            f"Inferred config: {cfg}. Original error: {exc}"
        )
        raise RuntimeError(mismatch_hint) from exc

    model.eval()

    _det_model  = model
    _det_cfg    = cfg
    _det_device = device

    log.info(
        f"Detection model ready | in_dim={cfg['in_dim']} "
        f"hidden={cfg['hidden_dim']} classes={cfg['num_classes']}"
    )
    return _det_model, _det_cfg


_clf_model  = None
_clf_cfg    = None
_clf_device = None
CLF_INT_TO_STR = {i: c for i, c in enumerate(CLF_CLASSES)}

def load_classification_model(device):
    _ensure_required_project_imports()
    global _clf_model, _clf_cfg, _clf_device
    if _clf_model is not None and _clf_device == device:
        return _clf_model, _clf_cfg

    if not os.path.exists(CLASSIFICATION_CHECKPOINT):
        log.warning(
            f"[CLF] Checkpoint not found: {CLASSIFICATION_CHECKPOINT} — "
            "classification stage will be skipped."
        )
        return None, None

    try:
        from models.model import HybridCNNLSTM
    except ImportError as e:
        log.warning(f"[CLF] Cannot import HybridCNNLSTM: {e} — skipping.")
        return None, None

    ckpt  = torch.load(CLASSIFICATION_CHECKPOINT, map_location=device, weights_only=False)
    state = ckpt["model_state_dict"]

    if "cnn_spatial.4.weight" in state:
        inferred_cnn_output_channels = int(state["cnn_spatial.4.weight"].shape[0])
    elif "cnn_spatial.8.weight" in state:
        inferred_cnn_output_channels = int(state["cnn_spatial.8.weight"].shape[0])
    else:
        inferred_cnn_output_channels = int(ckpt.get("cnn_output_channels", 64))

    cfg = {
        "hidden_dim":          ckpt.get("hidden_dim",           128),
        "num_classes":         ckpt.get("num_classes",            7),
        "dropout":             ckpt.get("dropout",              0.3),
        "seq_len":             ckpt.get("seq_len",               10),
        "in_dim":              ckpt.get("in_dim",              1221),
        "cnn_kernel_size":     ckpt.get("cnn_kernel_size",        5),
        "cnn_output_channels": inferred_cnn_output_channels,
    }

    if "node_encoder.weight" in state:
        cfg["in_dim"] = int(state["node_encoder.weight"].shape[1])

    log.info(
        f"[CLF] Checkpoint architecture inferred | "
        f"in_dim={cfg['in_dim']} cnn_output_channels={cfg['cnn_output_channels']} "
        f"kernel={cfg['cnn_kernel_size']} hidden={cfg['hidden_dim']}"
    )

    model = HybridCNNLSTM(
        hidden_dim          = cfg["hidden_dim"],
        in_dim              = cfg["in_dim"],
        num_classes         = cfg["num_classes"],
        dropout             = cfg["dropout"],
        seq_len             = cfg["seq_len"],
        use_uncertainty     = False,
        cnn_kernel_size     = cfg["cnn_kernel_size"],
        cnn_output_channels = cfg["cnn_output_channels"],
    ).to(device)

    try:
        model.load_state_dict(state, strict=True)
    except RuntimeError as exc:
        log.warning(
            "[CLF] Classification checkpoint architecture mismatch. "
            f"Inferred config: {cfg}. Error: {exc}. "
            "Classification stage will be skipped."
        )
        return None, None

    model.eval()

    _clf_model  = model
    _clf_cfg    = cfg
    _clf_device = device

    log.info(
        f"[CLF] Classification model loaded | in_dim={cfg['in_dim']} "
        f"hidden={cfg['hidden_dim']} classes={cfg['num_classes']}"
    )
    return _clf_model, _clf_cfg


