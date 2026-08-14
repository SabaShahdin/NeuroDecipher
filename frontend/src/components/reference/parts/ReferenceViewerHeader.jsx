import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { API, apiHeaders, fmtT, WIN_OPTS, CH_H, PLOTLY_MARGIN } from "../../../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "../../utils.js";

function ReferenceViewerHeader({
  C,
  fileName,
  totalDur,
  windowSize,
  setWindowSize,
  gain,
  setGain,
  onUpload,
  theme,
  setTheme,
  errorMsg,
  onResetView,

  // PLAYBACK PROPS
  isPlaying,
  togglePlay,
  jumpTo,
  timeOffset }) {

  const maxOff = Math.max(0, totalDur - windowSize);

  const baseButton = {
    height: 34,
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    background: C.panel2,
    color: C.text,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 900,
    fontFamily: "'Roboto', Arial, sans-serif",
    flex: "0 0 auto",
    boxShadow: C.dark ? "0 8px 20px rgba(0,0,0,.16)" : "0 6px 16px rgba(15,23,42,.06)" };

  const btn = {
    ...baseButton,
    width: 36,
    minWidth: 36 };

  const selectStyle = {
    height: 34,
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    background: C.panel2,
    color: C.text,
    fontSize: 12,
    fontWeight: 800,
    padding: "0 10px",
    outline: "none",
    minWidth: 78,
    fontFamily: "'Roboto', Arial, sans-serif" };

  const actionBtn = {
    ...baseButton,
    minWidth: 72,
    padding: "0 12px",
    gap: 6,
    color: C.blue || C.green,
    borderColor: hexToRgba(C.blue || C.green, 0.45),
    background: hexToRgba(C.blue || C.green, 0.12),
    fontSize: 12 };

  const Control = ({ label, children }) => (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        color: C.text,
        fontSize: 11,
        fontWeight: 900,
        whiteSpace: "nowrap",
        flex: "0 0 auto" }}
    >
      <span style={{ color: C.muted, letterSpacing: ".02em" }}>{label}</span>
      {children}
    </label>
  );

  return (
    <header
      style={{
        minHeight: 66,
        display: "grid",
        gridTemplateColumns: "minmax(260px, 1fr) auto minmax(320px, 1fr)",
        alignItems: "center",
        gap: 14,
        padding: "10px 14px",
        borderTop: `1px solid ${C.border}`,
        borderRight: `1px solid ${C.border}`,
        borderLeft: `1px solid ${C.border}`,
        borderBottomWidth: 0,
        borderBottomStyle: "solid",
        borderBottomColor: "transparent",
        background: C.dark
          ? "linear-gradient(180deg, rgba(9,22,39,.98), rgba(7,17,31,.98))"
          : "linear-gradient(180deg, rgba(255,255,255,.98), rgba(241,248,255,.98))",
        fontFamily: "'Roboto', Arial, sans-serif",
        boxShadow: C.dark
          ? "0 10px 24px rgba(0,0,0,.18)"
          : "0 8px 20px rgba(15,23,42,.07)",
        overflow: "visible",
        position: "relative" }}
    >
      {/* LEFT: FILE INFO */}
      <div
        style={{
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 14,
          overflow: "hidden" }}
      >
    

        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div
            title={fileName || "No recording loaded"}
            style={{
              color: C.text,
              fontSize: 13,
              fontWeight: 950,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 420 }}
          >
            {fileName || "No recording loaded"}
          </div>
          <div
            style={{
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 12,
              color: C.muted,
              fontSize: 11,
              fontWeight: 800,
              whiteSpace: "nowrap" }}
          >
            <span><b style={{ color: C.dim }}>Duration:</b> {totalDur ? fmtT(totalDur) : "—"}</span>
            <span><b style={{ color: C.dim }}>Window:</b> {windowSize}s</span>
          </div>
        </div>
      </div>

      {/* CENTER: PLAYBACK CONTROLS */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          padding: "6px 10px",
        
          background: C.dark ? "rgba(3,10,20,.38)" : "rgba(255,255,255,.72)",
          whiteSpace: "nowrap" }}
      >
        <button
          type="button"
          title="Back one window"
          style={btn}
          onClick={() => jumpTo(Math.max(0, timeOffset - windowSize))}
        >
          ◀
        </button>

        <button
          type="button"
          title={isPlaying ? "Pause" : "Play"}
          style={{
            ...btn,
            width: 46,
            minWidth: 46,
            color: C.green,
            borderColor: hexToRgba(C.green, 0.6),
            background: hexToRgba(C.green, 0.16),
            fontSize: 15 }}
          onClick={togglePlay}
        >
          {isPlaying ? "Ⅱ" : "▶"}
        </button>

        <button
          type="button"
          title="Forward one window"
          style={btn}
          onClick={() => jumpTo(Math.min(maxOff, timeOffset + windowSize))}
        >
          ▶
        </button>

        <span
          style={{
            marginLeft: 8,
            color: C.text,
            fontSize: 12,
            fontWeight: 950,
            minWidth: 116,
            textAlign: "left" }}
        >
          {fmtT(timeOffset)} / {fmtT(totalDur || 0)}
        </span>
      </div>

      {/* RIGHT: VIEW CONTROLS */}
      <div
        style={{
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 10,
          whiteSpace: "nowrap" }}
      >
        <Control label="Sensitivity">
          <select
            value={gain}
            onChange={(e) => setGain(Number(e.target.value))}
            style={{ ...selectStyle, width: 96 }}
          >
            {[10, 25, 50, 75, 100, 150].map((v) => (
              <option key={v} value={v}>{v}µV</option>
            ))}
          </select>
        </Control>

        <Control label="View">
          <select
            value={windowSize}
            onChange={(e) => setWindowSize(Number(e.target.value))}
            style={{ ...selectStyle, width: 78 }}
          >
            {WIN_OPTS.map((v) => (
              <option key={v} value={v}>{v}s</option>
            ))}
          </select>
        </Control>

        <button
          title="Reset EEG view"
          onClick={onResetView}
          style={{ ...actionBtn, color: C.green, borderColor: hexToRgba(C.green, 0.45), background: hexToRgba(C.green, 0.12) }}
        >
          Reset
        </button>

        <button type="button" title="Open upload page" onClick={onUpload} style={actionBtn}>
          <span style={{ fontSize: 15 }}>＋</span>
          <span>Upload</span>
        </button>
      </div>

      {errorMsg && (
        <div
          title={errorMsg}
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            bottom: -24,
            color: C.red,
            background: hexToRgba(C.red, .10),
            border: `1px solid ${hexToRgba(C.red, .28)}`,
            borderRadius: 9,
            padding: "5px 8px",
            fontSize: 11,
            fontWeight: 800,
            lineHeight: 1.25,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap" }}
        >
          {errorMsg}
        </div>
      )}
    </header>
  );
}

export default ReferenceViewerHeader;
export { ReferenceViewerHeader };
