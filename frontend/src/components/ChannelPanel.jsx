import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, CH_COLORS, CH_REGIONS, REGION_ACCENT, STATUS_CFG, SUBTYPE_FULL, SUBTYPE_SHORT, SUBTYPE_COLORS, REGION_ORDER, WIN_OPTS, PLOTLY_MARGIN, fmtT, isoNow, uid, annColor, getRegion } from "../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "./utils.js";
import { StatusBadge, SubtypeBadge, HybridBadge } from "./badges.jsx";
// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT: ChannelPanel
// ─────────────────────────────────────────────────────────────────────────────
export default function ChannelPanel({ channels, colorMap, selectedCh, onSelect }) {
  const [collapsed, setCollapsed] = useState({});

  const grouped = channels.reduce((acc, ch) => {
    const r = getRegion(ch);
    if (!acc[r]) acc[r] = [];
    acc[r].push(ch);
    return acc;
  }, {});
  const sortedRegions = REGION_ORDER.filter(r => grouped[r]);
  const toggleRegion  = r => setCollapsed(p => ({ ...p, [r]: !p[r] }));
  const displayName   = ch => ch.replace(/-LE$/,"").replace(/^EEG\s+/,"").trim();

  return (
    <div style={{
      width: 136, minWidth: 136, display: "flex", flexDirection: "column",
      background: T.shell1, borderRight: `1px solid ${T.shellBorder}`,
      fontFamily: "'Roboto', Arial, sans-serif", userSelect: "none" }}>
      <div style={{
        padding: "9px 10px 8px", borderBottom: `1px solid ${T.shellBorder}`,
        background: T.shell2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, color: T.shellSubtext, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
          Channels
        </span>
        {channels.length > 0 && (
          <span style={{
            fontSize: 8, color: T.shellMuted, background: T.shell3,
            border: `1px solid ${T.shellBorder}`, padding: "1px 6px", borderRadius: 10 }}>{channels.length}</span>
        )}
      </div>

      <div className="nd-scrollbar" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {channels.length === 0 && (
          <div style={{ padding: "28px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: T.shellMuted, lineHeight: 1.6 }}>
              Load a file to<br/>see channels
            </div>
          </div>
        )}
        {sortedRegions.map(region => {
          const chs    = grouped[region];
          const isOpen = !collapsed[region];
          const accent = REGION_ACCENT[region] ?? REGION_ACCENT.Other;
          return (
            <div key={region}>
              <button onClick={() => toggleRegion(region)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 7,
                padding: "6px 10px", border: "none", background: isOpen ? `${accent}0d` : "transparent",
                borderBottom: `1px solid ${accent}1a`, cursor: "pointer", textAlign: "left",
                position: "relative" }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: 2, background: accent, opacity: isOpen ? 0.7 : 0.25 }} />
                <span style={{ flex: 1, fontSize: 9, color: accent, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700 }}>
                  {region}
                </span>
                <span style={{
                  fontSize: 8, color: accent, background: `${accent}18`,
                  border: `1px solid ${accent}30`, padding: "0px 5px", borderRadius: 10,
                  fontFamily: "'Roboto', Arial, sans-serif", fontWeight: 700, lineHeight: "16px" }}>{chs.length}</span>
              </button>
              {isOpen && (
                <div>
                  {chs.map(ch => {
                    const sel = ch === selectedCh;
                    const col = colorMap[ch];
                    return (
                      <div
                        key={ch}
                        onClick={() => onSelect(sel ? null : ch)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "5px 10px 5px 12px", cursor: "pointer",
                          background: sel ? `${col}14` : "transparent",
                          borderBottom: `1px solid ${T.shellBorder}`,
                          borderLeft: `3px solid ${sel ? col : "transparent"}`,
                          transition: "all 0.12s" }}
                      >
                        <div style={{
                          width: 7, height: 7, borderRadius: sel ? 2 : "50%",
                          flexShrink: 0, background: col,
                          boxShadow: sel ? `0 0 0 2px ${col}35` : "none" }} />
                        <span style={{
                          flex: 1, fontSize: 10.5, color: sel ? col : T.shellText,
                          fontWeight: sel ? 700 : 400, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(ch)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedCh && (
        <div style={{ padding: "8px 10px", borderTop: `1px solid ${T.shellBorder}`, background: T.shell2 }}>
          <div style={{ height: 2, borderRadius: 2, background: colorMap[selectedCh], marginBottom: 6, opacity: 0.7 }} />
          <div style={{ fontSize: 10, color: colorMap[selectedCh], fontWeight: 700, marginBottom: 2 }}>
            {displayName(selectedCh)}
          </div>
          <div style={{ fontSize: 8, color: T.shellMuted, opacity: 0.65 }}>Click again to deselect</div>
        </div>
      )}
    </div>
  );
}


export { ChannelPanel };
