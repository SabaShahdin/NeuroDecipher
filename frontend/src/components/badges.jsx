import React from "react";
import { CheckCircle2, XCircle, Pencil, Sparkles } from "lucide-react";
import { T, STATUS_CFG, SUBTYPE_COLORS } from "../constants.js";
// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT: StatusBadge
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_ICON = {
  accepted: CheckCircle2,
  rejected: XCircle,
  modified: Pencil,
  ai_predicted: Sparkles,
};

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.ai_predicted;
  const Icon = STATUS_ICON[status] ?? Sparkles;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 9, padding: "2px 8px", borderRadius: 20,
      background: c.bg, color: c.color,
      border: `1px solid ${c.border}`,
      fontFamily: "'Roboto', Arial, sans-serif",
      fontWeight: 700, whiteSpace: "nowrap" }}>
      <Icon size={11} strokeWidth={2} />
      {c.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT: SubtypeBadge
// ─────────────────────────────────────────────────────────────────────────────
function SubtypeBadge({ code, full, confidence, prefix = "" }) {
  if (!code || code === "unavailable" || code === "error") return null;
  const k = code.toLowerCase();
  const color = SUBTYPE_COLORS[k] ?? T.shellMuted;
  return (
    <div style={{
      marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 9, padding: "2px 8px", borderRadius: 4,
      background: `${color}12`, border: `1px solid ${color}35`,
      color, fontFamily: "'Roboto', Arial, sans-serif", fontWeight: 700,
      maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
      {prefix && <span style={{ opacity: 0.6 }}>{prefix}</span>}
      <span>{k.toUpperCase()}</span>
      {confidence != null && <span style={{ opacity: 0.7, fontWeight: 400 }}> {(confidence * 100).toFixed(0)}%</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT: HybridBadge  (new — shows hybrid_label + hybrid_confidence)
// ─────────────────────────────────────────────────────────────────────────────
function HybridBadge({ hybridLabel, hybridConf, alpha }) {
  if (hybridConf == null) return null;
  const isSz  = hybridLabel === "seizure";
  const color = isSz ? "#7C3AED" : "#059669";
  const bg    = isSz ? "#F5F3FF" : "#ECFDF5";
  const bdr   = isSz ? "#C4B5FD" : "#6EE7B7";
  return (
    <div style={{
      marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 9, padding: "2px 8px", borderRadius: 4,
      background: bg, border: `1px solid ${bdr}`, color,
      fontFamily: "'Roboto', Arial, sans-serif", fontWeight: 700 }}>
      <span style={{ opacity: 0.6 }}>Hybrid·</span>
      <span>{isSz ? "Seizure" : "Clear"}</span>
      <span style={{ opacity: 0.7, fontWeight: 400 }}>
        {(hybridConf * 100).toFixed(0)}%
      </span>
      {alpha != null && (
        <span style={{ opacity: 0.5, fontWeight: 400, fontSize: 8 }}>α={alpha}</span>
      )}
    </div>
  );
}


export { StatusBadge, SubtypeBadge, HybridBadge };
