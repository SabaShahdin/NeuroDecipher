# Auto-split from app_celery_postgres_step4_login.py
# Section: SERVICES — CLASSIFICATION ENGINE
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  SERVICES — CLASSIFICATION ENGINE
# ══════════════════════════════════════════════════════════════════════════════
@torch.no_grad()
def classify_seizure_ai(X_sc_seg, edge_index, edge_weight, device) -> dict:
    clf_model, _ = load_classification_model(device)

    if clf_model is None:
        return {
            "ai_subtype":            "unavailable",
            "ai_subtype_full":       "Model Not Loaded",
            "ai_subtype_confidence": 0.0,
            "ai_subtype_probs":      {},
        }

    try:
        x_t     = torch.tensor(X_sc_seg, dtype=torch.float32, device=device)
        batch_t = torch.zeros(x_t.size(0), dtype=torch.long, device=device)
        logits  = clf_model(x_t, edge_index, batch_t,
                            task="classification", edge_weight=edge_weight)
        probs_t  = F.softmax(logits, dim=-1).squeeze(0).cpu().numpy()
        pred_int = int(probs_t.argmax())
        label    = CLF_INT_TO_STR.get(pred_int, f"cls_{pred_int}")
        conf     = float(probs_t[pred_int])
        all_probs = {
            CLF_INT_TO_STR.get(i, f"cls_{i}"): round(float(p), 4)
            for i, p in enumerate(probs_t)
        }
        return {
            "ai_subtype":            label,
            "ai_subtype_full":       CLF_FULL_NAMES.get(label, label.upper()),
            "ai_subtype_confidence": round(conf, 4),
            "ai_subtype_probs":      all_probs,
        }
    except Exception as exc:
        log.warning(f"[CLF-AI] Inference error: {exc}")
        return {
            "ai_subtype":            "error",
            "ai_subtype_full":       "Inference Error",
            "ai_subtype_confidence": 0.0,
            "ai_subtype_probs":      {},
        }

def classify_seizure_rule(raw_window, fs) -> dict:
    try:
        result = classify_seizure_subtype_rules(raw_window, fs)
        label  = result["label"]
        conf   = float(result["confidence"])
        rules  = result["rules"]
        return {
            "rule_subtype":            label,
            "rule_subtype_full":       CLF_FULL_NAMES.get(label, label.upper()),
            "rule_subtype_confidence": round(conf, 4),
            "rule_subtype_rules":      rules,
            # Raw per-class rule scores (gnsz/fnsz/cpsz), kept alongside the
            # winning label so the hybrid subtype blender below can build a
            # normalised probability distribution out of them.
            "rule_subtype_scores":     result.get("scores", {}),
        }
    except Exception as exc:
        log.warning(f"[CLF-RULE] Error: {exc}")
        return {
            "rule_subtype":            "error",
            "rule_subtype_full":       "Rule Engine Error",
            "rule_subtype_confidence": 0.0,
            "rule_subtype_rules":      [],
            "rule_subtype_scores":     {},
        }


def classify_seizure_hybrid_subtype(
    ai_label: str,
    rule_label: str,
    ai_result: dict,
    rule_result: dict,
    alpha: float = 0.5,
) -> dict:
    """Decide which engine's subtype call to trust for a window the FINAL
    hybrid decision has already called "seizure".

    Rules (mirrors the ALPHA-blend logic already used for detection):
      - AI detection said bckg but the rule engine said seizure -> the rule
        engine is the only one that "saw" a seizure here, so its subtype wins.
      - Rule engine said bckg but AI detection said seizure -> the AI is the
        only one that saw a seizure, so its subtype wins.
      - Both engines independently agree the window is seizure -> neither one
        is trusted alone; blend AI's calibrated subtype probabilities with the
        rule engine's normalised rule-scores (same ALPHA weight as detection)
        and let the combined probability distribution decide.
    """
    ai_ok = bool(ai_result) and ai_result.get("ai_subtype") not in (None, "unavailable", "error")
    rule_ok = bool(rule_result) and rule_result.get("rule_subtype") not in (None, "unavailable", "error")

    # Case 1: AI missed it, rule caught it -> trust the rule engine.
    if ai_label != "seizure" and rule_label == "seizure" and rule_ok:
        return {
            "hybrid_subtype":            rule_result.get("rule_subtype"),
            "hybrid_subtype_full":       rule_result.get("rule_subtype_full"),
            "hybrid_subtype_confidence": rule_result.get("rule_subtype_confidence"),
            "hybrid_subtype_source":     "rule",
            "hybrid_subtype_probs":      None,
        }

    # Case 2: rule missed it, AI caught it -> trust the AI.
    if rule_label != "seizure" and ai_label == "seizure" and ai_ok:
        return {
            "hybrid_subtype":            ai_result.get("ai_subtype"),
            "hybrid_subtype_full":       ai_result.get("ai_subtype_full"),
            "hybrid_subtype_confidence": ai_result.get("ai_subtype_confidence"),
            "hybrid_subtype_source":     "ai",
            "hybrid_subtype_probs":      None,
        }

    # Case 3 (default): both engines agree it's seizure -> blend probabilities.
    ai_probs = (ai_result or {}).get("ai_subtype_probs") or {}
    rule_scores = (rule_result or {}).get("rule_subtype_scores") or {}
    total_score = sum(v for v in rule_scores.values() if v is not None)
    rule_probs = (
        {k: v / total_score for k, v in rule_scores.items()} if total_score > 0 else {}
    )

    labels = set(ai_probs) | set(rule_probs)
    if not labels:
        # Neither engine has a usable subtype distribution; fall back to
        # whichever single label is available.
        if ai_ok:
            return {
                "hybrid_subtype":            ai_result.get("ai_subtype"),
                "hybrid_subtype_full":       ai_result.get("ai_subtype_full"),
                "hybrid_subtype_confidence": ai_result.get("ai_subtype_confidence"),
                "hybrid_subtype_source":     "fallback_ai",
                "hybrid_subtype_probs":      None,
            }
        if rule_ok:
            return {
                "hybrid_subtype":            rule_result.get("rule_subtype"),
                "hybrid_subtype_full":       rule_result.get("rule_subtype_full"),
                "hybrid_subtype_confidence": rule_result.get("rule_subtype_confidence"),
                "hybrid_subtype_source":     "fallback_rule",
                "hybrid_subtype_probs":      None,
            }
        return {
            "hybrid_subtype":            "unavailable",
            "hybrid_subtype_full":       "Model Not Loaded",
            "hybrid_subtype_confidence": 0.0,
            "hybrid_subtype_source":     "none",
            "hybrid_subtype_probs":      None,
        }

    combined = {
        lbl: round(float(alpha) * ai_probs.get(lbl, 0.0) + (1.0 - float(alpha)) * rule_probs.get(lbl, 0.0), 4)
        for lbl in labels
    }
    best_label = max(combined, key=combined.get)
    return {
        "hybrid_subtype":            best_label,
        "hybrid_subtype_full":       CLF_FULL_NAMES.get(best_label, best_label.upper()),
        "hybrid_subtype_confidence": combined[best_label],
        "hybrid_subtype_source":     "probability",
        "hybrid_subtype_probs":      combined,
    }


