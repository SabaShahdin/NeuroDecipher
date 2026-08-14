import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API, apiHeaders, fmtT } from "../../constants.js";
import { pct, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "../utils.js";
function MiniStatCard({ C, label, value, color, sub }) {
  return <div style={{ border: `1px solid ${C.line}`, background: C.panel2, borderRadius: 8, padding: 12, minHeight: 78 }}>
    <div style={{ color: C.muted, fontSize: 9, fontFamily: "'Roboto', Arial, sans-serif", letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</div>
    <div style={{ color, fontSize: 25, fontWeight: 950, marginTop: 3 }}>{value}</div>
    {sub && <div style={{ color: C.dim, fontSize: 9, marginTop: 2 }}>{sub}</div>}
  </div>;
}

function SimpleBarChart({ C, data = [], color = null, height = 135 }) {
  const max = Math.max(1, ...data.map(x => Number(x.value ?? x.count ?? 0)));
  return <div style={{ height, display: "flex", alignItems: "end", gap: 10, padding: "8px 4px 0", borderTop: `1px solid ${C.line}` }}>
    {data.length === 0 && <div style={{ color: C.muted, fontSize: 11 }}>No backend chart data yet.</div>}
    {data.map((x, i) => {
      const val = Number(x.value ?? x.count ?? 0);
      const c = color || [C.purple, C.yellow, C.blue, C.orange, C.green, C.red][i % 6];
      return <div key={`${x.label}-${i}`} style={{ flex: 1, minWidth: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
        <div title={`${x.label}: ${val}`} style={{ width: "70%", minHeight: 3, height: `${Math.max(4, (val / max) * (height - 42))}px`, background: c, borderRadius: "5px 5px 0 0", boxShadow: `0 0 18px ${hexToRgba(c,.18)}` }} />
        <div style={{ color: C.muted, fontSize: 8.5, textAlign: "center", overflowWrap: "anywhere" }}>{x.label}</div>
      </div>;
    })}
  </div>;
}

function SimpleTimeline({ C, bundles = [], type = "hybrid", onSelect }) {
  const totalDur = Math.max(1, ...bundles.map(b => Number(b.end || 0)));
  return <div style={{ height: 74, border: `1px solid ${C.line}`, background: C.panel3, borderRadius: 8, position: "relative", overflow: "hidden", paddingTop: 22 }}>
    <div style={{ position: "absolute", left: 10, top: 7, color: C.muted, fontSize: 9, fontFamily: "'Roboto', Arial, sans-serif" }}>Timeline · {type}</div>
    {bundles.map(b => {
      const label = type === "ai" ? b.ai?.label : type === "rule" ? b.rule?.label : b.rule?.hybrid_label;
      const isSz = label === "seizure";
      const color = type === "ai" ? C.blue : type === "rule" ? C.orange : isSz ? C.red : C.green;
      return <button key={b.index} onClick={() => onSelect?.(b.index, b.start)} title={`Segment ${b.index} · ${fmtT(b.start)}-${fmtT(b.end)}`} style={{ position: "absolute", left: `${(Number(b.start||0)/totalDur)*100}%`, width: `${Math.max(.6, ((Number(b.end||0)-Number(b.start||0))/totalDur)*100)}%`, top: 34, height: 18, border: 0, borderRadius: 3, background: color, opacity: isSz ? .95 : .75, cursor: "pointer" }} />;
    })}
  </div>;
}


function AiExplainCard({ C, title, subtitle, children, right }) {
  return <section style={{
    border: `1px solid ${C.line}`,
    background: C.panel2,
    borderRadius: 12,
    overflow: "hidden",
    minWidth: 0,
    boxShadow: `0 18px 45px ${hexToRgba("#000000", C.dark ? .16 : .05)}` }}>
    <div style={{
      minHeight: 46,
      padding: "10px 12px",
      borderBottom: `1px solid ${C.line}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontWeight: 950, fontSize: 13, lineHeight: 1.25, overflowWrap: "anywhere" }}>{title}</div>
        {subtitle && <div style={{ color: C.muted, fontSize: 10, marginTop: 3, lineHeight: 1.35, overflowWrap: "anywhere" }}>{subtitle}</div>}
      </div>
      {right}
    </div>
    <div style={{ padding: 12, minWidth: 0 }}>{children}</div>
  </section>;
}

function AiLineChart({ C, data = [], height = 172 }) {
  const w = 660;
  const h = height;
  const pad = 28;
  const vals = data.map(d => Number(d.confidence ?? d.value ?? 0));
  const n = Math.max(1, vals.length - 1);
  const points = vals.map((v, i) => {
    const x = pad + (i / n) * (w - pad * 2);
    const y = h - pad - Math.max(0, Math.min(1, v)) * (h - pad * 2);
    return [x, y];
  });
  const d = points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return <div style={{ width: "100%", overflow: "hidden" }}>
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      {[0,.25,.5,.75,1].map(v => <g key={v}>
        <line x1={pad} x2={w-pad} y1={h-pad-v*(h-pad*2)} y2={h-pad-v*(h-pad*2)} stroke={C.line} strokeWidth="1" />
        <text x="4" y={h-pad-v*(h-pad*2)+4} fill={C.muted} fontSize="10">{Math.round(v*100)}%</text>
      </g>)}
      <path d={d} fill="none" stroke={C.blue} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p,i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" fill={data[i]?.label === "seizure" ? C.red : C.green} stroke={C.panel2} strokeWidth="2" />)}
    </svg>
    <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 9, fontFamily: "'Roboto', Arial, sans-serif" }}>
      <span>Segment 1</span><span>{data.length ? `Segment ${data[data.length-1].segment}` : "No AI predictions yet"}</span>
    </div>
  </div>;
}

function AiHeatmap({ C, heatmap }) {
  const rows = heatmap?.rows || [];
  const bins = heatmap?.timeBins || [];
  const visible = rows.slice(0, 19);
  return <div style={{ display: "grid", gap: 5, overflowX: "auto", paddingBottom: 4 }}>
    <div style={{ display: "grid", gridTemplateColumns: `76px repeat(${Math.max(1, bins.length)}, minmax(18px,1fr))`, gap: 3, minWidth: Math.max(460, 76 + bins.length*23) }}>
      <div />
      {bins.map((b,i)=><div key={i} style={{ color: C.dim, fontSize: 8, textAlign: "center", fontFamily: "'Roboto', Arial, sans-serif" }}>{Number(b).toFixed(0)}s</div>)}
      {visible.map((r, ri)=><div key={r.channel || ri} style={{ display: "contents" }}>
        <div style={{ color: C.muted, fontSize: 9, lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.channel}</div>
        {(r.values || []).map((v, ci) => {
          const val = Math.max(0, Math.min(1, Number(v || 0)));
          const color = val > .66 ? C.red : val > .33 ? C.orange : C.blue;
          return <div key={ci} title={`${r.channel} · ${Math.round(val*100)}%`} style={{ height: 18, borderRadius: 3, background: hexToRgba(color, .15 + val*.72), border: `1px solid ${hexToRgba(color,.18)}` }} />;
        })}
      </div>)}
    </div>
  </div>;
}

function AiTopography({ C, points = [] }) {
  const sorted = [...points].sort((a,b)=>Number(b.value||0)-Number(a.value||0));
  return <div style={{ display: "grid", gridTemplateColumns: "minmax(210px, .8fr) minmax(180px, 1fr)", gap: 12, alignItems: "center" }}>
    <svg viewBox="0 0 260 260" style={{ width: "100%", maxHeight: 260 }}>
      <defs><radialGradient id="brainGlow"><stop offset="0" stopColor={hexToRgba(C.blue,.35)} /><stop offset="1" stopColor={hexToRgba(C.green,.10)} /></radialGradient></defs>
      <circle cx="130" cy="130" r="102" fill="url(#brainGlow)" stroke={C.line} strokeWidth="3" />
      <path d="M115 31 Q130 16 145 31" stroke={C.line} strokeWidth="3" fill="none" />
      <path d="M28 132 Q13 145 31 158" stroke={C.line} strokeWidth="3" fill="none" />
      <path d="M232 132 Q247 145 229 158" stroke={C.line} strokeWidth="3" fill="none" />
      {points.map((p,i)=>{
        const val = Math.max(0, Math.min(1, Number(p.value||0)));
        const x = 130 + Number(p.x||0)*96;
        const y = 130 + Number(p.y||0)*96;
        const color = val > .66 ? C.red : val > .33 ? C.orange : C.blue;
        return <g key={p.channel || i}>
          <circle cx={x} cy={y} r={7 + val*10} fill={hexToRgba(color, .18 + val*.42)} stroke={color} strokeWidth="2" />
          <text x={x} y={y+3} textAnchor="middle" fill={C.text} fontSize="8" fontWeight="800">{String(p.channel || "").replace(/^EEG\s+/,'').replace(/-LE$/,'')}</text>
        </g>;
      })}
    </svg>
    <div style={{ display: "grid", gap: 7 }}>
      {sorted.slice(0, 8).map((p,i)=><div key={p.channel || i} style={{ display: "grid", gridTemplateColumns: "30px minmax(0,1fr) 48px", gap: 8, alignItems: "center", fontSize: 10 }}>
        <span style={{ color: C.dim, fontFamily: "'Roboto', Arial, sans-serif" }}>#{i+1}</span>
        <div style={{ minWidth: 0 }}><div style={{ color: C.text, fontWeight: 850 }}>{p.channel}</div><div style={{ height: 5, borderRadius: 9, background: C.dark ? "#102033" : "#E2E8F0", overflow: "hidden", marginTop: 4 }}><div style={{ width: `${Math.round(Number(p.value||0)*100)}%`, height: "100%", background: C.blue }} /></div></div>
        <b style={{ color: C.blue, textAlign: "right" }}>{Math.round(Number(p.value||0)*100)}%</b>
      </div>)}
    </div>
  </div>;
}

function AiSpectrogram({ C, spectrogram }) {
  const vals = spectrogram?.values || [];
  const freqs = spectrogram?.freqBins || [];
  const times = spectrogram?.timeBins || [];
  return <div style={{ overflowX: "auto", paddingBottom: 4 }}>
    <div style={{ minWidth: 520, display: "grid", gridTemplateColumns: `58px repeat(${Math.max(1, times.length)}, minmax(9px,1fr))`, gap: 2 }}>
      {vals.length === 0 && <div style={{ gridColumn: "1 / -1", color: C.muted, fontSize: 11 }}>No spectrogram available until a recording is loaded and persisted.</div>}
      {vals.map((row, ri)=><div key={ri} style={{ display: "contents" }}>
        <div style={{ color: C.dim, fontSize: 8, textAlign: "right", paddingRight: 5, lineHeight: "12px" }}>{freqs[ri] ?? ri}Hz</div>
        {row.map((v, ci)=>{
          const val = Math.max(0, Math.min(1, Number(v || 0)));
          const color = val > .66 ? C.red : val > .33 ? C.orange : C.blue;
          return <div key={ci} style={{ height: 12, background: hexToRgba(color, .1 + val*.75), borderRadius: 2 }} title={`${spectrogram?.channel || "channel"} · ${freqs[ri]}Hz · ${Math.round(val*100)}%`} />;
        })}
      </div>)}
    </div>
    <div style={{ marginTop: 6, color: C.muted, fontSize: 10 }}>Channel: <b style={{ color: C.text }}>{spectrogram?.channel || "—"}</b></div>
  </div>;
}

function AiFeatureTable({ C, rows = [] }) {
  return <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560, fontSize: 11 }}>
      <thead><tr style={{ color: C.muted, textAlign: "left" }}><th style={{ padding: 8 }}>Feature</th><th>Contribution</th><th>Magnitude</th><th>Interpretation</th></tr></thead>
      <tbody>{rows.map((r,i)=><tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
        <td style={{ padding: 8, color: C.text, fontWeight: 850 }}>{r.feature}</td>
        <td style={{ color: Number(r.contribution) >= 0 ? C.red : C.green, fontFamily: "'Roboto', Arial, sans-serif" }}>{Number(r.contribution || 0).toFixed(3)}</td>
        <td><div style={{ height: 7, width: 120, background: C.dark ? "#102033" : "#E2E8F0", borderRadius: 10, overflow: "hidden" }}><div style={{ width: `${Math.min(100, Number(r.magnitude||0)*100)}%`, height: "100%", background: Number(r.contribution) >= 0 ? C.red : C.green }} /></div></td>
        <td style={{ color: C.muted }}>{r.interpretation}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function AiModelMetadata({ C, metadata = {}, stability = {}, uncertainty = {} }) {
  const items = [
    ["Detection model", metadata.detectionModel], ["Classification model", metadata.classificationModel], ["Graph method", metadata.graphMethod],
    ["Window", `${metadata.windowSeconds ?? "—"}s`], ["Resampled Fs", `${metadata.resampledFrequency ?? "—"} Hz`], ["Channels", metadata.standardChannels],
    ["Stability", pct(stability.score)], ["Label flips", stability.labelFlips ?? 0], ["Mean uncertainty", pct(uncertainty.meanUncertainty)], ["Max uncertainty", pct(uncertainty.maxUncertainty)]
  ];
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
    {items.map(([k,v])=><div key={k} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 9, minWidth: 0 }}>
      <div style={{ color: C.dim, fontSize: 8.5, textTransform: "uppercase", letterSpacing: ".08em" }}>{k}</div>
      <div style={{ color: C.text, fontSize: 11, fontWeight: 850, marginTop: 3, overflowWrap: "anywhere" }}>{v ?? "—"}</div>
    </div>)}
    <div style={{ gridColumn: "1 / -1", color: C.muted, fontSize: 10, lineHeight: 1.5, overflowWrap: "anywhere" }}>{metadata.explainabilityMode}</div>
  </div>;
}


function AiMiniLineGraph({ C, series = [], height = 220 }) {
  const all = series.flatMap(s => s.points || []);
  const maxX = Math.max(1, ...all.map(p => Number(p.x || 0)));
  const minX = Math.min(0, ...all.map(p => Number(p.x || 0)));
  const padL = 42, padR = 16, padT = 18, padB = 34;
  const W = 900, H = height;
  const sx = x => padL + ((Number(x || 0) - minX) / Math.max(1e-9, maxX - minX)) * (W - padL - padR);
  const sy = y => padT + (1 - Math.max(0, Math.min(1, Number(y || 0)))) * (H - padT - padB);
  const ticks = [0, .25, .5, .75, 1];
  return <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
    <rect x="0" y="0" width={W} height={H} fill={C.panel3} />
    {ticks.map(t => <g key={t}><line x1={padL} x2={W-padR} y1={sy(t)} y2={sy(t)} stroke={C.line} strokeWidth="1"/><text x="8" y={sy(t)+4} fill={C.muted} fontSize="11">{t.toFixed(2)}</text></g>)}
    {[0,.25,.5,.75,1].map(t => <line key={t} x1={padL+t*(W-padL-padR)} x2={padL+t*(W-padL-padR)} y1={padT} y2={H-padB} stroke={C.line} strokeWidth="1" opacity=".55"/>)}
    {series.map(s => {
      const pts = (s.points || []).map(p => `${sx(p.x)},${sy(p.y)}`).join(' ');
      return <g key={s.name}><polyline points={pts} fill="none" stroke={s.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{(s.points || []).map((p,i)=><circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="3" fill={s.color} />)}</g>;
    })}
    <line x1={padL} x2={W-padR} y1={H-padB} y2={H-padB} stroke={C.border} />
    <line x1={padL} x2={padL} y1={padT} y2={H-padB} stroke={C.border} />
    <text x={W/2} y={H-8} fill={C.muted} fontSize="12" textAnchor="middle">Time / EEG segments</text>
  </svg>;
}

function AiEventTimeline({ C, bundles = [], onSelect }) {
  const totalEnd = Math.max(1, ...bundles.map(b => Number(b.end || 0)));
  const stateFor = b => {
    const h = b.rule?.hybrid_label;
    const a = b.aiLabel;
    const r = b.rule?.label;
    if (h === "seizure" || a === "seizure") return { label: "Seizure", color: C.red };
    if (r === "seizure" || Number(b.rule?.hybrid_confidence || 0) >= .5) return { label: "Possible seizure", color: C.yellow };
    return { label: "Normal", color: C.green };
  };
  return <div style={{ display: "grid", gap: 10 }}>
    <div style={{ height: 46, border: `1px solid ${C.line}`, background: C.panel3, borderRadius: 8, position: "relative", overflow: "hidden" }}>
      {bundles.map(b => {
        const st = stateFor(b);
        const left = (Number(b.start || 0) / totalEnd) * 100;
        const width = Math.max(((Number(b.end || 0) - Number(b.start || 0)) / totalEnd) * 100, .8);
        return <button key={b.index} onClick={() => onSelect?.(b.index, b.start)} title={`Segment ${b.index}: ${st.label} (${fmtT(b.start)}-${fmtT(b.end)})`} style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 0, bottom: 0, background: st.color, opacity: st.label === "Normal" ? .42 : .88, border: "none", borderRight: `1px solid ${C.panel3}`, cursor: "pointer" }} />;
      })}
    </div>
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", color: C.muted, fontSize: 11 }}>
      {[["Seizure", C.red], ["Possible seizure", C.yellow], ["Normal", C.green]].map(([label,color]) => <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 18, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />{label}</span>)}
    </div>
  </div>;
}

function AiComparisonTable({ C, rows = [], onSelect }) {
  return <div style={{ overflow: "auto", maxHeight: 320, border: `1px solid ${C.line}`, borderRadius: 8 }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 650 }}>
      <thead style={{ position: "sticky", top: 0, background: C.panel3, zIndex: 1 }}><tr style={{ color: C.muted, textAlign: "left" }}>{["Segment", "Time", "AI", "Rule", "Hybrid", "Final"].map(h => <th key={h} style={{ padding: "9px 10px", borderBottom: `1px solid ${C.line}` }}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r,i) => <tr key={r.segment ?? i} onClick={() => onSelect?.(Number(r.segment), r.start)} style={{ cursor: "pointer", borderTop: `1px solid ${C.line}` }}>
        <td style={{ padding: "9px 10px", color: C.text, fontFamily: "'Roboto', Arial, sans-serif", fontWeight: 900 }}>S{Number(r.segment ?? i) + 1}</td>
        <td style={{ color: C.muted, fontFamily: "'Roboto', Arial, sans-serif" }}>{fmtT(r.start)}–{fmtT(r.end)}</td>
        <td style={{ color: r.aiLabel === "seizure" ? C.red : C.green }}>{displayLabel(r.aiLabel)}</td>
        <td style={{ color: r.ruleLabel === "seizure" ? C.orange : C.green }}>{displayLabel(r.ruleLabel)}</td>
        <td style={{ color: r.hybridLabel === "seizure" ? C.purple : C.green }}>{displayLabel(r.hybridLabel)}</td>
        <td><span style={{ color: r.finalLabel === "seizure" ? C.red : C.green, border: `1px solid ${r.finalLabel === "seizure" ? hexToRgba(C.red,.4) : hexToRgba(C.green,.4)}`, background: r.finalLabel === "seizure" ? hexToRgba(C.red,.12) : hexToRgba(C.green,.12), borderRadius: 999, padding: "3px 8px", fontWeight: 900 }}>{displayLabel(r.finalLabel)}</span></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function AiFeatureContributionTable({ C, rows = [] }) {
  return <div style={{ overflow: "auto", border: `1px solid ${C.line}`, borderRadius: 8 }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 540 }}>
      <thead><tr style={{ color: C.muted, textAlign: "left", background: C.panel3 }}>{["Feature", "Value", "Impact", "Meaning"].map(h => <th key={h} style={{ padding: "9px 10px", borderBottom: `1px solid ${C.line}` }}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r,i) => <tr key={r.feature || i} style={{ borderTop: `1px solid ${C.line}` }}>
        <td style={{ padding: "9px 10px", color: C.text, fontWeight: 800 }}>{r.feature}</td>
        <td style={{ color: C.muted }}>{r.valueLabel || (Number(r.value || r.magnitude || 0) >= .66 ? "High" : Number(r.value || r.magnitude || 0) >= .33 ? "Medium" : "Low")}</td>
        <td style={{ color: Number(r.impact || r.contribution || 0) >= 0 ? C.red : C.green, fontFamily: "'Roboto', Arial, sans-serif", fontWeight: 900 }}>{Number(r.impact ?? r.contribution ?? 0) >= 0 ? "+" : ""}{Number(r.impact ?? r.contribution ?? 0).toFixed(2)}</td>
        <td style={{ color: C.muted, lineHeight: 1.45 }}>{r.interpretation || r.direction || "Backend-derived feature contribution"}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function AiBandPowerChart({ C, bands = [] }) {
  const rows = bands.length ? bands : ["Delta","Theta","Alpha","Beta","Gamma"].map(label => ({ label, value: 0 }));
  const meaning = { Delta: "slow waves", Theta: "drowsy / early seizure", Alpha: "relaxed baseline", Beta: "seizure activity indicator", Gamma: "high activity bursts" };
  return <div style={{ display: "grid", gap: 9 }}>
    {rows.map((r,i) => { const v = Math.max(0, Math.min(1, Number(r.value || r.count || 0))); return <div key={r.label || i} style={{ display: "grid", gridTemplateColumns: "76px 1fr 48px", gap: 10, alignItems: "center" }}>
      <div><b style={{ color: C.text, fontSize: 12 }}>{r.label}</b><div style={{ color: C.dim, fontSize: 9 }}>{meaning[r.label] || "band power"}</div></div>
      <div style={{ height: 10, borderRadius: 999, background: C.dark ? "#13263A" : "#E2E8F0", overflow: "hidden" }}><div style={{ width: `${Math.round(v * 100)}%`, height: "100%", background: [C.blue,C.purple,C.green,C.orange,C.red][i%5] }} /></div>
      <b style={{ color: C.text, textAlign: "right", fontFamily: "'Roboto', Arial, sans-serif" }}>{Math.round(v*100)}%</b>
    </div>; })}
  </div>;
}


function AiChartCard({ C, title, subtitle, children, badge = "backend JSON" }) {
  return <div style={{ border: `1px solid ${C.line}`, background: C.panel2, borderRadius: 12, padding: 12, minWidth: 0, overflow: "hidden" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontWeight: 950, fontSize: 13, overflowWrap: "anywhere" }}>{title}</div>
        {subtitle && <div style={{ color: C.muted, fontSize: 10.5, lineHeight: 1.45, marginTop: 3, overflowWrap: "anywhere" }}>{subtitle}</div>}
      </div>
      <span style={{ color: C.dim, fontFamily: "'Roboto', Arial, sans-serif", fontSize: 9, border: `1px solid ${C.line}`, borderRadius: 999, padding: "3px 7px", whiteSpace: "nowrap" }}>{badge}</span>
    </div>
    {children}
  </div>;
}

function AiSvgLineChart({ C, rows = [], series = [], height = 260 }) {
  const W = 760, H = height, L = 48, R = 18, T0 = 18, B = 34;
  const data = Array.isArray(rows) ? rows : [];
  const xVals = data.map((r, i) => Number(r.start ?? r.segment ?? i));
  const minX = Math.min(...xVals, 0);
  const maxX = Math.max(...xVals, 1);
  const xOf = (x) => L + ((Number(x) - minX) / Math.max(1e-9, maxX - minX)) * (W - L - R);
  const yOf = (y) => T0 + (1 - Math.max(0, Math.min(1, Number(y || 0)))) * (H - T0 - B);
  const ticks = [0, .25, .5, .75, 1];
  const pathFor = (key) => data.map((r, i) => `${i ? "L" : "M"}${xOf(xVals[i])},${yOf(r[key])}`).join(" ");
  if (!data.length) return <div style={{ height, display: "grid", placeItems: "center", border: `1px dashed ${C.line}`, borderRadius: 8, color: C.muted, fontSize: 12 }}>No backend prediction data yet.</div>;
  return <div style={{ width: "100%", overflow: "hidden" }}>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block", border: `1px solid ${C.line}`, borderRadius: 8, background: C.dark ? "#07111F" : "#F8FAFC" }}>
      {ticks.map(t => <g key={t}><line x1={L} x2={W-R} y1={yOf(t)} y2={yOf(t)} stroke={C.line} strokeWidth="1" /><text x={10} y={yOf(t)+4} fill={C.muted} fontSize="10" fontFamily="Roboto">{t.toFixed(2)}</text></g>)}
      <line x1={L} x2={L} y1={T0} y2={H-B} stroke={C.line} /><line x1={L} x2={W-R} y1={H-B} y2={H-B} stroke={C.line} />
      {series.map(s => <path key={s.key} d={pathFor(s.key)} fill="none" stroke={s.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}
      {series.map(s => data.map((r, i) => <circle key={`${s.key}-${i}`} cx={xOf(xVals[i])} cy={yOf(r[s.key])} r="3" fill={s.color} opacity="0.9" />))}
      <text x={L} y={H-10} fill={C.muted} fontSize="10" fontFamily="Roboto">time / segment</text>
    </svg>
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, color: C.muted, fontSize: 11 }}>
      {series.map(s => <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 20, height: 3, background: s.color, display: "inline-block", borderRadius: 3 }} />{s.label}</span>)}
    </div>
  </div>;
}

function AiEventTimelineChart({ C, rows = [], selectedIndex, onSelectSegment, height = 118 }) {
  const data = Array.isArray(rows) ? rows : [];
  const totalEnd = Math.max(1, ...data.map(r => Number(r.end || 0)));
  const colorFor = (r) => r.status === "seizure" || r.finalLabel === "seizure" || r.aiLabel === "seizure" ? C.red : r.status === "possible_seizure" || r.ruleLabel === "seizure" ? C.yellow : C.green;
  return <div style={{ height, border: `1px solid ${C.line}`, borderRadius: 8, background: C.dark ? "#07111F" : "#F8FAFC", position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", left: 44, right: 12, top: 18, height: 28, borderBottom: `1px solid ${C.line}` }} />
    <div style={{ position: "absolute", left: 44, right: 12, top: 58, height: 28, borderBottom: `1px solid ${C.line}` }} />
    <div style={{ position: "absolute", left: 10, top: 24, color: C.muted, fontSize: 10, fontFamily: "'Roboto', Arial, sans-serif" }}>Events</div>
    {data.map((r, i) => {
      const idx = Number(r.segment ?? i);
      const left = 44 + (Number(r.start || 0) / totalEnd) * (720 - 56);
      const width = Math.max(((Number(r.end || 0) - Number(r.start || 0)) / totalEnd) * (720 - 56), 4);
      const active = Number(selectedIndex) === idx;
      const color = colorFor(r);
      return <button key={idx} onClick={() => onSelectSegment?.(idx, r.start)} title={`S${idx+1}: ${r.label || r.finalLabel || r.status}`} style={{ position: "absolute", left: `${(left/720)*100}%`, width: `${(width/720)*100}%`, top: 34, height: 28, border: active ? `2px solid ${C.text}` : "none", borderRadius: 5, background: color, boxShadow: active ? `0 0 0 3px ${hexToRgba(color,.28)}` : "none", cursor: "pointer" }} />;
    })}
    <div style={{ position: "absolute", left: 44, right: 12, bottom: 12, display: "flex", justifyContent: "space-between", color: C.dim, fontSize: 9, fontFamily: "'Roboto', Arial, sans-serif" }}><span>00:00</span><span>{fmtT(totalEnd)}</span></div>
  </div>;
}

function AiEngineConfidenceBars({ C, view }) {
  const rows = [
    { label: "AI", value: Number(view?.aiConfidence || 0), color: C.red },
    { label: "Rule", value: Number(view?.ruleConfidence || 0), color: C.orange },
    { label: "Hybrid", value: Number(view?.hybridConfidence || 0), color: C.purple },
  ];
  return <div style={{ display: "grid", gap: 12 }}>
    {rows.map(r => <div key={r.label} style={{ display: "grid", gridTemplateColumns: "74px 1fr 54px", gap: 10, alignItems: "center" }}>
      <b style={{ color: r.color, fontSize: 12 }}>{r.label}</b>
      <div style={{ height: 13, borderRadius: 999, background: C.dark ? "#13263A" : "#E2E8F0", overflow: "hidden" }}><div style={{ width: `${Math.round(Math.max(0, Math.min(1, r.value))*100)}%`, height: "100%", background: r.color }} /></div>
      <b style={{ color: C.text, textAlign: "right", fontFamily: "'Roboto', Arial, sans-serif" }}>{pct(r.value)}</b>
    </div>)}
  </div>;
}

function AiFrequencyTrendChart({ C, rows = [], height = 260 }) {
  const bands = [
    { key: "Delta", label: "Delta", color: C.blue },
    { key: "Theta", label: "Theta", color: C.green },
    { key: "Alpha", label: "Alpha", color: C.purple },
    { key: "Beta", label: "Beta", color: C.orange },
    { key: "Gamma", label: "Gamma", color: C.red },
  ];
  return <AiSvgLineChart C={C} rows={rows} series={bands} height={height} />;
}

function AiPlotImage({ C, title, subtitle, src, height = 260 }) {
  return <div style={{ border: `1px solid ${C.line}`, background: C.panel2, borderRadius: 10, padding: 12, minWidth: 0 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 8 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontWeight: 950, fontSize: 13, overflowWrap: "anywhere" }}>{title}</div>
        {subtitle && <div style={{ color: C.muted, fontSize: 10.5, lineHeight: 1.45, marginTop: 3, overflowWrap: "anywhere" }}>{subtitle}</div>}
      </div>
      <span style={{ color: C.dim, fontFamily: "'Roboto', Arial, sans-serif", fontSize: 9, border: `1px solid ${C.line}`, borderRadius: 999, padding: "3px 7px", whiteSpace: "nowrap" }}>backend PNG</span>
    </div>
    {src ? <img src={src} alt={title} style={{ width: "100%", height, objectFit: "contain", display: "block", borderRadius: 8, background: C.dark ? "#07111F" : "#F8FAFC", border: `1px solid ${C.line}` }} /> : <div style={{ height, display: "grid", placeItems: "center", border: `1px dashed ${C.line}`, borderRadius: 8, color: C.muted, fontSize: 12 }}>Backend plot not available yet for this recording.</div>}
  </div>;
}

function AiTopSegmentTimeline({ C, rows = [], selectedIndex, onSelectSegment, onClearSelection }) {
  const totalEnd = Math.max(1, ...rows.map(r => Number(r.end || 0)));
  const colorFor = (r) => r.status === "seizure" || r.finalLabel === "seizure" || r.aiLabel === "seizure" ? C.red : r.status === "possible_seizure" || r.ruleLabel === "seizure" ? C.yellow : C.green;
  return <div style={{ border: `1px solid ${C.line}`, background: C.panel2, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontWeight: 950, fontSize: 14 }}>AI Analysis Timeline</div>
        <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.45 }}>Click a segment to switch the AI page into segment mode. Clear selection to return to full-recording plots.</div>
      </div>
      <button onClick={onClearSelection} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${selectedIndex == null ? hexToRgba(C.blue,.45) : C.line}`, background: selectedIndex == null ? hexToRgba(C.blue,.16) : C.panel3, color: selectedIndex == null ? C.blue : C.text, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}>Full recording view</button>
    </div>
    <div style={{ position: "relative", height: 64, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}`, background: C.panel3 }}>
      <div style={{ position: "absolute", inset: "0 0 auto 0", height: 20, display: "flex", alignItems: "center", padding: "0 8px", color: C.dim, fontFamily: "'Roboto', Arial, sans-serif", fontSize: 9, borderBottom: `1px solid ${C.line}` }}>EEG segment timeline · AI / Rule / Hybrid derived from backend predictions</div>
      {rows.map((r, i) => {
        const left = (Number(r.start || 0) / totalEnd) * 100;
        const width = Math.max(((Number(r.end || 0) - Number(r.start || 0)) / totalEnd) * 100, .9);
        const active = Number(selectedIndex) === Number(r.segment ?? r.index ?? i);
        const color = colorFor(r);
        return <button key={r.segment ?? i} onClick={() => onSelectSegment?.(Number(r.segment ?? r.index ?? i), r.start)} title={`S${Number(r.segment ?? i)+1}: ${r.aiLabel || r.finalLabel || "pending"} ${fmtT(r.start)}-${fmtT(r.end)}`} style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 26, bottom: 8, border: active ? `2px solid ${C.text}` : `1px solid ${hexToRgba(color,.15)}`, background: color, opacity: active ? 1 : .78, boxShadow: active ? `0 0 0 3px ${hexToRgba(color,.28)}, 0 8px 22px ${hexToRgba(color,.20)}` : "none", cursor: "pointer", borderRadius: active ? 5 : 3 }} />;
      })}
    </div>
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", color: C.muted, fontSize: 11 }}>
      {[["Seizure", C.red], ["Possible seizure", C.yellow], ["Normal", C.green], ["Selected", C.text]].map(([label,color]) => <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 18, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />{label}</span>)}
    </div>
  </div>;
}


function ClinicalEmptyPlot({ C, label = "No backend data yet" }) {
  return <div style={{ minHeight: 240, display: "grid", placeItems: "center", border: `1px dashed ${C.line}`, borderRadius: 12, color: C.muted, fontSize: 12, background: C.panel3 }}>{label}</div>;
}

function axisNiceMax(vals, fallback = 1) {
  const m = Math.max(...(vals || []).map(v => Math.abs(Number(v) || 0)), fallback);
  return Math.max(fallback, Math.ceil(m * 10) / 10);
}

function ClinicalConfidencePlot({ C, rows = [], selectedIndex, onSelect }) {
  const W = 980, H = 320, L = 58, R = 24, T = 28, B = 48;
  const data = Array.isArray(rows) ? rows : [];
  if (!data.length) return <ClinicalEmptyPlot C={C} label="No confidence rows from backend yet." />;
  const xVals = data.map((r, i) => Number(r.start ?? r.segment ?? i));
  const minX = Math.min(...xVals, 0);
  const maxX = Math.max(...xVals, 1);
  const xOf = x => L + ((Number(x) - minX) / Math.max(1e-9, maxX - minX)) * (W - L - R);
  const yOf = y => T + (1 - Math.max(0, Math.min(1, Number(y) || 0))) * (H - T - B);
  const series = [
    ["aiConfidence", "AI confidence", C.red],
    ["ruleConfidence", "Rule confidence", C.orange],
    ["hybridConfidence", "Hybrid confidence", C.purple],
  ];
  const pathFor = key => data.map((r,i) => `${i ? "L" : "M"}${xOf(xVals[i]).toFixed(2)},${yOf(r[key]).toFixed(2)}`).join(" ");
  return <div style={{ width: "100%", overflow: "hidden" }}>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="320" preserveAspectRatio="none" style={{ display: "block", border: `1px solid ${C.line}`, borderRadius: 12, background: C.dark ? "#081321" : "#F8FAFC" }}>
      {[0, .25, .5, .75, 1].map(t => <g key={t}>
        <line x1={L} x2={W-R} y1={yOf(t)} y2={yOf(t)} stroke={C.line} strokeWidth="1" />
        <text x={12} y={yOf(t)+4} fill={C.muted} fontSize="11" fontFamily="Roboto">{t.toFixed(2)}</text>
      </g>)}
      <line x1={L} x2={L} y1={T} y2={H-B} stroke={C.line} />
      <line x1={L} x2={W-R} y1={H-B} y2={H-B} stroke={C.line} />
      {series.map(([key,label,color]) => <path key={key} d={pathFor(key)} fill="none" stroke={color} strokeWidth="3.6" strokeLinejoin="round" strokeLinecap="round" />)}
      {data.map((r, i) => {
        const idx = Number(r.segment ?? i); const active = Number(selectedIndex) === idx;
        const x = xOf(xVals[i]);
        return <g key={idx} onClick={() => onSelect?.(idx, r.start)} style={{ cursor: "pointer" }}>
          <rect x={x-9} y={T} width="18" height={H-T-B} fill="transparent" />
          {active && <rect x={x-10} y={T} width="20" height={H-T-B} fill={hexToRgba(C.purple,.13)} stroke={C.purple} strokeDasharray="4 4" />}
          <circle cx={x} cy={yOf(r.aiConfidence)} r={active ? 6 : 4} fill={C.red} />
          <circle cx={x} cy={yOf(r.ruleConfidence)} r={active ? 6 : 4} fill={C.orange} />
          <circle cx={x} cy={yOf(r.hybridConfidence)} r={active ? 6 : 4} fill={C.purple} />
        </g>;
      })}
      <text x={L} y={H-14} fill={C.muted} fontSize="11" fontFamily="Roboto">recording time / segment</text>
      <text x={18} y={18} fill={C.muted} fontSize="11" fontFamily="Roboto">confidence</text>
    </svg>
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, color: C.muted, fontSize: 12 }}>
      {series.map(([key,label,color]) => <span key={key} style={{ display: "inline-flex", gap: 7, alignItems: "center" }}><i style={{ width: 24, height: 4, borderRadius: 4, background: color }} />{label}</span>)}
    </div>
  </div>;
}

function ClinicalSegmentTimelinePlot({ C, rows = [], selectedIndex, onSelect, onClear }) {
  const data = Array.isArray(rows) ? rows : [];
  const totalEnd = Math.max(1, ...data.map(r => Number(r.end || 0)));
  const colorFor = (r) => {
    const final = r.finalLabel || r.hybridLabel || r.aiLabel || r.ruleLabel || r.status;
    if (final === "seizure" || r.aiLabel === "seizure") return C.red;
    if (r.ruleLabel === "seizure" || r.status === "possible_seizure") return C.yellow;
    return C.green;
  };
  return <div style={{ border: `1px solid ${C.line}`, background: C.panel2, borderRadius: 14, padding: 14, minWidth: 0 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontWeight: 950, fontSize: 15 }}>EEG Segment Timeline</div>
        <div style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>Click any segment to show “WHY THIS MOMENT?”. Clear selection to show full-recording clinical plots.</div>
      </div>
      <button onClick={onClear} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: `1px solid ${selectedIndex == null ? hexToRgba(C.blue,.55) : C.line}`, background: selectedIndex == null ? hexToRgba(C.blue,.16) : C.panel3, color: selectedIndex == null ? C.blue : C.text, fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" }}>Full recording plots</button>
    </div>
    <div style={{ position: "relative", height: 84, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.line}`, background: C.dark ? "#081321" : "#F8FAFC" }}>
      <div style={{ position: "absolute", left: 10, top: 8, color: C.dim, fontFamily: "'Roboto', Arial, sans-serif", fontSize: 10 }}>AI / Rule / Hybrid timeline from backend predictions</div>
      <div style={{ position: "absolute", left: 12, right: 12, top: 34, height: 24, borderBottom: `1px solid ${C.line}` }} />
      {data.map((r, i) => {
        const idx = Number(r.segment ?? r.index ?? i);
        const left = (Number(r.start || 0) / totalEnd) * 100;
        const width = Math.max(((Number(r.end || 0) - Number(r.start || 0)) / totalEnd) * 100, .7);
        const active = Number(selectedIndex) === idx;
        const color = colorFor(r);
        return <button key={idx} onClick={() => onSelect?.(idx, r.start)} title={`Segment ${idx+1} · ${fmtT(r.start)}–${fmtT(r.end)} · ${r.finalLabel || "pending"}`} style={{ position: "absolute", left: `calc(12px + ${left}% * .97)`, width: `${width*.97}%`, top: 38, height: 26, borderRadius: 7, border: active ? `2px solid ${C.text}` : `1px solid ${hexToRgba(color,.35)}`, background: color, opacity: active ? 1 : .86, boxShadow: active ? `0 0 0 4px ${hexToRgba(color,.22)}` : "none", cursor: "pointer" }} />;
      })}
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 8, display: "flex", justifyContent: "space-between", color: C.dim, fontFamily: "'Roboto', Arial, sans-serif", fontSize: 10 }}><span>00:00</span><span>{fmtT(totalEnd)}</span></div>
    </div>
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, color: C.muted, fontSize: 11.5 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: C.red }} />Seizure</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: C.yellow }} />Possible seizure</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: C.green }} />Normal</span>
    </div>
  </div>;
}

function ClinicalHorizontalBarPlot({ C, rows = [], labelKey = "label", valueKey = "value", color = "#38BDF8", signed = false, height = 290 }) {
  const data = (Array.isArray(rows) ? rows : []).filter(Boolean).slice(0, 14);
  if (!data.length) return <ClinicalEmptyPlot C={C} label="No chart rows from backend yet." />;
  const W = 800, H = height, L = signed ? 220 : 190, R = 48, T = 20, B = 28;
  const vals = data.map(r => Number(r[valueKey] ?? r.impact ?? r.contribution ?? 0) || 0);
  const maxAbs = axisNiceMax(vals, 1);
  const xZero = signed ? L + (W-L-R)/2 : L;
  const xOf = v => signed ? xZero + (Number(v)/maxAbs)*(W-L-R)/2 : L + (Math.max(0,Number(v))/maxAbs)*(W-L-R);
  const rowH = (H - T - B) / data.length;
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block", border: `1px solid ${C.line}`, borderRadius: 12, background: C.dark ? "#081321" : "#F8FAFC" }}>
    {signed && <line x1={xZero} x2={xZero} y1={T} y2={H-B} stroke={C.line} strokeWidth="2" />}
    {[0,.25,.5,.75,1].map(t => <line key={t} x1={signed ? xZero + t*(W-L-R)/2 : L + t*(W-L-R)} x2={signed ? xZero + t*(W-L-R)/2 : L + t*(W-L-R)} y1={T} y2={H-B} stroke={C.line} opacity=".55" />)}
    {data.map((r,i) => {
      const raw = Number(r[valueKey] ?? r.impact ?? r.contribution ?? 0) || 0;
      const y = T + i*rowH + rowH*.18;
      const h = Math.max(7, rowH*.58);
      const x = signed && raw < 0 ? xOf(raw) : xZero;
      const w = Math.abs(xOf(raw)-xZero);
      const c = signed ? (raw >= 0 ? C.red : C.green) : color;
      const label = String(r[labelKey] ?? r.channel ?? r.feature ?? `R${i+1}`);
      return <g key={i}>
        <text x={12} y={y+h*.72} fill={C.text} fontSize="11" fontFamily="Roboto" fontWeight="700">{label.slice(0, 28)}</text>
        <rect x={Math.min(x, xZero)} y={y} width={Math.max(2,w)} height={h} rx="5" fill={c} opacity=".88" />
        <text x={signed ? (raw >= 0 ? xOf(raw)+6 : xOf(raw)-42) : xOf(raw)+6} y={y+h*.72} fill={C.muted} fontSize="10" fontFamily="Roboto">{raw.toFixed(2)}</text>
      </g>;
    })}
  </svg>;
}

function ClinicalFrequencyPlot({ C, rows = [], height = 310 }) {
  const data = Array.isArray(rows) ? rows : [];
  if (!data.length) return <ClinicalEmptyPlot C={C} label="No frequency data from backend yet." />;
  const bands = [
    ["Delta", C.blue], ["Theta", C.green], ["Alpha", C.purple], ["Beta", C.orange], ["Gamma", C.red]
  ];
  const W = 980, H = height, L = 58, R = 24, T = 24, B = 46;
  const xVals = data.map((r,i) => Number(r.start ?? r.segment ?? i));
  const minX = Math.min(...xVals, 0), maxX = Math.max(...xVals, 1);
  const xOf = x => L + ((Number(x)-minX)/Math.max(1e-9,maxX-minX))*(W-L-R);
  const yOf = y => T + (1 - Math.max(0, Math.min(1, Number(y)||0))) * (H-T-B);
  const pathFor = key => data.map((r,i) => `${i?"L":"M"}${xOf(xVals[i]).toFixed(2)},${yOf(r[key]).toFixed(2)}`).join(" ");
  return <div>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none" style={{ display:"block", border:`1px solid ${C.line}`, borderRadius:12, background:C.dark?"#081321":"#F8FAFC" }}>
      {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={L} x2={W-R} y1={yOf(t)} y2={yOf(t)} stroke={C.line}/><text x={12} y={yOf(t)+4} fill={C.muted} fontSize="11" fontFamily="Roboto">{t.toFixed(2)}</text></g>)}
      <line x1={L} x2={L} y1={T} y2={H-B} stroke={C.line}/><line x1={L} x2={W-R} y1={H-B} y2={H-B} stroke={C.line}/>
      {bands.map(([key,color]) => <path key={key} d={pathFor(key)} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
      <text x={L} y={H-14} fill={C.muted} fontSize="11" fontFamily="Roboto">recording time / segment</text>
    </svg>
    <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginTop:10, color:C.muted, fontSize:11.5 }}>{bands.map(([key,color])=><span key={key} style={{ display:"inline-flex", alignItems:"center", gap:6 }}><i style={{ width:18, height:4, background:color, borderRadius:4 }}/>{key}</span>)}</div>
  </div>;
}

function ClinicalEngineComparisonTable({ C, rows = [], onSelect }) {
  const data = Array.isArray(rows) ? rows : [];
  if (!data.length) return <ClinicalEmptyPlot C={C} label="No engine comparison rows yet." />;
  const badge = (label, color) => <span style={{ display:"inline-flex", minWidth:82, justifyContent:"center", padding:"4px 8px", borderRadius:999, background:hexToRgba(color,.14), border:`1px solid ${hexToRgba(color,.35)}`, color, fontWeight:900, fontSize:10 }}>{displayLabel(label || "pending")}</span>;
  return <div style={{ maxHeight: 380, overflow: "auto", border: `1px solid ${C.line}`, borderRadius: 12 }}>
    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11.5 }}>
      <thead style={{ position:"sticky", top:0, background:C.panel3, zIndex:1 }}><tr>{["Segment","Time","AI","Rule","Hybrid","Final"].map(h=><th key={h} style={{ textAlign:"left", padding:"10px 12px", color:C.muted, borderBottom:`1px solid ${C.line}`, whiteSpace:"nowrap" }}>{h}</th>)}</tr></thead>
      <tbody>{data.map((r,i)=>{ const idx=Number(r.segment ?? i); const final=r.finalLabel || r.hybridLabel || r.aiLabel || r.ruleLabel; return <tr key={idx} onClick={()=>onSelect?.(idx,r.start)} style={{ cursor:"pointer", borderTop:`1px solid ${C.line}` }}>
        <td style={{ padding:"10px 12px", color:C.text, fontWeight:900, fontFamily:"'Roboto', Arial, sans-serif" }}>S{idx+1}</td>
        <td style={{ color:C.muted, fontFamily:"'Roboto', Arial, sans-serif", whiteSpace:"nowrap" }}>{fmtT(r.start)}–{fmtT(r.end)}</td>
        <td>{badge(r.aiLabel, C.red)}</td><td>{badge(r.ruleLabel, C.orange)}</td><td>{badge(r.hybridLabel, C.purple)}</td><td>{badge(final, final === "seizure" ? C.red : C.green)}</td>
      </tr>})}</tbody>
    </table>
  </div>;
}


export { MiniStatCard, SimpleBarChart, SimpleTimeline, AiExplainCard, AiLineChart, AiHeatmap, AiTopography, AiSpectrogram, AiFeatureTable, AiModelMetadata, AiMiniLineGraph, AiEventTimeline, AiComparisonTable, AiFeatureContributionTable, AiBandPowerChart, AiChartCard, AiSvgLineChart, AiEventTimelineChart, AiEngineConfidenceBars, AiFrequencyTrendChart, AiPlotImage, AiTopSegmentTimeline, ClinicalEmptyPlot, axisNiceMax, ClinicalConfidencePlot, ClinicalSegmentTimelinePlot, ClinicalHorizontalBarPlot, ClinicalFrequencyPlot, ClinicalEngineComparisonTable };
