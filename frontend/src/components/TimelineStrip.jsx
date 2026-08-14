import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, CH_COLORS, CH_REGIONS, REGION_ACCENT, STATUS_CFG, SUBTYPE_FULL, SUBTYPE_SHORT, SUBTYPE_COLORS, REGION_ORDER, WIN_OPTS, PLOTLY_MARGIN, fmtT, isoNow, uid, annColor, getRegion } from "../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "./utils.js";
import { StatusBadge, SubtypeBadge, HybridBadge } from "./badges.jsx";
// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT: TimelineStrip
// ─────────────────────────────────────────────────────────────────────────────
export default function TimelineStrip({ events, ruleEvents, edits, totalDur, timeOffset, windowSize, onSeek, rulePhase }) {
  const [hoverT, setHoverT] = useState(null);
  if (!totalDur) return null;

  const LABEL_W = 30, STRIP_H = 60, RAIL_H = 12, RAIL_GAP = 6;
  const AI_TOP  = 6;
  const RB_TOP  = AI_TOP + RAIL_H + RAIL_GAP;
  const HY_TOP  = RB_TOP + RAIL_H + RAIL_GAP;

  const isRuleRunning = rulePhase === "running";
  const isRuleReady   = rulePhase === "ready";

  const totalH = HY_TOP + RAIL_H + 6;

  return (
    <div
      style={{
        height: totalH, flexShrink: 0, position: "relative",
        background: T.shell2, borderTop: `1px solid ${T.shellBorder}`,
        borderBottom: `1px solid ${T.shellBorder}`,
        cursor: "pointer", userSelect: "none" }}
      onClick={e => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - r.left - LABEL_W) / (r.width - LABEL_W)) * totalDur);
      }}
      onMouseMove={e => {
        const r = e.currentTarget.getBoundingClientRect();
        setHoverT(((e.clientX - r.left - LABEL_W) / (r.width - LABEL_W)) * totalDur);
      }}
      onMouseLeave={() => setHoverT(null)}
    >
      {/* Left labels */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: LABEL_W, zIndex: 5,
        display: "flex", flexDirection: "column", justifyContent: "flex-start",
        paddingTop: AI_TOP, gap: RAIL_GAP, background: T.shell2,
        borderRight: `1px solid ${T.shellBorder}`, pointerEvents: "none" }}>
        {[
          { label: "AI", color: "#F23C3C" },
          { label: isRuleRunning ? "RB…" : "RB", color: isRuleRunning ? "#F59E0B" : isRuleReady ? "#14B8A6" : T.muted },
          { label: "HY", color: "#7C3AED" },
        ].map(({ label, color }) => (
          <div key={label} style={{ height: RAIL_H, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 8, fontFamily: "'Roboto', Arial, sans-serif", fontWeight: 700, color, letterSpacing: "0.05em" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Event area */}
      <div style={{ position: "absolute", left: LABEL_W, right: 0, top: 0, bottom: 0 }}>

        {/* Rail backgrounds */}
        {[AI_TOP, RB_TOP, HY_TOP].map(top => (
          <div key={top} style={{
            position: "absolute", top, height: RAIL_H, left: 0, right: 0,
            background: T.shell1, border: `1px solid ${T.shellBorder}`, borderRadius: 2,
            pointerEvents: "none",
            animation: top === RB_TOP && isRuleRunning ? "rbPulse 1.8s ease-in-out infinite" : "none" }} />
        ))}

        {/* AI rail */}
        {events.map((ev, i) => {
          const edit = edits[ev.index];
          if (edit?.status === "rejected") return null;
          const isSz = (edit?.label ?? ev.label) === "seizure";
          const l = (ev.start / totalDur) * 100;
          const w = Math.max(((ev.end - ev.start) / totalDur) * 100, 0.3);
          return (
            <div key={`ai-${i}`} style={{
              position: "absolute", top: AI_TOP, height: RAIL_H,
              left: `${l}%`, width: `${w}%`,
              background: isSz ? "#F23C3C" : "rgba(69,130,215,0.55)",
              borderRadius: 2, pointerEvents: "none" }} />
          );
        })}

        {/* Rule rail */}
        {(ruleEvents ?? []).map((ev, i) => {
          const isSz = ev.label === "seizure";
          const l = (ev.start / totalDur) * 100;
          const w = Math.max(((ev.end - ev.start) / totalDur) * 100, 0.3);
          return (
            <div key={`rb-${i}`} style={{
              position: "absolute", top: RB_TOP, height: RAIL_H,
              left: `${l}%`, width: `${w}%`,
              background: isSz ? "#F59E0B" : "rgba(20,184,166,0.5)",
              borderRadius: 2, opacity: isSz ? 0.92 : 0.3, pointerEvents: "none" }} />
          );
        })}

        {/* Hybrid rail — derived from ruleEvents which carry hybrid_label */}
        {(ruleEvents ?? []).map((ev, i) => {
          if (ev.hybrid_label == null) return null;
          const isSz = ev.hybrid_label === "seizure";
          const l = (ev.start / totalDur) * 100;
          const w = Math.max(((ev.end - ev.start) / totalDur) * 100, 0.3);
          return (
            <div key={`hy-${i}`} style={{
              position: "absolute", top: HY_TOP, height: RAIL_H,
              left: `${l}%`, width: `${w}%`,
              background: isSz ? "#7C3AED" : "rgba(100,116,139,0.35)",
              borderRadius: 2, opacity: isSz ? 0.9 : 0.3, pointerEvents: "none" }} />
          );
        })}

        {/* Viewport indicator */}
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          left: `${(timeOffset / totalDur) * 100}%`,
          width: `${Math.max((windowSize / totalDur) * 100, 0.5)}%`,
          background: "rgba(37,99,235,0.12)",
          borderLeft: "2px solid rgba(37,99,235,0.70)",
          borderRight: "2px solid rgba(37,99,235,0.70)",
          pointerEvents: "none", zIndex: 2 }} />

        {/* Hover hairline */}
        {hoverT !== null && (
          <>
            <div style={{
              position: "absolute", top: 0, bottom: 0,
              left: `${(hoverT / totalDur) * 100}%`,
              width: 1, background: T.shellAccent, opacity: 0.7,
              pointerEvents: "none", zIndex: 3 }} />
            <div style={{
              position: "absolute", bottom: "calc(100% + 5px)",
              left: `${(hoverT / totalDur) * 100}%`,
              transform: "translateX(-50%)",
              background: T.shell1, border: `1px solid ${T.shellBorder}`,
              borderRadius: 5, padding: "3px 8px", fontSize: 9,
              color: T.shellText, fontFamily: "'Roboto', Arial, sans-serif",
              fontWeight: 600, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 10 }}>{fmtT(hoverT)}</div>
          </>
        )}

        {/* Legend */}
        <div style={{
          position: "absolute", right: 4, top: 2, zIndex: 4,
          display: "flex", gap: 6, pointerEvents: "none" }}>
          {[
            { color: "#F23C3C", label: "AI" },
            { color: "#F59E0B", label: "Rule" },
            { color: "#7C3AED", label: "Hybrid" },
          ].map(({ color, label }) => (
            <span key={label} style={{
              display: "flex", alignItems: "center", gap: 3,
              fontSize: 8, fontFamily: "'Roboto', Arial, sans-serif", color,
              background: `${color}15`, border: `1px solid ${color}40`,
              padding: "1px 5px", borderRadius: 3 }}>
              <span style={{ width: 6, height: 3, background: color, borderRadius: 1, display: "inline-block" }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}


export { TimelineStrip };
