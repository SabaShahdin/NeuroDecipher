import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, CH_COLORS, CH_REGIONS, REGION_ACCENT, STATUS_CFG, SUBTYPE_FULL, SUBTYPE_SHORT, SUBTYPE_COLORS, REGION_ORDER, WIN_OPTS, PLOTLY_MARGIN, fmtT, isoNow, uid, annColor, getRegion } from "../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "./utils.js";
import { StatusBadge, SubtypeBadge, HybridBadge } from "./badges.jsx";
// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT: Toolbar
// ─────────────────────────────────────────────────────────────────────────────
export default function Toolbar({
  fileName, phase, tool, setTool,
  isPlaying, onTogglePlay,
  windowSize, setWindowSize, gain, setGain,
  clinician, setClinician,
  timeOffset, totalDur,
  errorMsg, onUpload }) {
  const canPlay = phase === "ready";

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "0 16px", height: 52,
        background: T.shell1, borderBottom: `1px solid ${T.shellBorder}`,
        overflowX: "auto", overflowY: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginRight: 8, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Roboto', Arial, sans-serif", fontSize: 15, fontWeight: 800, letterSpacing: "-0.04em", color: T.shellText }}>
            Neuro<span style={{ color: T.shellAccent }}>Decipher</span>
          </span>
          <span style={{
            fontSize: 8, fontFamily: "'Roboto', Arial, sans-serif", color: T.shellMuted, fontWeight: 600,
            background: T.shell2, border: `1px solid ${T.shellBorder}`, borderRadius: 3, padding: "1px 5px", letterSpacing: "0.06em" }}>EEG · AI + Rule</span>
        </div>

        <div style={{ width: 1, height: 20, background: T.shellBorder, margin: "0 4px", flexShrink: 0 }} />

        {/* File loader */}
        <label style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 13px", fontSize: 11, cursor: "pointer", flexShrink: 0,
          border: `1.5px solid ${fileName ? T.shellBorder2 : T.shellAccent}`,
          borderRadius: 6,
          background: fileName ? T.shell2 : T.shellAccent,
          color: fileName ? T.shellText : "#fff",
          fontWeight: 600, whiteSpace: "nowrap",
          fontFamily: "'Roboto', Arial, sans-serif" }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2h4l2 2h2a1 1 0 011 1v5a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
          </svg>
          {fileName
            ? <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{fileName}</span>
            : "New Upload"}
          <input type="file" accept=".edf" style={{ display: "none" }} onChange={onUpload} />
        </label>

        <div style={{ width: 1, height: 20, background: T.shellBorder, margin: "0 4px", flexShrink: 0 }} />

        {/* Playback */}
        <button onClick={onTogglePlay} disabled={!canPlay} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 11, flexShrink: 0,
          border: `1.5px solid ${canPlay ? (isPlaying ? T.shellAccent : T.shellBorder2) : T.shellBorder}`,
          borderRadius: 6, fontWeight: 600,
          background: canPlay && isPlaying ? T.shellAccent : T.shell2,
          color: canPlay ? (isPlaying ? "#fff" : T.shellText) : T.shellMuted,
          opacity: canPlay ? 1 : 0.4, fontFamily: "'Roboto', Arial, sans-serif", cursor: canPlay ? "pointer" : "not-allowed" }}>
          {isPlaying ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect x="1" y="1" width="3" height="8" rx="1"/>
              <rect x="6" y="1" width="3" height="8" rx="1"/>
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M2 1l7 4-7 4V1z"/>
            </svg>
          )}
          {isPlaying ? "Pause" : "Play"}
        </button>

        <div style={{ width: 1, height: 20, background: T.shellBorder, margin: "0 4px", flexShrink: 0 }} />

        {/* Window size */}
        <span style={{ fontSize: 9, color: T.shellMuted, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, fontFamily: "'Roboto', Arial, sans-serif", flexShrink: 0 }}>Win</span>
        {WIN_OPTS.map(w => (
          <button key={w} onClick={() => setWindowSize(w)} style={{
            padding: "4px 8px", fontSize: 10, borderRadius: 5, border: "none", cursor: "pointer",
            background: windowSize === w ? T.shellAccent : T.shell2,
            color: windowSize === w ? "#fff" : T.shellMuted,
            fontFamily: "'Roboto', Arial, sans-serif", fontWeight: 600, flexShrink: 0 }}>{w}s</button>
        ))}

        <div style={{ width: 1, height: 20, background: T.shellBorder, margin: "0 4px", flexShrink: 0 }} />

        {/* Gain */}
        <span style={{ fontSize: 9, color: T.shellMuted, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, fontFamily: "'Roboto', Arial, sans-serif", flexShrink: 0 }}>Gain</span>
        <input type="range" min="5" max="200" value={gain}
          onChange={e => setGain(Number(e.target.value))}
          style={{ width: 60, flexShrink: 0 }}
        />
        <span style={{ fontSize: 9, color: T.shellText, fontFamily: "'Roboto', Arial, sans-serif", flexShrink: 0, minWidth: 24 }}>{gain}</span>

        <div style={{ width: 1, height: 20, background: T.shellBorder, margin: "0 4px", flexShrink: 0 }} />

        {/* Clinician */}
        <input
          value={clinician} onChange={e => setClinician(e.target.value)}
          placeholder="Clinician name"
          style={{
            padding: "4px 9px", fontSize: 10, border: `1px solid ${T.shellBorder}`,
            borderRadius: 5, background: T.shell1, color: T.shellText,
            fontFamily: "'Roboto', Arial, sans-serif", width: 130, flexShrink: 0 }}
        />

        {/* Error */}
        {errorMsg && (
          <span style={{
            fontSize: 9, color: "#B91C1C", background: "#FEF2F2",
            border: "1px solid #FECACA", padding: "3px 8px", borderRadius: 5,
            fontFamily: "'Roboto', Arial, sans-serif", flexShrink: 0, maxWidth: 200,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{errorMsg}</span>
        )}
      </div>
    </div>
  );
}


export { Toolbar };
