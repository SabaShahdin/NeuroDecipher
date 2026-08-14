import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, CH_COLORS, CH_REGIONS, REGION_ACCENT, STATUS_CFG, SUBTYPE_FULL, SUBTYPE_SHORT, SUBTYPE_COLORS, REGION_ORDER, WIN_OPTS, PLOTLY_MARGIN, fmtT, isoNow, uid, annColor, getRegion } from "../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "./utils.js";
import { StatusBadge, SubtypeBadge, HybridBadge } from "./badges.jsx";
// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT: StatusDot
// ─────────────────────────────────────────────────────────────────────────────
export default function StatusDot({ phase, received, total }) {
  const PHASE_CFG = {
    idle:    { label: "Ready — start a new EEG analysis", color: T.shellMuted,  pulse: false },
    loading: { label: "Reading signal data…",              color: T.shellAccent, pulse: true  },
    running: { label: null,                                color: T.shellAccent, pulse: true  },
    ready:   { label: null,                                color: T.ok,          pulse: false },
    error:   { label: "Error — check connection",          color: "#DC2626",     pulse: false } };
  const cfg = PHASE_CFG[phase] ?? PHASE_CFG.idle;
  const pct = total > 0 ? Math.min(100, (received / total) * 100) : 0;
  const label =
    phase === "running"
      ? `Analysing — ${received}${total ? ` of ${total}` : ""} windows (${Math.round(pct)}%)`
      : phase === "ready"
      ? `Analysis complete · ${received} windows`
      : cfg.label;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "0 16px", height: 28, flexShrink: 0,
      background: T.shell2, borderBottom: `1px solid ${T.shellBorder}`,
      fontFamily: "'Roboto', Arial, sans-serif", fontSize: 10 }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
        background: cfg.color, display: "inline-block",
        animation: cfg.pulse ? "ndPulse 1.4s ease-in-out infinite"
          : phase === "ready" ? "ndPulseGreen 2s ease-in-out infinite" : "none" }} />
      <span style={{ color: cfg.color, fontWeight: phase === "ready" ? 600 : 400 }}>{label}</span>
      {phase === "running" && (
        <div style={{ flex: 1, maxWidth: 200, height: 3, background: T.shellBorder, borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: total > 0 ? `${pct}%` : "0%",
            background: T.shellAccent, borderRadius: 2, transition: "width 0.4s ease" }} />
        </div>
      )}
    </div>
  );
}

export { StatusDot };
