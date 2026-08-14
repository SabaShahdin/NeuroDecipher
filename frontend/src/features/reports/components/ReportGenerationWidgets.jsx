import { fmtT } from "../../../constants.js";
import { hexToRgba } from "../../../components/utils.js";

const pct = (v) => {
  const n = Number(v || 0);
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
};

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

function getFilenameFromDisposition(disposition, fallback) {
  const match = String(disposition || "").match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

function MiniStat({ C, label, value, color }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel2, borderRadius: 8, padding: "10px 11px", minWidth: 0 }}>
      <div style={{ color: C.muted, fontSize: 9, fontWeight: 850, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: color || C.text, fontSize: 20, fontWeight: 950, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SegmentPreviewTable({ C, rows }) {
  const shown = rows.slice(0, 9);
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", background: C.panel2 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 10, color: C.text }}>
        <thead>
          <tr style={{ color: C.muted, background: C.dark ? "rgba(7,17,31,.9)" : "#F8FAFC" }}>
            {[
              ["Seg", 44], ["Start", 70], ["Stop", 70], ["AI Result", "1fr"], ["AI Conf.", 70],
              ["Rule Result", "1fr"], ["Rule Conf.", 74], ["Hybrid Result", "1fr"], ["Hybrid Conf.", 82],
            ].map(([h, w]) => (
              <th key={h} style={{ width: typeof w === "number" ? w : undefined, padding: "8px 7px", borderBottom: `1px solid ${C.line}`, textAlign: "left", fontWeight: 900, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => {
            const seizure = String(r.hybrid_prediction || "").toLowerCase().includes("seizure") && !String(r.hybrid_prediction || "").toLowerCase().includes("non-seizure");
            return (
              <tr key={`${r.segment}-${i}`} style={{ background: i % 2 ? hexToRgba(C.muted, 0.035) : "transparent" }}>
                <td style={td(C)}>{r.segment}</td>
                <td style={td(C)}>{r.start_label || fmtT(r.start_time)}</td>
                <td style={td(C)}>{r.stop_label || fmtT(r.stop_time)}</td>
                <td style={td(C)} title={r.ai_prediction}>{r.ai_prediction}</td>
                <td style={td(C)}>{r.ai_confidence_label || pct(r.ai_confidence)}</td>
                <td style={td(C)} title={r.rule_prediction}>{r.rule_prediction}</td>
                <td style={td(C)}>{r.rule_confidence_label || pct(r.rule_confidence)}</td>
                <td style={{ ...td(C), color: seizure ? C.red : C.green, fontWeight: 850 }} title={r.hybrid_prediction}>{r.hybrid_prediction}</td>
                <td style={{ ...td(C), color: seizure ? C.red : C.green, fontWeight: 900 }}>{r.hybrid_confidence_label || pct(r.hybrid_confidence)}</td>
              </tr>
            );
          })}
          {!shown.length && <tr><td colSpan={9} style={{ padding: 18, color: C.muted, textAlign: "center" }}>No prediction rows are available yet. Run live prediction first.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function td(C) {
  return {
    padding: "7px 7px",
    borderBottom: `1px solid ${C.line}`,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    verticalAlign: "middle" };
}

function topBtn(C, color) {
  return {
    border: `1px solid ${color ? hexToRgba(color, .45) : C.border}`,
    background: color ? hexToRgba(color, .15) : C.panel2,
    color: color || C.text,
    borderRadius: 6,
    padding: "8px 11px",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 850 };
}
function primaryBtn(C, color) { return { ...topBtn(C, color), width: "100%", padding: "11px 12px" }; }
function secondaryBtn(C) { return { ...topBtn(C), width: "100%", padding: "10px 12px" }; }

export { pct, downloadBlob, getFilenameFromDisposition, MiniStat, SegmentPreviewTable, td, topBtn, primaryBtn, secondaryBtn };
