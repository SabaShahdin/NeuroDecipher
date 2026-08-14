
"""NeuroDecipher modular runtime.

This file assembles the split backend modules into one shared runtime namespace.
The source has been separated into real folders/files by responsibility:
config, db, repositories, services/ai, services/rules, services/hybrid,
services/signal, services/pipeline, routes, workers.

The shared namespace is used to preserve the behavior of the original working
single-file backend while removing the old `legacy_engine.py` bucket.
"""

from __future__ import annotations

import os
from pathlib import Path

_RUNTIME_PACKAGE_DIR = Path(__file__).resolve().parent
_RUNTIME_BACKEND_DIR = _RUNTIME_PACKAGE_DIR.parent
APP_ENTRY_FILE = _RUNTIME_BACKEND_DIR / "app_celery_postgres_step4_login.py"


def _load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return
    try:
        for raw in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except Exception:
        return


# Load environment from the package parent first so running from
# F:\FYP\Full Code or F:\FYP\Full Code\Backend both works.
for _candidate in (
    _RUNTIME_BACKEND_DIR / ".env",
    Path.cwd() / ".env",
    Path.cwd() / "Backend" / ".env",
):
    _load_env_file(_candidate)

# Preserve original single-file BASE_DIR behavior. The split section files use
# __file__ to derive BASE_DIR; it must point to Backend/app_celery_postgres_step4_login.py,
# not neurodecipher_backend/runtime.py.
globals()["__file__"] = str(APP_ENTRY_FILE)

_SECTION_ORDER = ['neurodecipher_backend/config/bootstrap_and_imports.py', 'neurodecipher_backend/config/settings_runtime.py', 'neurodecipher_backend/extensions/celery_ext.py', 'neurodecipher_backend/extensions/redis_streams.py', 'neurodecipher_backend/repositories/job_store.py', 'neurodecipher_backend/db/database.py', 'neurodecipher_backend/services/auth/auth_service.py', 'neurodecipher_backend/utils/formatting.py', 'neurodecipher_backend/services/signal/validation.py', 'neurodecipher_backend/services/signal/reader.py', 'neurodecipher_backend/services/signal/windowing.py', 'neurodecipher_backend/services/ai/graph_builder.py', 'neurodecipher_backend/services/ai/feature_extractor.py', 'neurodecipher_backend/services/ai/inference.py', 'neurodecipher_backend/services/ai/model_loaders.py', 'neurodecipher_backend/services/rules/rule_engine.py', 'neurodecipher_backend/services/rules/subtype_rules.py', 'neurodecipher_backend/services/ai/classification.py', 'neurodecipher_backend/services/rules/rule_annotator.py', 'neurodecipher_backend/services/pipeline/eeg_pipeline.py', 'neurodecipher_backend/workers/tasks.py', 'neurodecipher_backend/services/reports/pdf_report.py', 'neurodecipher_backend/routes/auth_routes.py', 'neurodecipher_backend/routes/upload_routes.py', 'neurodecipher_backend/routes/prediction_routes.py', 'neurodecipher_backend/routes/rule_prediction_routes.py', 'neurodecipher_backend/routes/debug_redis_routes.py', 'neurodecipher_backend/db/database_1.py', 'neurodecipher_backend/routes/dashboard_routes.py', 'neurodecipher_backend/routes/recording_routes.py', 'neurodecipher_backend/routes/analysis_routes.py', 'neurodecipher_backend/routes/export_routes.py', 'neurodecipher_backend/routes/rule_annotation_routes.py', 'neurodecipher_backend/routes/report_routes.py', 'neurodecipher_backend/app_factory.py']

for _rel_path in _SECTION_ORDER:
    # Use _RUNTIME_BACKEND_DIR here. The executed source sections intentionally
    # define their own BACKEND_DIR/BASE_DIR globals, so using BACKEND_DIR after
    # exec() can become a string and break Path / str operations.
    _path = _RUNTIME_BACKEND_DIR / _rel_path
    _code = _path.read_text(encoding="utf-8", errors="ignore")
    exec(compile(_code, str(_path), "exec"), globals(), globals())
