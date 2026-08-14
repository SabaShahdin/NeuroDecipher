import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { T, CH_COLORS, CH_REGIONS, REGION_ACCENT, STATUS_CFG, SUBTYPE_FULL, SUBTYPE_SHORT, SUBTYPE_COLORS, REGION_ORDER, WIN_OPTS, PLOTLY_MARGIN, fmtT, isoNow, uid, annColor, getRegion } from "../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "./utils.js";
import { StatusBadge, SubtypeBadge, HybridBadge } from "./badges.jsx";
// ─────────────────────────────────────────────────────────────────────────────
//  Interpretability overlay
// ─────────────────────────────────────────────────────────────────────────────
export default function InterpretabilityOverlay({ combined, stats, safeRule, events, edits, onClose }) {
  const subtypeEntries = Object.entries(stats.subtypeCounts || {});

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#F8FAFC", display: "flex", flexDirection: "column", fontFamily: R.sans }}>
      <div style={{ height: 52, background: "#fff", borderBottom: `1px solid ${R.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={onClose} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", border: `1px solid ${R.border}`, borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12 }}><X size={13} strokeWidth={2} /> Close</button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: R.ink }}>Model Interpretability</div>
            <div style={{ fontSize: 11, color: R.sub }}>AI predictions, confidence, hybrid scoring, detector agreement</div>
          </div>
        </div>
        <span style={{ fontSize: 11, color: R.sub }}>{combined.length} segments</span>
      </div>

      <div className="nd-scrollbar" style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 22 }}>
            {[
              { label: "AI Seizures",     value: stats.aiSz,        color: "#DC2626" },
              { label: "Rule Seizures",   value: stats.ruleSz,       color: "#D97706" },
              { label: "Hybrid Seizures", value: stats.hybSz,        color: "#7C3AED" },
              { label: "Agreement",       value: `${stats.agreePct}%`, color: "#2563EB" },
              { label: "Consensus",       value: stats.bothSz,        color: "#059669" },
            ].map(item => (
              <div key={item.label} style={{ background: "#fff", border: `1px solid ${R.border}`, borderRadius: 10, padding: 16, borderTop: `3px solid ${item.color}` }}>
                <div style={{ fontSize: 11, color: R.sub, marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Hybrid formula */}
          <div style={{ background: "#FAF7FF", border: `1px solid #DDD6FE`, borderRadius: 10, padding: "14px 18px", marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#5B21B6", marginBottom: 6 }}>Hybrid Scoring Formula</div>
            <div style={{ fontFamily: R.mono, fontSize: 12, color: "#6D28D9", marginBottom: 4 }}>
              C_hybrid = α × P_AI + (1−α) × R_rule
            </div>
            <div style={{ fontSize: 11, color: R.sub }}>
              α = {safeRule.find(e => e.alpha != null)?.alpha ?? 0.5} (configurable) · Seizure if C_hybrid ≥ 0.50 (or AI/rule override)
            </div>
          </div>

          {/* Agreement breakdown */}
          <div style={{ background: "#fff", border: `1px solid ${R.border}`, borderRadius: 10, padding: 18, marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 18, color: R.ink }}>Detector Agreement</div>
            {[
              { label: "Both Seizure",    value: stats.bothSz,   color: "#DC2626" },
              { label: "AI Only",         value: stats.aiOnly,   color: "#2563EB" },
              { label: "Rule Only",       value: stats.ruleOnly, color: "#D97706" },
              { label: "Hybrid Seizure",  value: stats.hybSz,    color: "#7C3AED" },
              { label: "Both Background", value: stats.bothBg,   color: "#64748B" },
            ].map(x => {
              const pct = Math.round(x.value / (combined.length || 1) * 100);
              return (
                <div key={x.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11 }}>
                    <span>{x.label}</span>
                    <span style={{ fontFamily: R.mono }}>{pct}%</span>
                  </div>
                  <div style={{ height: 8, background: R.border, borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: x.color }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Subtype distribution */}
          {subtypeEntries.length > 0 && (
            <div style={{ background: "#fff", border: `1px solid ${R.border}`, borderRadius: 10, padding: 18, marginBottom: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 18, color: R.ink }}>Seizure Subtype Distribution</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                {subtypeEntries.map(([k, n]) => (
                  <div key={k} style={{ border: `1px solid ${R.border}`, borderRadius: 8, padding: 14, background: "#F8FAFC" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: SUBTYPE_COLORS[k] ?? R.sub, marginBottom: 6 }}>{n}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: R.sub, textTransform: "uppercase", fontFamily: R.mono }}>{k}</div>
                    <div style={{ fontSize: 10, color: R.dim, marginTop: 4 }}>{SUBTYPE_FULL[k]}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-segment table */}
          <div style={{ background: "#fff", border: `1px solid ${R.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${R.border}`, fontSize: 13, fontWeight: 700, color: R.ink }}>
              Per-Segment Output (AI + Rule + Hybrid)
            </div>
            <div className="nd-scrollbar" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#F8FAFC", borderBottom: `1px solid ${R.border}` }}>
                    {["#","Start","Dur","AI","AI·Prob","AI·Subtype","Rule","Rule·Conf","Hybrid·C","Hybrid","Agree"].map(h => (
                      <th key={h} style={{ padding: "9px 10px", textAlign: "left", fontSize: 10, fontWeight: 600, color: R.sub, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {combined.map(({ ai, rule }, idx) => {
                    const ev    = ai ?? rule;
                    const aiSz  = ai?.label === "seizure";
                    const ruleSz = rule?.label === "seizure";
                    const hybSz  = rule?.hybrid_label === "seizure";
                    const agree  = ai?.label === rule?.label;
                    return (
                      <tr key={idx} style={{ borderBottom: `1px solid ${R.border}`, background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                        <td style={{ padding: "8px 10px", fontFamily: R.mono, fontSize: 10, color: R.dim }}>{idx + 1}</td>
                        <td style={{ padding: "8px 10px", fontFamily: R.mono, fontSize: 10 }}>{fmtT(ev.start)}</td>
                        <td style={{ padding: "8px 10px", fontFamily: R.mono, fontSize: 10 }}>{(ev.end - ev.start).toFixed(1)}s</td>
                        <td style={{ padding: "8px 10px", color: aiSz ? "#B91C1C" : R.sub, fontWeight: aiSz ? 600 : 400 }}>
                          {ai?.label ?? "—"}
                        </td>
                        <td style={{ padding: "8px 10px", fontFamily: R.mono, fontSize: 10 }}>
                          {ai?.prob != null ? `${(ai.prob * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {ai?.ai_subtype ? (
                            <span style={{ fontFamily: R.mono, fontSize: 9, fontWeight: 700, color: SUBTYPE_COLORS[ai.ai_subtype.toLowerCase()] ?? R.sub }}>
                              {ai.ai_subtype.toUpperCase()}
                            </span>
                          ) : <span style={{ color: R.dim }}>—</span>}
                        </td>
                        <td style={{ padding: "8px 10px", color: ruleSz ? "#0369A1" : R.sub, fontWeight: ruleSz ? 600 : 400 }}>
                          {rule?.label ?? "—"}
                        </td>
                        <td style={{ padding: "8px 10px", fontFamily: R.mono, fontSize: 10 }}>
                          {rule?.confidence != null ? `${(rule.confidence * 100).toFixed(0)}%` : "—"}
                        </td>
                        <td style={{ padding: "8px 10px", fontFamily: R.mono, fontSize: 10, color: "#7C3AED", fontWeight: 600 }}>
                          {rule?.hybrid_confidence != null ? `${(rule.hybrid_confidence * 100).toFixed(0)}%` : "—"}
                        </td>
                        <td style={{ padding: "8px 10px", color: rule?.hybrid_label == null ? R.dim : hybSz ? "#7C3AED" : "#059669", fontWeight: 700 }}>
                          {rule?.hybrid_label == null ? "—" : hybSz ? "Seizure" : "Clear"}
                        </td>
                        <td style={{ padding: "8px 10px", color: agree ? "#047857" : "#B45309", fontWeight: 600 }}>
                          {agree ? "Agree" : "Disagree"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { InterpretabilityOverlay };
