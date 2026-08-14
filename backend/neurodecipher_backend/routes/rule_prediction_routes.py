# Auto-split from app_celery_postgres_step4_login.py
# Section: ROUTES — RULE PREDICTIONS  (backward-compat redirect)
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES — RULE PREDICTIONS  (backward-compat redirect)
# ══════════════════════════════════════════════════════════════════════════════
rule_predictions_bp = Blueprint("rule_predictions", __name__)

@rule_predictions_bp.route("/rule_predictions/<job_id>", methods=["GET"])
def rule_predictions(job_id):
    log.info(f"[rule_predictions] {job_id} → redirecting to /predictions/{job_id}")
    return redirect(f"/predictions/{job_id}", code=307)


