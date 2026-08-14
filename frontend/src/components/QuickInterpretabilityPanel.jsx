import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, CH_COLORS, CH_REGIONS, REGION_ACCENT, STATUS_CFG, SUBTYPE_FULL, SUBTYPE_SHORT, SUBTYPE_COLORS, REGION_ORDER, WIN_OPTS, PLOTLY_MARGIN, fmtT, isoNow, uid, annColor, getRegion } from "../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "./utils.js";
import { StatusBadge, SubtypeBadge, HybridBadge } from "./badges.jsx";
// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT: QuickInterpretabilityPanel (review-page lightweight graphs)
// ─────────────────────────────────────────────────────────────────────────────
export default function QuickInterpretabilityPanel({ events = [], ruleEvents = [], onJump }) {
  const combined = useMemo(() => {
    const map = {};
    events.forEach(ai => { map[ai.index] = { ai, rule: null }; });
    ruleEvents.forEach(rule => {
      if (!map[rule.index]) map[rule.index] = { ai: null, rule };
      else map[rule.index].rule = rule;
    });
    return Object.values(map).sort((a, b) => (a.ai ?? a.rule).index - (b.ai ?? b.rule).index);
  }, [events, ruleEvents]);

  const stats = useMemo(() => {
    const total = combined.length || 1;
    const aiSz = combined.filter(x => x.ai?.label === "seizure").length;
    const ruleSz = combined.filter(x => x.rule?.label === "seizure").length;
    const hybridSz = combined.filter(x => x.rule?.hybrid_label === "seizure").length;
    const agree = combined.filter(x => x.ai && x.rule && x.ai.label === x.rule.label).length;
    const ruleIds = {};
    ruleEvents.forEach(ev => (ev.rules ?? []).forEach(r => { ruleIds[r.id] = (ruleIds[r.id] ?? 0) + 1; }));
    return { total: combined.length, aiSz, ruleSz, hybridSz, agreePct: Math.round(agree / total * 100), ruleIds };
  }, [combined, ruleEvents]);

  if (combined.length === 0) return null;

  const Metric = ({ label, value, color, sub }) => (
    <div className="nd-soft-card" style={{ padding: "10px 12px", borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 9, color: T.shellMuted, textTransform: "uppercase", letterSpacing: "0.10em", fontFamily: "'Roboto', Arial, sans-serif", fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 22, color, fontWeight: 850, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: T.shellMuted }}>{sub}</div>}
    </div>
  );

  const maxRuleCount = Math.max(1, ...Object.values(stats.ruleIds));

  return (
    <div style={{ flexShrink: 0, padding: "10px 12px", borderBottom: `1px solid ${T.shellBorder}`, background: "#F8FAFC" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr)) 1.5fr", gap: 10, alignItems: "stretch" }}>
        <Metric label="AI SZ" value={stats.aiSz} color="#2563EB" sub={`${stats.total} windows`} />
        <Metric label="Rule SZ" value={stats.ruleSz} color="#D97706" sub="TUSZ-style rules" />
        <Metric label="Hybrid SZ" value={stats.hybridSz} color="#7C3AED" sub="fusion result" />
        <Metric label="Agreement" value={`${stats.agreePct}%`} color="#059669" sub="AI vs Rule" />
        <div className="nd-soft-card" style={{ padding: 10, overflow: "hidden" }}>
          <div style={{ fontSize: 9, color: T.shellMuted, fontFamily: "'Roboto', Arial, sans-serif", letterSpacing: "0.1em", fontWeight: 800, marginBottom: 7 }}>CONFIDENCE TIMELINE</div>
          <div style={{ display: "flex", height: 30, gap: 2, alignItems: "end" }}>
            {combined.slice(-80).map((x, i) => {
              const ev = x.rule ?? x.ai;
              const conf = x.rule?.hybrid_confidence ?? x.ai?.confidence ?? 0;
              const isSz = x.rule?.hybrid_label === "seizure" || x.ai?.label === "seizure";
              return <button key={i} title={`${fmtT(ev.start)} · ${(conf*100).toFixed(0)}%`} onClick={() => onJump?.(ev.start)} style={{ flex: 1, height: `${Math.max(4, conf * 28)}px`, background: isSz ? "#7C3AED" : "#CBD5E1", border: 0, borderRadius: 3, cursor: "pointer" }} />;
            })}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 7, fontSize: 9, color: T.shellMuted }}>
            {Object.entries(stats.ruleIds).slice(0, 4).map(([id, n]) => (
              <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 34, height: 5, borderRadius: 999, background: `linear-gradient(90deg,#D97706 ${Math.round(n/maxRuleCount*100)}%,#E5E7EB 0)` }} /> {id}:{n}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export { QuickInterpretabilityPanel };
