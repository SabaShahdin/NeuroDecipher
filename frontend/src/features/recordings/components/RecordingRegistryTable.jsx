import React from "react";
import { panelStyle, recordingInputStyle } from "./RecordingTheme.js";

function statusPill(C, status) {
  const s = String(status || "unknown").toLowerCase();
  const color = s.includes("complete") || s === "ready" || s === "reviewed" ? C.blue : s.includes("error") ? C.red : C.orange;
  return <span style={{ color, background: `${color}1A`, border: `1px solid ${color}42`, borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 900, textTransform: "capitalize", whiteSpace: "nowrap" }}>{String(status || "unknown").replace(/_/g, " ")}</span>;
}

function RecordingRow({ C, r, onEdit, onOpenRecording }) {
  const sz = (Number(r.aiSeizureWindows || 0) + Number(r.ruleSeizureWindows || 0) + Number(r.hybridSeizureWindows || 0)) > 0;
  return (
    <tr style={{ borderBottom: `1px solid ${C.line}` }}>
      <td style={{ padding: "12px 13px", minWidth: 220 }}>
        <div style={{ color: C.text, fontWeight: 900, maxWidth: 290, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.recordingLabel || r.fileName}</div>
        <div style={{ color: C.dim, fontSize: 10, fontFamily: "'Roboto', Arial, sans-serif", marginTop: 3 }}>{r.jobId?.slice(0, 8)} · {r.recordingType || "EEG"}</div>
      </td>
      <td style={{ padding: "12px 13px", color: sz ? C.red : C.blue, fontWeight: 950 }}>{sz ? "Seizure" : "Non-Seizure"}</td>
      <td style={{ padding: "12px 13px", color: C.muted, fontFamily: "'Roboto', Arial, sans-serif", fontWeight: 700 }}>{r.durationLabel || "—"}</td>
      <td style={{ padding: "12px 13px" }}>{statusPill(C, r.status)}</td>
      <td style={{ padding: "12px 13px", color: C.muted, fontFamily: "'Roboto', Arial, sans-serif", fontWeight: 800 }}>{r.aiSeizureWindows || 0}/{r.ruleSeizureWindows || 0}/{r.hybridSeizureWindows || 0}</td>
      <td style={{ padding: "12px 13px" }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <button onClick={() => onEdit(r)} style={{ border: `1px solid ${C.border}`, background: C.panel2, color: C.text, borderRadius: 8, height: 30, padding: "0 9px", cursor: "pointer", fontWeight: 850 }}>Manage</button>
          <button onClick={() => onOpenRecording?.(r.jobId)} style={{ border: `1px solid ${C.blue}60`, background: `${C.blue}18`, color: C.blue, borderRadius: 8, height: 30, padding: "0 9px", cursor: "pointer", fontWeight: 900 }}>Open EEG</button>
        </div>
      </td>
    </tr>
  );
}

export default function RecordingRegistryTable({ C, recordings, loading, search, setSearch, onStartAnalysis, onEditRecording, onOpenRecording }) {
  const inputStyle = recordingInputStyle(C);
  return (
    <div style={{ ...panelStyle(C), overflow: "hidden" }}>
      <div style={{ padding: "15px 16px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.text }}>Analysis Registry</div>
          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4, fontWeight: 700 }}>Rows come from jobs, analysis metadata, predictions, and audit logs.</div>
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search file, label, status" style={{ ...inputStyle, width: 240 }} />
          <button onClick={onStartAnalysis} style={{ height: 36, borderRadius: 9, border: `1px solid ${C.blue}55`, background: `${C.blue}18`, color: C.blue, cursor: "pointer", padding: "0 12px", fontSize: 11, fontWeight: 950 }}>+ New Upload</button>
        </div>
      </div>
      <div className="nd-scrollbar" style={{ overflowX: "auto", maxHeight: 530, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: C.muted, textAlign: "left", fontSize: 10, fontFamily: "'Roboto', Arial, sans-serif", background: C.dark ? "rgba(147,197,253,.06)" : "rgba(37,99,235,.035)" }}>
              {["Analysis", "Result", "Duration", "Status", "AI/Rule/Hybrid SZ", "Actions"].map((h) => <th key={h} style={{ padding: "12px 13px", borderBottom: `1px solid ${C.line}`, fontWeight: 900 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {recordings.length === 0 && <tr><td colSpan="7" style={{ padding: 28, textAlign: "center", color: C.muted, fontWeight: 750 }}>{loading ? "Loading analyses…" : "No analyses found yet. Upload EEG files to populate this table."}</td></tr>}
            {recordings.map((r) => <RecordingRow key={r.jobId} C={C} r={r} onEdit={onEditRecording} onOpenRecording={onOpenRecording} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
