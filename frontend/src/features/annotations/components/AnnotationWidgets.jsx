import { fmtT } from "../../../constants.js";
import { hexToRgba } from "../../../components/utils.js";

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v || 0)));
const pct = (v) => `${Math.round(clamp01(v) * 100)}%`;

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function filenameFromDisposition(disposition, fallback) {
  const match = String(disposition || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

function isSeizureLabel(v) {
  const txt = String(v || "").replace(/_/g, " ").replace(/-/g, " ").toLowerCase();
  if (!txt || txt.includes("non seizure") || txt.includes("nonseizure") || txt.includes("background") || txt.includes("bckg") || txt.includes("normal")) return false;
  return txt.includes("seizure") || txt === "seiz" || txt === "sz" || txt === "gnsz" || txt === "fnsz" || txt === "cpsz";
}

function StatCard({ C, label, value, color }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel2, borderRadius: 8, padding: "10px 11px", minWidth: 0 }}>
      <div style={{ color: C.muted, fontSize: 9.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div style={{ color: color || C.text, fontSize: 18, fontWeight: 950, marginTop: 5, lineHeight: 1 }}>{value ?? "—"}</div>
    </div>
  );
}

function ToolbarButton({ C, children, onClick, disabled, color, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        minHeight: 34,
        border: `1px solid ${color ? hexToRgba(color, 0.48) : C.border}`,
        background: disabled ? hexToRgba(C.muted, 0.08) : color ? hexToRgba(color, 0.15) : C.panel2,
        color: disabled ? C.muted : color || C.text,
        borderRadius: 7,
        padding: "8px 12px",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 11,
        fontWeight: 900,
        whiteSpace: "nowrap" }}
    >
      {children}
    </button>
  );
}

function AnnotationsTable({ C, rows }) {
  const visible = Array.isArray(rows) ? rows : [];
  const headers = [
    ["start_label", "Start"],
    ["stop_label", "Stop"],
    ["ai_prediction", "AI Segment Prediction"],
    ["ai_confidence_label", "AI Conf."],
    ["rule_prediction", "Rule Segment Prediction"],
    ["rule_confidence_label", "Rule Conf."],
    ["hybrid_prediction", "Hybrid Segment Prediction"],
    ["hybrid_confidence_label", "Hybrid Conf."],
  ];

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 9, background: C.panel2, overflow: "hidden", minHeight: 0 }}>
      <div style={{ maxHeight: "calc(100vh - 300px)", minHeight: 280, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", color: C.text, fontSize: 10.5 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ background: C.dark ? "#0B1726" : "#F1F5F9" }}>
              {headers.map(([key, label], i) => (
                <th
                  key={key}
                  style={{
                    color: C.muted,
                    textAlign: "left",
                    padding: "9px 9px",
                    borderBottom: `1px solid ${C.line}`,
                    borderRight: i < headers.length - 1 ? `1px solid ${C.line}` : "none",
                    fontWeight: 950,
                    width: i < 2 ? 80 : i === 2 || i === 4 || i === 6 ? "20%" : 86,
                    whiteSpace: "nowrap" }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const hybridSeizure = Boolean(r.is_hybrid_seizure) || isSeizureLabel(r.hybrid_label || r.hybrid_prediction);
              return (
                <tr key={`${r.start_time}-${r.stop_time}-${i}`} style={{ background: i % 2 ? hexToRgba(C.muted, 0.035) : "transparent" }}>
                  <td style={td(C)}>{r.start_label || fmtT(r.start_time)}</td>
                  <td style={td(C)}>{r.stop_label || fmtT(r.stop_time)}</td>
                  <td style={td(C)} title={r.ai_prediction}>{r.ai_prediction || "—"}</td>
                  <td style={td(C)}>{r.ai_confidence_label || pct(r.ai_confidence)}</td>
                  <td style={td(C)} title={r.rule_prediction}>{r.rule_prediction || "—"}</td>
                  <td style={td(C)}>{r.rule_confidence_label || pct(r.rule_confidence)}</td>
                  <td style={{ ...td(C), color: hybridSeizure ? C.red : C.green, fontWeight: 900 }} title={r.hybrid_prediction}>{r.hybrid_prediction || "—"}</td>
                  <td style={{ ...td(C), color: hybridSeizure ? C.red : C.green, fontWeight: 950 }}>{r.hybrid_confidence_label || pct(r.hybrid_confidence)}</td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={8} style={{ padding: 24, color: C.muted, textAlign: "center" }}>
                  No automated annotation rows are available yet. Run live prediction first, then return to this page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function ConfidenceTrend({ C, rows }) {
  const list = Array.isArray(rows) ? rows : [];
  const W = 720;
  const H = 170;
  const padL = 42, padR = 16, padT = 22, padB = 30;
  const maxX = Math.max(1, ...list.map((r, i) => Number(r.stop_time ?? r.end ?? i + 1)));
  const pathFor = (key) => list.map((r, i) => {
    const xVal = Number(r.stop_time ?? r.end ?? i + 1);
    const yVal = clamp01(r[key]);
    const x = padL + (xVal / maxX) * (W - padL - padR);
    const y = H - padB - yVal * (H - padT - padB);
    return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const series = [
    ["ai_confidence", C.red, "AI"],
    ["rule_confidence", C.orange, "Rule"],
    ["hybrid_confidence", C.purple, "Hybrid"],
  ];
  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, borderRadius: 9, padding: 12, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div><div style={{ color: C.text, fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>Confidence Plot</div><div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>AI, Rule, and Hybrid confidence across all segments.</div></div>
        <div style={{ display: "flex", gap: 10, fontSize: 10, fontWeight: 850 }}>
          {series.map(([_, color, label]) => <span key={label} style={{ color, display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 14, height: 3, borderRadius: 9, background: color }} />{label}</span>)}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 190, display: "block" }}>
        <rect width={W} height={H} fill="transparent" />
        {[0, .25, .5, .75, 1].map((v) => {
          const y = H - padB - v * (H - padT - padB);
          return <g key={v}><line x1={padL} x2={W-padR} y1={y} y2={y} stroke={hexToRgba(C.muted,.14)} /><text x="8" y={y+3} fill={C.muted} fontSize="9">{Math.round(v*100)}</text></g>;
        })}
        {series.map(([key, color]) => <path key={key} d={pathFor(key)} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>
    </div>
  );
}

function QuickAnalysis({ C, summary, rows }) {
  const list = Array.isArray(rows) ? rows : [];
  const seizureRows = list.filter(r => Boolean(r.is_hybrid_seizure) || isSeizureLabel(r.hybrid_prediction || r.hybrid_label));
  const first = seizureRows[0];
  const avg = summary?.avg_hybrid_confidence_label || (list.length ? pct(list.reduce((a, r) => a + clamp01(r.hybrid_confidence), 0) / list.length) : "—");
  const burden = seizureRows.reduce((acc, r) => acc + Math.max(0, Number(r.stop_time || 0) - Number(r.start_time || 0)), 0);
  const items = [
    ["Top finding", seizureRows.length ? `${seizureRows.length} hybrid seizure segment(s)` : "No hybrid seizure segments", seizureRows.length ? C.red : C.green],
    ["First event", first ? `${first.start_label || fmtT(first.start_time)} → ${first.stop_label || fmtT(first.stop_time)}` : "—", first ? C.orange : C.muted],
    ["Seizure burden", `${burden.toFixed(1)}s`, C.purple],
    ["Average hybrid confidence", avg, C.green],
  ];
  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, borderRadius: 9, padding: 12, minWidth: 0 }}>
      <div style={{ color: C.text, fontSize: 12, fontWeight: 950, textTransform: "uppercase", marginBottom: 10 }}>Quick Analysis</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
        {items.map(([label, value, color]) => <div key={label} style={{ border: `1px solid ${hexToRgba(color,.28)}`, background: hexToRgba(color,.08), borderRadius: 8, padding: 10, minWidth: 0 }}><div style={{ color: C.muted, fontSize: 9.5, fontWeight: 850 }}>{label}</div><div style={{ color, fontSize: 13, fontWeight: 950, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={value}>{value}</div></div>)}
      </div>
    </div>
  );
}

function td(C) {
  return {
    padding: "8px 9px",
    borderBottom: `1px solid ${C.line}`,
    borderRight: `1px solid ${C.line}`,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    verticalAlign: "middle" };
}


export { clamp01, pct, downloadBlob, filenameFromDisposition, isSeizureLabel, StatCard, ToolbarButton, AnnotationsTable, ConfidenceTrend, QuickAnalysis, td };
