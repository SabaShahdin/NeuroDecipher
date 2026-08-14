import { useEffect, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { BrainCircuit } from "lucide-react";
import { T, CH_H, PLOTLY_MARGIN, fmtT } from "../constants.js";

/**
 * Plotly stacked EEG viewer.
 * This uses real uploaded EEG samples:
 *   ((sample - visibleWindowMean) / visibleWindowStd) * gain + row * CH_H
 * so channels show real waveform morphology instead of flat/straight traces.
 */

function lowerBoundTime(times, target) {
  const arr = Array.isArray(times) ? times : [];
  let lo = 0;
  let hi = arr.length;
  const value = Number(target || 0);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Number(arr[mid] ?? 0) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function getVisibleTimeSlice(times, data, start, end, fallbackSamplingRate = 256) {
  const firstRowLength = Array.isArray(data?.[0]) ? data[0].length : 0;
  const timeCount = Array.isArray(times) ? times.length : 0;
  const sampleCount = Math.max(0, Math.min(timeCount || firstRowLength, firstRowLength || timeCount));
  if (sampleCount <= 0) return { i0: 0, i1: 0, wTimes: [] };

  if (timeCount >= sampleCount) {
    const i0 = Math.max(0, Math.min(sampleCount, lowerBoundTime(times, start)));
    const i1 = Math.max(i0, Math.min(sampleCount, lowerBoundTime(times, end)));
    return { i0, i1, wTimes: times.slice(i0, i1) };
  }

  // Fallback only for old responses without a times array.
  const sr = Number(fallbackSamplingRate || 256);
  const i0 = Math.max(0, Math.min(sampleCount, Math.floor(Number(start || 0) * sr)));
  const i1 = Math.max(i0, Math.min(sampleCount, Math.floor(Number(end || 0) * sr)));
  const wTimes = Array.from({ length: Math.max(0, i1 - i0) }, (_, k) => (i0 + k) / sr);
  return { i0, i1, wTimes };
}

function cleanLabel(ch) {
  return String(ch || "")
    .replace(/^eeg[\s\-_]*/i, "")
    .replace(/^(le|avg|ref|car)[\-_]/i, "")
    .replace(/[\-_](le|avg|ref|car|linked|average|reference)$/i, "")
    .replace(/-LE$/i, "")
    .trim();
}

const STYLE = {
  ai: {
    seizureFill: "rgba(242,60,60,0.13)",
    seizureLine: "#F23C3C",
    bckgFill: "rgba(69,130,215,0.05)",
    bckgLine: "rgba(69,130,215,0.0)",
    labelColor: "#F23C3C",
    labelBg: "rgba(255,255,255,0.92)",
    labelPrefix: "AI" },
  rule: {
    seizureFill: "rgba(245,158,11,0.11)",
    seizureLine: "#F59E0B",
    bckgFill: "rgba(20,184,166,0.04)",
    bckgLine: "rgba(20,184,166,0.0)",
    labelColor: "#D97706",
    labelBg: "rgba(255,251,235,0.92)",
    labelPrefix: "RB" },
  hybrid: {
    seizureFill: "rgba(124,58,237,0.10)",
    seizureLine: "#7C3AED",
    labelColor: "#7C3AED",
    labelBg: "rgba(245,243,255,0.92)",
    labelPrefix: "HY" } };

export default function EegViewer({
  eegData,
  colorMap = {},
  selectedCh,
  events = [],
  ruleEvents = [],
  edits = {},
  timeOffset = 0,
  windowSize = 10,
  gain = 35,
  drawnUpto = Infinity }) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 420 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({
        w: Math.max(420, entry.contentRect.width),
        h: Math.max(320, entry.contentRect.height) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  if (!eegData) {
    return (
      <div
        ref={wrapRef}
        style={{
          flex: 3,
          overflow: "hidden",
          background: T.canvas,
          position: "relative",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          color: T.muted }}
      >
        <div style={{ display: "flex" }}><BrainCircuit size={44} strokeWidth={1.5} color={T.muted} /></div>
        <div style={{ fontFamily: "Roboto, Arial, sans-serif", fontSize: 13, textAlign: "center", lineHeight: 1.9 }}>
          Load an EDF file to begin<br />
          <span style={{ fontSize: 11, opacity: 0.55 }}>
            AI + Rule + Hybrid analysis starts automatically
          </span>
        </div>
      </div>
    );
  }

  const { channels = [], times = [], data = [], samplingRate: sr = 256 } = eegData;
  const visStart = Number(timeOffset || 0);
  const visEnd = visStart + Number(windowSize || 10);

  // Large EDF files are downsampled by the backend before being sent to the
  // browser. Therefore we must slice by the returned `times` array instead of
  // using index = seconds * originalSamplingRate. This keeps the signal visible
  // even many minutes/hours into a long recording.
  const { i0, i1, wTimes } = getVisibleTimeSlice(times, data, visStart, visEnd, sr);

  let globalYMin = Infinity;
  let globalYMax = -Infinity;

  const eegTraces = channels.map((ch, row) => {
    const raw = data[row] ?? [];
    const slice = raw.slice(i0, i1).map(v => Number(v || 0));
    const mean = slice.reduce((s, v) => s + v, 0) / (slice.length || 1);
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / (slice.length || 1)) || 1;
    const isSel = ch === selectedCh;

    const yVals = slice.map((v, idx) => {
      const t = times[i0 + idx];
      if (t !== undefined && t > drawnUpto) return null;
      const y = ((v - mean) / std) * gain + row * CH_H;
      if (y !== null && y !== undefined && Number.isFinite(y)) {
        globalYMin = Math.min(globalYMin, y);
        globalYMax = Math.max(globalYMax, y);
      }
      return y;
    });

    return {
      x: wTimes,
      y: yVals,
      type: "scatter",
      mode: "lines",
      name: ch,
      line: { width: isSel ? 2.25 : 0.9, color: colorMap[ch] || "#60A5FA" },
      opacity: selectedCh && !isSel ? 0.5 : 1,
      connectgaps: false,
      hoverinfo: "none" };
  });

  const hasData = Number.isFinite(globalYMin) && Number.isFinite(globalYMax);
  const yPad = hasData ? Math.max(CH_H * 0.12, (globalYMax - globalYMin) * 0.01) : CH_H;
  const yRangeMin = hasData ? globalYMin - yPad : -CH_H;
  const yRangeMax = hasData ? globalYMax + yPad : Math.max(CH_H, (channels.length - 1) * CH_H + CH_H);

  const visibleAiEvents = events.filter(ev => Number(ev.end || 0) > visStart && Number(ev.start || 0) < visEnd);
  const visibleRuleEvents = (ruleEvents ?? []).filter(ev => Number(ev.end || 0) > visStart && Number(ev.start || 0) < visEnd);

  const makeRect = (x0, x1, fillcolor, lineColor, lineWidth, lineDash, layer = "below") => ({
    type: "rect",
    x0: Math.max(Number(x0 || 0), visStart),
    x1: Math.min(Number(x1 || 0), visEnd),
    y0: yRangeMin,
    y1: yRangeMax,
    fillcolor,
    line: { width: lineWidth, color: lineColor, dash: lineDash },
    layer });

  const shapes = [
    ...visibleRuleEvents
      .filter(ev => ev.label !== "seizure")
      .map(ev => makeRect(ev.start, ev.end, STYLE.rule.bckgFill, STYLE.rule.bckgLine, 0, "solid")),
    ...visibleAiEvents
      .filter(ev => {
        const edit = edits[ev.index];
        return (edit?.label ?? ev.label) !== "seizure" && edit?.status !== "rejected";
      })
      .map(ev => makeRect(ev.start, ev.end, STYLE.ai.bckgFill, STYLE.ai.bckgLine, 0, "solid")),
    ...visibleRuleEvents
      .filter(ev => ev.hybrid_label === "seizure")
      .map(ev => makeRect(ev.start, ev.end, STYLE.hybrid.seizureFill, STYLE.hybrid.seizureLine, 1.5, "solid")),
    ...visibleRuleEvents
      .filter(ev => ev.label === "seizure")
      .map(ev => makeRect(ev.start, ev.end, STYLE.rule.seizureFill, STYLE.rule.seizureLine, 1.5, "dash")),
    ...visibleAiEvents
      .filter(ev => {
        const edit = edits[ev.index];
        return (edit?.label ?? ev.label) === "seizure" && edit?.status !== "rejected";
      })
      .map(ev => {
        const edit = edits[ev.index];
        const status = edit?.status ?? "ai_predicted";
        return makeRect(
          ev.start,
          ev.end,
          STYLE.ai.seizureFill,
          status === "accepted" ? T.ok : status === "modified" ? T.warn : STYLE.ai.seizureLine,
          1.5,
          status === "ai_predicted" ? "dot" : "solid",
        );
      }),
    {
      type: "line",
      x0: timeOffset,
      x1: timeOffset,
      y0: yRangeMin,
      y1: yRangeMax,
      line: { color: T.playhead, width: 1.5, dash: "dot" },
      layer: "above" },
  ];

  const makeLabel = (ev, style, yFrac, subtypeKey) => {
    const x = (Math.max(Number(ev.start || 0), visStart) + Math.min(Number(ev.end || 0), visEnd)) / 2;
    const subCode = ev[subtypeKey];
    const prefix = subCode ? `${style.labelPrefix}·${String(subCode).toUpperCase()}` : style.labelPrefix;
    return {
      x,
      y: yRangeMin + (yRangeMax - yRangeMin) * yFrac,
      text: `${prefix} ${fmtT(Number(ev.start || 0))}`,
      showarrow: false,
      font: { size: 9, color: style.labelColor, family: "Roboto, Arial, sans-serif" },
      bgcolor: style.labelBg,
      bordercolor: style.labelColor,
      borderwidth: 1 };
  };

  const annotations = [
    ...visibleAiEvents
      .filter(ev => (edits[ev.index]?.label ?? ev.label) === "seizure" && edits[ev.index]?.status !== "rejected")
      .map(ev => makeLabel(ev, STYLE.ai, 1.0, "ai_subtype")),
    ...visibleRuleEvents
      .filter(ev => ev.label === "seizure")
      .map(ev => makeLabel(ev, STYLE.rule, 0.93, "rule_subtype")),
    ...visibleRuleEvents
      .filter(ev => ev.hybrid_label === "seizure")
      .map(ev => makeLabel(ev, STYLE.hybrid, 0.86, "rule_subtype")),
  ];

  const tickVals = channels.map((_, i) => i * CH_H);
  const tickText = channels.map(cleanLabel);
  const PM = PLOTLY_MARGIN || { l: 46, r: 8, t: 8, b: 28 };

  return (
    <div
      ref={wrapRef}
      style={{
        flex: 3,
        overflow: "hidden",
        background: T.canvas,
        position: "relative",
        borderBottom: `1px solid ${T.border}` }}
    >
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 8,
          zIndex: 10,
          display: "flex",
          gap: 6,
          pointerEvents: "none",
          flexWrap: "wrap" }}
      >
        <LegendBadge color="#F23C3C" dash="dot" label="AI seizure" />
        <LegendBadge color="#F59E0B" dash="dashed" label="Rule seizure" />
        <LegendBadge color="#7C3AED" dash="solid" label="Hybrid seizure" />
      </div>

      {!hasData && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 9,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            color: T.muted,
            fontFamily: "Roboto, Arial, sans-serif",
            fontSize: 12,
            background: "rgba(15,23,42,0.03)"
          }}
        >
          No display samples in this time range. Try another time window or reduce display downsampling.
        </div>
      )}

      <Plot
        data={eegTraces}
        layout={{
          autosize: true,
          width: size.w,
          height: size.h,
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: T.canvasBg,
          margin: PM,
          shapes,
          annotations,
          uirevision: "eeg-real-signal",
          xaxis: {
            range: [visStart, visEnd],
            showgrid: true,
            gridcolor: T.plotGrid,
            tickfont: { size: 9, family: "Roboto, Arial, sans-serif", color: T.muted },
            ticksuffix: "s",
            zeroline: false,
            fixedrange: true,
            title: { text: "Time (s)", font: { size: 10, family: "Roboto, Arial, sans-serif", color: T.muted }, standoff: 4 } },
          yaxis: {
            tickmode: "array",
            tickvals: tickVals,
            ticktext: tickText,
            tickfont: { size: 10, family: "Roboto, Arial, sans-serif", color: T.muted },
            showgrid: false,
            zeroline: false,
            fixedrange: true,
            autorange: false,
            range: [yRangeMin, yRangeMax] },
          showlegend: false,
          hovermode: "x unified" }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

function LegendBadge({ color, dash, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.45)", borderRadius: 4, padding: "2px 6px" }}>
      <svg width="18" height="8" style={{ flexShrink: 0 }}>
        <line x1="1" y1="4" x2="17" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash === "dashed" ? "4 2" : dash === "dot" ? "2 2" : "none"} />
      </svg>
      <span style={{ fontSize: 9, fontFamily: "'Roboto', Arial, sans-serif", fontWeight: 700, color, letterSpacing: "0.04em" }}>{label}</span>
    </div>
  );
}

export { EegViewer };
