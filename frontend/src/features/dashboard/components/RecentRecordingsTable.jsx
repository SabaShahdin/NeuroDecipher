import { panelSurface } from "../../../theme/ndThemeTokens.js";

export default function RecentRecordingsTable({ C, loading, recent = [], onStartAnalysis, onOpenRecording, onOpenRecordings }) {
  return (
    <div style={{ ...panelSurface(C), overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div><div style={{ fontSize: 14, fontWeight: 850 }}>Recent Analyses</div><div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>If one segment is seizure, the analysis is marked seizure-positive and shows the segment/time below.</div></div>
        <button onClick={onStartAnalysis} style={{ height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: `${C.accent}18`, color: C.accent, cursor: "pointer", padding: "0 10px", fontSize: 11, fontWeight: 800 }}>+ New Analysis</button>
      </div>
      <div className="nd-scrollbar" style={{ overflow: "auto", flex: "1 1 auto", minHeight: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ color: C.muted, textAlign: "left", fontSize: 10, fontFamily: "'Roboto', Arial, sans-serif" }}>{["Analysis","Result / Segment","Duration","Date","Actions"].map(h => <th key={h} style={{ padding: "12px 14px", borderBottom: `1px solid ${C.line}` }}>{h}</th>)}</tr></thead>
          <tbody>
            {recent.length === 0 && <tr><td colSpan="5" style={{ padding: 28, textAlign: "center", color: C.muted }}>{loading ? "Loading analyses…" : "No analyses found yet. Upload EEG files to populate this table."}</td></tr>}
            {recent.map(row => {
              const first = row.firstSeizureSegment;
              return (
                <tr key={row.jobId} style={{ borderBottom: `1px solid ${C.line}` }}>
                  <td style={{ padding: "12px 14px", color: C.text, maxWidth: 210 }}><div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 800 }}>{row.recordingLabel || row.fileName || "—"}</div><div style={{ color: C.dim, fontSize: 10, fontFamily: "'Roboto', Arial, sans-serif", marginTop: 2 }}>{row.jobId?.slice(0, 8)} · {row.status || "—"}</div></td>
                  <td style={{ padding: "12px 14px", minWidth: 210 }}>
                    <div style={{ color: row.hasSeizure ? C.red : C.accent, fontWeight: 900 }}>{row.result || "—"}</div>
                    {row.hasSeizure && first ? <div style={{ color: C.muted, fontSize: 10, lineHeight: 1.45, marginTop: 3 }}><span style={{ fontFamily: "'Roboto', Arial, sans-serif" }}>Segment #{first.index}</span> · {first.subtypeFull || first.subtype}<br/><span style={{ fontFamily: "'Roboto', Arial, sans-serif" }}>{first.timeRange}</span> · duration {first.durationLabel}</div> : <div style={{ color: C.dim, fontSize: 10, marginTop: 3 }}>No seizure segment stored</div>}
                  </td>
                  <td style={{ padding: "12px 14px", color: C.muted, fontFamily: "'Roboto', Arial, sans-serif" }}>{row.duration || "—"}</td>
                  <td style={{ padding: "12px 14px", color: C.muted, fontFamily: "'Roboto', Arial, sans-serif" }}>{row.date || "—"}</td>
                  <td style={{ padding: "12px 14px" }}><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button disabled={!row.canOpenRecording} onClick={() => onOpenRecording?.(row.jobId)} style={{ height: 28, borderRadius: 6, border: `1px solid ${row.canOpenRecording ? C.border : C.line}`, background: row.canOpenRecording ? `${C.blue}18` : "transparent", color: row.canOpenRecording ? C.blue : C.dim, cursor: row.canOpenRecording ? "pointer" : "not-allowed", padding: "0 8px", fontSize: 10, fontWeight: 850 }}>Open Full EEG</button><button onClick={onOpenRecordings} style={{ height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel2, color: C.text, cursor: "pointer", padding: "0 8px", fontSize: 10 }}>Manage</button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
