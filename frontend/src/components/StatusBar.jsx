import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, CH_COLORS, CH_REGIONS, REGION_ACCENT, STATUS_CFG, SUBTYPE_FULL, SUBTYPE_SHORT, SUBTYPE_COLORS, REGION_ORDER, WIN_OPTS, PLOTLY_MARGIN, fmtT, isoNow, uid, annColor, getRegion } from "../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "./utils.js";
import { StatusBadge, SubtypeBadge, HybridBadge } from "./badges.jsx";

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT: StatusBar
// ─────────────────────────────────────────────────────────────────────────────
export default function StatusBar({ sr, channels, totalDur, windowSize, selectedCh, colorMap, tool, timeOffset }) {
  const isLoaded = channels.length > 0;
  const Item = ({ label, value, color }) => (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: T.shellMuted, fontSize: 9 }}>{label}</span>
      <span style={{ color: color ?? T.shellSubtext, fontWeight: 600, fontSize: 10 }}>{value}</span>
    </span>
  );
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "0 16px", height: 26, flexShrink: 0,
      background: T.shell2, borderTop: `1px solid ${T.shellBorder}`,
      fontFamily: "'Roboto', Arial, sans-serif", fontSize: 10, color: T.shellMuted }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9 }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: isLoaded ? T.ok : T.shellBorder2 }} />
          <span style={{ color: isLoaded ? T.ok : T.shellMuted }}>
            {isLoaded ? "Signal loaded" : "No file"}
          </span>
        </span>
        <span style={{ color: T.shellBorder }}>|</span>
        <Item label="Fs" value={`${sr} Hz`} />
        <Item label="Ch" value={channels.length} />
        <Item label="Dur" value={totalDur ? `${totalDur.toFixed(1)}s` : "—"} />
        <Item label="Win" value={`${windowSize}s`} />
        {selectedCh && (
          <>
            <span style={{ color: T.shellBorder }}>|</span>
            <span style={{
              color: colorMap[selectedCh], fontWeight: 700, fontSize: 9,
              background: `${colorMap[selectedCh]}15`,
              border: `1px solid ${colorMap[selectedCh]}35`,
              padding: "1px 7px", borderRadius: 10 }}>● {selectedCh.replace(/-LE$/,"").replace(/^EEG\s+/,"").trim()}</span>
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 9 }}>
          <span style={{ color: T.shellMuted }}>t = </span>
          <span style={{ color: T.shellAccent, fontWeight: 700 }}>{timeOffset.toFixed(2)}s</span>
        </span>
      </div>
    </div>
  );
}


export { StatusBar };
