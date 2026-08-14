import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, CH_COLORS, CH_REGIONS, REGION_ACCENT, STATUS_CFG, SUBTYPE_FULL, SUBTYPE_SHORT, SUBTYPE_COLORS, REGION_ORDER, WIN_OPTS, PLOTLY_MARGIN, fmtT, isoNow, uid, annColor, getRegion } from "../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "./utils.js";
import { StatusBadge, SubtypeBadge, HybridBadge } from "./badges.jsx";
// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT: RawSignalPanel
// ─────────────────────────────────────────────────────────────────────────────
export default function RawSignalPanel({ eegData, colorMap, selectedCh, events, ruleEvents, edits, timeOffset, windowSize, onSeek }) {
  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const [w, setW]    = useState(800);
  const CONTAINER_H  = 80;
  const ML = 35, MR = 6, MT = 6, MB = 16;

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !eegData) return;
    const ctx = canvas.getContext("2d");
    const { channels, times, data, samplingRate: sr } = eegData;
    const W = canvas.width, H = canvas.height;
    const plotW = W - ML - MR, plotH = H - MT - MB;
    const totalDur = times.length ? times[times.length - 1] : 0;
    if (!totalDur) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);

    const timeToX = t => ML + (t / totalDur) * plotW;

    // Draw AI seizure bands (red)
    events.forEach(ev => {
      const edit = edits[ev.index];
      if (edit?.status === "rejected") return;
      if ((edit?.label ?? ev.label) !== "seizure") return;
      const x0 = timeToX(ev.start), x1 = timeToX(ev.end);
      ctx.fillStyle = "rgba(242,60,60,0.25)";
      ctx.fillRect(x0, MT, x1 - x0, plotH);
    });

    // Draw rule seizure bands (amber)
    (ruleEvents ?? []).forEach(ev => {
      if (ev.label !== "seizure") return;
      const x0 = timeToX(ev.start), x1 = timeToX(ev.end);
      ctx.fillStyle = "rgba(245,158,11,0.30)";
      ctx.fillRect(x0, MT, x1 - x0, plotH);
    });

    // Draw hybrid bands (purple, outline only)
    (ruleEvents ?? []).forEach(ev => {
      if (ev.hybrid_label !== "seizure") return;
      const x0 = timeToX(ev.start), x1 = timeToX(ev.end);
      ctx.strokeStyle = "rgba(124,58,237,0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, MT, x1 - x0, plotH);
    });

    // Viewport box
    const vx0 = timeToX(timeOffset);
    const vx1 = timeToX(Math.min(timeOffset + windowSize, totalDur));
    ctx.fillStyle = "rgba(37,99,235,0.10)";
    ctx.fillRect(vx0, MT, vx1 - vx0, plotH);
    ctx.strokeStyle = "rgba(37,99,235,0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(vx0, MT, vx1 - vx0, plotH);

    // Signal
    const ch    = selectedCh ?? channels[0];
    const chIdx = channels.indexOf(ch);
    const raw   = chIdx >= 0 ? (data[chIdx] ?? []) : [];
    if (raw.length) {
      const step = Math.max(1, Math.floor(raw.length / 2000));
      const vals = [];
      for (let i = 0; i < raw.length; i += step) vals.push(raw[i]);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const std  = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1;
      const mid  = MT + plotH / 2;
      ctx.strokeStyle = colorMap?.[ch] ?? "#4f8cff";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      vals.forEach((v, idx) => {
        const rawIndex = idx * step;
        // Use the backend-provided display times. Large EDF files are downsampled
        // for browser display, so rawIndex / originalSamplingRate is wrong.
        const t = Number(times?.[rawIndex] ?? (rawIndex / (sr || 100)));
        const x = ML + (t / totalDur) * plotW;
        const y = mid - ((v - mean) / std) * (plotH * 0.35);
        idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Playhead
    const px = timeToX(timeOffset);
    ctx.strokeStyle = "#EA580C";
    ctx.lineWidth   = 2;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(px, MT); ctx.lineTo(px, H - MB); ctx.stroke();

    // Time axis
    ctx.fillStyle = "#94A3B8";
    ctx.font = "9px 'Roboto', Arial, sans-serif";
    ctx.textAlign = "left";
    const step2 = Math.ceil(totalDur / 8);
    for (let t = 0; t <= totalDur; t += step2) {
      const x = ML + (t / totalDur) * plotW;
      ctx.fillText(fmtT(t), x, H - 2);
    }
  }, [eegData, events, ruleEvents, edits, timeOffset, windowSize, selectedCh, colorMap, w]);

  const handleClick = e => {
    if (!eegData || !onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const times = eegData.times;
    const totalDur = times?.length ? times[times.length - 1] : 0;
    const t = ((e.clientX - rect.left - ML) / (rect.width - ML - MR)) * totalDur;
    if (t >= 0) onSeek(t);
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        height: CONTAINER_H, position: "relative", background: T.canvas,
        borderTop: `1px solid ${T.shellBorder}`, cursor: "pointer" }}
    >
      <canvas ref={canvasRef} width={w} height={CONTAINER_H}
        style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}


export { RawSignalPanel };
