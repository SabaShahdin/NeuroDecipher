import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { API, apiHeaders, fmtT, WIN_OPTS, CH_H, PLOTLY_MARGIN } from "../../../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "../../utils.js";
import { ReferenceLegendBadge } from "./ReferenceTimelineStack.jsx";


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

  const sr = Number(fallbackSamplingRate || 256);
  const i0 = Math.max(0, Math.min(sampleCount, Math.floor(Number(start || 0) * sr)));
  const i1 = Math.max(i0, Math.min(sampleCount, Math.floor(Number(end || 0) * sr)));
  const wTimes = Array.from({ length: Math.max(0, i1 - i0) }, (_, k) => (i0 + k) / sr);
  return { i0, i1, wTimes };
}

function ReferenceEegCanvas({ C, eegData, colorMap = {}, selectedCh, events = [], ruleEvents = [], edits = {}, timeOffset, windowSize, gain, selectedSegmentIndex, onSelectSegment }) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 1000, h: 500 });
  const bundles = useMemo(() => buildSegmentBundles(events, ruleEvents, edits), [events, ruleEvents, edits]);

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
          flex: 1,
          minHeight: 360,
          border: `1px solid ${C.line}`,
          background: C.gridBg,
          color: C.muted,
          display: "grid",
          placeItems: "center",
          fontFamily: "'Roboto', Arial, sans-serif",
          fontSize: 12 }}
      >
        Upload an EDF recording to view signal
      </div>
    );
  }

  const { channels = [], times = [], data = [], samplingRate: sr = 256 } = eegData;
  const safeWindowSize = Math.max(1, Number(windowSize || 10));
  const visStart = Number(timeOffset || 0);
  const visEnd = visStart + safeWindowSize;

  // For large EDF files the backend sends display-downsampled data.  Use the
  // returned times array for slicing; do not assume index = seconds * original SR.
  const { i0, i1, wTimes } = getVisibleTimeSlice(times, data, visStart, visEnd, sr);

  // This is the stacked Plotly EEG trace style from your reference zip.
  // Each channel is centered by its visible-window mean, scaled by visible-window std,
  // then shifted by row * CH_H so the real waveform is visible instead of straight lines.
  let globalYMin = Infinity;
  let globalYMax = -Infinity;

  const eegTraces = channels.map((ch, row) => {
    const raw = data[row] ?? [];
    const slice = raw.slice(i0, i1).map(v => Number(v || 0));
    const mean = slice.reduce((sum, value) => sum + value, 0) / (slice.length || 1);
    const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (slice.length || 1);
    const std = Math.sqrt(variance) || 1;
    const isSelected = ch === selectedCh;

    const yVals = slice.map((value) => {
      const y = ((value - mean) / std) * Number(gain || 35) + row * CH_H;
      if (Number.isFinite(y)) {
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
      line: {
        width: isSelected ? 2.35 : 0.95,
        color: colorMap[ch] || C.trace || "#60A5FA" },
      opacity: selectedCh && !isSelected ? 0.42 : 1,
      connectgaps: false,
      hoverinfo: "none" };
  });

  const hasData = Number.isFinite(globalYMin) && Number.isFinite(globalYMax);
  const yPad = hasData ? Math.max(CH_H * 0.15, (globalYMax - globalYMin) * 0.01) : CH_H;
  const yRangeMin = hasData ? globalYMin - yPad : -CH_H;
  const yRangeMax = hasData ? globalYMax + yPad : Math.max(CH_H, (channels.length - 1) * CH_H + CH_H);

  const clampStart = (value) => Math.max(Number(value || 0), visStart);
  const clampEnd = (value) => Math.min(Number(value || 0), visEnd);

  const makeRect = (x0, x1, fillcolor, lineColor, lineWidth = 1, lineDash = "solid") => ({
    type: "rect",
    x0: clampStart(x0),
    x1: clampEnd(x1),
    y0: yRangeMin,
    y1: yRangeMax,
    fillcolor,
    line: { width: lineWidth, color: lineColor, dash: lineDash },
    layer: "below" });

  const visibleBundles = bundles.filter(b => Number(b.end ?? 0) > visStart && Number(b.start ?? 0) < visEnd);

  const shapes = [];
  visibleBundles.forEach(b => {
    const isAiSeizure = b.aiLabel === "seizure";
    const isRuleSeizure = b.rule?.label === "seizure";
    const isHybridSeizure = b.rule?.hybrid_label === "seizure";
    const isSelected = b.index === selectedSegmentIndex;

    if (isHybridSeizure) {
      shapes.push(makeRect(b.start, b.end, hexToRgba(C.purple, isSelected ? 0.26 : 0.12), hexToRgba(C.purple, isSelected ? 0.95 : 0.55), isSelected ? 2 : 1.2, "solid"));
    } else if (isRuleSeizure) {
      shapes.push(makeRect(b.start, b.end, hexToRgba(C.orange, isSelected ? 0.24 : 0.11), hexToRgba(C.orange, isSelected ? 0.95 : 0.58), isSelected ? 2 : 1.2, "dash"));
    } else if (isAiSeizure) {
      shapes.push(makeRect(b.start, b.end, hexToRgba(C.red, isSelected ? 0.24 : 0.11), hexToRgba(C.red, isSelected ? 0.95 : 0.58), isSelected ? 2 : 1.2, "dot"));
    } else if (isSelected) {
      shapes.push(makeRect(b.start, b.end, hexToRgba(C.blue, 0.16), hexToRgba(C.blue, 0.82), 1.4, "solid"));
    }
  });

  // Red playhead/current time marker in the middle of the visible window.
  shapes.push({
    type: "line",
    x0: visStart + safeWindowSize / 2,
    x1: visStart + safeWindowSize / 2,
    y0: yRangeMin,
    y1: yRangeMax,
    line: { color: C.red, width: 2 },
    layer: "above" });

  const tickVals = channels.map((_, i) => i * CH_H);
  const tickText = channels.map(ch =>
    String(ch)
      .replace(/^EEG\s+/i, "")
      .replace(/-LE$/i, "")
      .replace(/-REF$/i, "")
      .replace(/-AVG$/i, "")
  );

  const annotations = visibleBundles
    .filter(b => b.aiLabel === "seizure" || b.rule?.label === "seizure" || b.rule?.hybrid_label === "seizure" || b.index === selectedSegmentIndex)
    .map(b => {
      const label =
        b.rule?.hybrid_label === "seizure" ? "HY" :
        b.rule?.label === "seizure" ? "RB" :
        b.aiLabel === "seizure" ? "AI" :
        "SEG";
      const color =
        label === "HY" ? C.purple :
        label === "RB" ? C.orange :
        label === "AI" ? C.red :
        C.blue;
      return {
        x: (clampStart(b.start) + clampEnd(b.end)) / 2,
        y: yRangeMax,
        yanchor: "top",
        text: `${label} · ${fmtT(Number(b.start || 0))}`,
        showarrow: false,
        font: { size: 9, color, family: "Roboto, Arial, sans-serif" },
        bgcolor: C.dark ? "rgba(6,17,29,.86)" : "rgba(255,255,255,.92)",
        bordercolor: color,
        borderwidth: 1 };
    });

  const handleClick = (event) => {
    const point = event?.points?.[0];
    if (!point) return;
    const t = Number(point.x);
    const hit = visibleBundles.find(b => t >= Number(b.start ?? 0) && t <= Number(b.end ?? 0));
    if (hit) onSelectSegment?.(hit.index, hit.start);
  };

  const PM = PLOTLY_MARGIN || { l: 58, r: 8, t: 24, b: 24 };

  return (
    <div
      ref={wrapRef}
      style={{
        flex: 1,
        minHeight: 360,
        border: `1px solid ${C.line}`,
        background: C.gridBg,
        overflow: "hidden",
        cursor: bundles.length ? "crosshair" : "default",
        position: "relative" }}
    >
      <div
        style={{
          position: "absolute",
          top: 7,
          right: 8,
          zIndex: 10,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          pointerEvents: "none" }}
      >
        <ReferenceLegendBadge color={C.red} label="AI seizure" dash="dot" />
        <ReferenceLegendBadge color={C.orange} label="Rule seizure" dash="dash" />
        <ReferenceLegendBadge color={C.purple} label="Hybrid seizure" dash="solid" />
      </div>

      {!hasData && (
        <div style={{ position: "absolute", inset: 0, zIndex: 9, display: "grid", placeItems: "center", pointerEvents: "none", color: C.muted, fontFamily: "'Roboto', Arial, sans-serif", fontSize: 12 }}>
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
          plot_bgcolor: C.gridBg,
          margin: PM,
          shapes,
          annotations,
          uirevision: "reference-eeg",
          xaxis: {
            range: [visStart, visEnd],
            showgrid: true,
            gridcolor: C.grid,
            zeroline: false,
            fixedrange: true,
            ticksuffix: "s",
            tickfont: { size: 9, family: "Roboto, Arial, sans-serif", color: C.muted } },
          yaxis: {
            tickmode: "array",
            tickvals: tickVals,
            ticktext: tickText,
            tickfont: { size: 9, family: "Roboto, Arial, sans-serif", color: C.muted },
            showgrid: false,
            zeroline: false,
            fixedrange: true,
            autorange: false,
            range: [yRangeMin, yRangeMax] },
          showlegend: false,
          hovermode: false }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: "100%", height: "100%" }}
        onClick={handleClick}
      />
    </div>
  );
}

export default ReferenceEegCanvas;
export { ReferenceEegCanvas };
