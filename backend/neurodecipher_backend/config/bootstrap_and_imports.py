# Auto-split from app_celery_postgres_step4_login.py
# Section: STANDARD LIBRARY & THIRD-PARTY IMPORTS
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

"""
NeuroDecipher — EEG AI Backend  (UNIFIED SINGLE-FILE VERSION)
═══════════════════════════════════════════════════════════════
All modules consolidated into one app.py:
  • config / settings
  • utils  (job_store, formatting, pdf_report)
  • services (signal_reader, windowing, graph_builder, feature_extractor,
              inference, model_loader, classification_model_loader,
              rule_engine, rule_annotator, classification_engine,
              seizure_subtype_rules, pipeline_worker)
  • routes  (upload, predictions, rule_predictions, automated_exports,
             rule_annotations, report)

UNIFIED QUEUE ARCHITECTURE
───────────────────────────
All prediction results (AI + Rule + Hybrid) flow through a single SSE endpoint:
  GET /predictions/<job_id>

Each SSE event carries a "source" field:
  "ai"   → AI model prediction
  "rule" → Rule-based prediction  (includes hybrid_confidence / hybrid_label)

Events are emitted in strict per-segment order:
  AI(seg 0) → Rule(seg 0) → AI(seg 1) → Rule(seg 1) → ... → done

Hybrid score (per segment, carried on the rule event):
  C_hybrid = α × P_AI + (1−α) × R_rule        α = 0.70
  hybrid_label = "seizure" if both detectors agree OR C_hybrid ≥ 0.65
"""

# ══════════════════════════════════════════════════════════════════════════════
#  STANDARD LIBRARY & THIRD-PARTY IMPORTS
# ══════════════════════════════════════════════════════════════════════════════
from __future__ import annotations

import copy
import io
import datetime
import json
import socket
import subprocess
import importlib.util
import types

try:
    import psycopg2
    import psycopg2.extras
except Exception:
    psycopg2 = None

try:
    import redis  # optional Redis Streams support
except Exception:
    redis = None

try:
    from celery import Celery  # production background worker support
except Exception:
    Celery = None
import logging
import os

# ─────────────────────────────────────────────────────────────────────────────
# Standalone .env loader
# ─────────────────────────────────────────────────────────────────────────────
# This file is intentionally a complete single-file backend.  It can be run
# directly with:
#     python app_celery_postgres_step4_login.py
# and Celery can be started with:
#     python -m celery -A app_celery_postgres_step4_login:celery_app worker --pool=solo --loglevel=INFO
#
# The loader below reads .env from the same folder as this file and from the
# current working directory before any configuration constants are evaluated.
def _load_local_env() -> None:
    candidates = []
    try:
        candidates.append(os.path.join(os.path.abspath(os.path.dirname(__file__)), ".env"))
    except Exception:
        pass
    candidates.append(os.path.join(os.getcwd(), ".env"))
    seen = set()
    for env_path in candidates:
        if not env_path or env_path in seen or not os.path.exists(env_path):
            continue
        seen.add(env_path)
        try:
            with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
                for raw in f:
                    line = raw.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = value
        except Exception:
            # Environment loading must never stop backend startup.
            continue

_load_local_env()
import re
import shutil
import sys
import tempfile
import time
import traceback
import uuid
import warnings
from typing import Optional

import numpy as np
import torch
import torch.nn.functional as F
from scipy import signal as sp_signal

from flask import (
    Flask, Blueprint, Response, jsonify, make_response,
    redirect, request, send_file, stream_with_context, g,
)
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.exceptions import HTTPException
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps

try:
    import jwt as pyjwt  # PyJWT — used for stateless user authentication tokens
except Exception:
    pyjwt = None

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
# In this single-file version, BASE_DIR is the folder containing this backend file.
# If it lives in F:\FYP\Gen_EEG1, that is also the project root.
# If it lives in F:\FYP\Gen_EEG1\backend, the parent folder is usually the project root.
BACKEND_DIR = BASE_DIR
PROJECT_ROOT = os.path.abspath(os.environ.get(
    "NEURODECIPHER_PROJECT_ROOT",
    BASE_DIR if os.path.exists(os.path.join(BASE_DIR, "models", "model.py")) else os.path.dirname(BASE_DIR),
))

# Make model/training packages importable in both layouts:
# 1) modular package extracted as <project>/backend/neurodecipher_backend
# 2) package copied directly as <project>/neurodecipher_backend
# 3) original project root containing models/, data/, checkpoints/, etc.
def _add_sys_path(path: str | None) -> bool:
    """Add an existing directory to sys.path, returning True when it was added."""
    if not path:
        return False
    path = os.path.abspath(os.path.expandvars(os.path.expanduser(str(path))))
    if os.path.isdir(path) and path not in sys.path:
        sys.path.insert(0, path)
        return True
    return False


for _path in (
    BASE_DIR,
    BACKEND_DIR,
    PROJECT_ROOT,
    os.getcwd(),
    os.path.abspath(os.path.dirname(os.getcwd())),
):
    _add_sys_path(_path)


def _candidate_project_roots() -> list[str]:
    """Return likely folders that may contain original models/ and data/ packages."""
    roots = []
    for env_name in (
        "NEURODECIPHER_PROJECT_ROOT",
        "PROJECT_ROOT",
        "PYTHONPATH",
    ):
        raw = os.environ.get(env_name, "")
        for part in raw.split(os.pathsep):
            if part.strip():
                roots.append(part.strip())

    # If the user points directly to models/ or models/model.py, normalize to its parent project root.
    raw_models = os.environ.get("NEURODECIPHER_MODELS_DIR", "").strip()
    if raw_models:
        raw_models = os.path.abspath(os.path.expandvars(os.path.expanduser(raw_models)))
        if os.path.basename(raw_models).lower() == "model.py":
            roots.append(os.path.dirname(os.path.dirname(raw_models)))
        elif os.path.basename(raw_models).lower() == "models":
            roots.append(os.path.dirname(raw_models))
        else:
            roots.append(raw_models)

    for base in (
        BASE_DIR,
        BACKEND_DIR,
        os.getcwd(),
        os.path.abspath(os.path.dirname(os.getcwd())),
        os.path.abspath(os.path.join(BACKEND_DIR, "..")),
        os.path.abspath(os.path.join(BACKEND_DIR, "..", "..")),
        PROJECT_ROOT,
    ):
        roots.append(base)

    # Also check common sibling layouts, without recursively scanning the whole drive first.
    expanded = []
    for r in roots:
        if not r:
            continue
        r = os.path.abspath(os.path.expandvars(os.path.expanduser(str(r))))
        expanded.append(r)
        expanded.extend([
            os.path.join(r, "backend"),
            os.path.join(r, "Backend"),
            os.path.join(r, "Gen_EEG1"),
        ])

    out = []
    seen = set()
    for r in expanded:
        if r and r not in seen:
            seen.add(r)
            out.append(r)
    return out


def _discover_project_source_paths() -> list[str]:
    """Find and add the project root containing models/model.py.

    This is intentionally more robust than relying on the current working directory,
    because Celery often starts from a different folder than Flask on Windows.
    """
    added = []
    candidates = _candidate_project_roots()

    def register_root(root: str):
        root = os.path.abspath(root)
        if os.path.exists(os.path.join(root, "models", "model.py")):
            if _add_sys_path(root):
                added.append(root)
            # make package subfolders visible too for legacy relative imports
            _add_sys_path(os.path.join(root, "models"))
            _add_sys_path(os.path.join(root, "data"))
            return True
        return False

    for root in candidates:
        register_root(root)

    # Last resort: limited recursive search from likely roots. This handles cases
    # where the backend was extracted into a nested folder under the real project.
    max_depth = int(os.environ.get("MODEL_DISCOVERY_MAX_DEPTH", "5"))
    max_dirs = int(os.environ.get("MODEL_DISCOVERY_MAX_DIRS", "5000"))
    searched = 0
    for base in candidates:
        base = os.path.abspath(os.path.expandvars(os.path.expanduser(str(base))))
        if not os.path.isdir(base):
            continue
        try:
            base_depth = base.rstrip(os.sep).count(os.sep)
            for root, dirs, files in os.walk(base):
                searched += 1
                if searched > max_dirs:
                    break
                depth = root.rstrip(os.sep).count(os.sep) - base_depth
                if depth > max_depth:
                    dirs[:] = []
                    continue
                # skip expensive/noisy folders
                dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "__pycache__", ".venv", "venv", "env", "dist", "build"}]
                if os.path.basename(root).lower() == "models" and "model.py" in files:
                    register_root(os.path.dirname(root))
                    return added
        except Exception:
            continue
    return added


def _ensure_namespace_package(package_name: str, package_dir: str):
    """Force a local folder to behave as an importable package.

    This fixes a Windows/Celery issue where a third-party package named
    `models` can be imported before the project root is added to sys.path.
    In that case, `import models.model` fails even when
    F:\...\models\model.py exists.
    """
    package_dir = os.path.abspath(package_dir)
    pkg = sys.modules.get(package_name)
    if pkg is None or not hasattr(pkg, "__path__"):
        pkg = types.ModuleType(package_name)
        pkg.__path__ = [package_dir]
        pkg.__package__ = package_name
        sys.modules[package_name] = pkg
    else:
        paths = list(getattr(pkg, "__path__", []))
        if package_dir not in paths:
            paths.insert(0, package_dir)
            pkg.__path__ = paths
    return pkg


def _force_load_models_model(root: str):
    """Load the original project models/model.py by absolute file path.

    Normal imports are not always reliable under Celery on Windows because the
    worker may already have a conflicting `models` module in sys.modules.
    Loading by file path and registering sys.modules['models.model'] ensures the
    later `from models.model import HybridCNNLSTM` statement uses the correct
    source file.
    """
    root = os.path.abspath(os.path.expandvars(os.path.expanduser(str(root))))
    model_path = os.path.join(root, "models", "model.py")
    if not os.path.exists(model_path):
        return None

    _add_sys_path(root)
    _add_sys_path(os.path.join(root, "models"))
    _add_sys_path(os.path.join(root, "data"))

    models_pkg = _ensure_namespace_package("models", os.path.join(root, "models"))
    data_dir = os.path.join(root, "data")
    scripts_dir = os.path.join(data_dir, "scripts")
    if os.path.isdir(data_dir):
        _ensure_namespace_package("data", data_dir)
    if os.path.isdir(scripts_dir):
        _ensure_namespace_package("data.scripts", scripts_dir)

    importlib.invalidate_caches()
    existing = sys.modules.get("models.model")
    if existing is not None and getattr(existing, "__file__", None):
        try:
            if os.path.abspath(existing.__file__) == os.path.abspath(model_path):
                return existing
        except Exception:
            pass

    spec = importlib.util.spec_from_file_location("models.model", model_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not create import spec for {model_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["models.model"] = module
    setattr(models_pkg, "model", module)
    spec.loader.exec_module(module)
    return module


def _ensure_required_project_imports() -> None:
    """Fail early with a clear setup message when model packages are missing."""
    discovered = _discover_project_source_paths()
    checked = []
    last_exc = None
    for root in list(discovered) + _candidate_project_roots():
        root = os.path.abspath(os.path.expandvars(os.path.expanduser(str(root))))
        if root in checked:
            continue
        checked.append(root)
        if os.path.exists(os.path.join(root, "models", "model.py")):
            try:
                module = _force_load_models_model(root)
                if module is not None:
                    log.info(f"[imports] Loaded models.model from {os.path.abspath(os.path.join(root, 'models', 'model.py'))}")
                    return
            except Exception as exc:
                last_exc = exc

    try:
        importlib.invalidate_caches()
        import models.model  # noqa: F401
        return
    except Exception as exc:
        last_exc = last_exc or exc

    raise RuntimeError(
        "Cannot import models.model. Prediction cannot start because Python cannot find or load your original AI model code. "
        "Fix one of these: (1) place the original models/ folder so that models/model.py exists next to backend/, "
        "or (2) set NEURODECIPHER_PROJECT_ROOT to the folder that contains models/model.py and data/scripts/, "
        "or (3) set NEURODECIPHER_MODELS_DIR directly to the models folder. "
        "Example PowerShell: $env:NEURODECIPHER_PROJECT_ROOT='F:\\FYP\\Gen_EEG1'. "
        "Checked paths: " + "; ".join(checked) + "; original error: " + repr(last_exc)
    ) from last_exc

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("neurodecipher")


