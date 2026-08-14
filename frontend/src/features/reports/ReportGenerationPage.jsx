
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { API, apiHeaders, fmtT } from "../../constants.js";
import { useNdThemeTokens } from "../../hooks/useNdTheme.js";
import { hexToRgba } from "../../components/utils.js";
import { ReferenceAnalysisNav } from "../../components/reference/ReferenceAnalysisNav.jsx";

import { pct, downloadBlob, getFilenameFromDisposition, MiniStat, SegmentPreviewTable, td, topBtn, primaryBtn, secondaryBtn } from "./components/ReportGenerationWidgets.jsx";
export default function ReportGenerationPage({
  jobId,
  fileName,
  onBackDashboard,
  onOpenRecordings,
  onOpenAnalysisPage }) {
  const { C, theme, setTheme } = useNdThemeTokens();
  const [rows, setRows] = useState([]);
  const [job, setJob] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeSet = (key) => onOpenAnalysisPage?.(key);

  const loadRows = useCallback(async () => {
    if (!jobId) return;
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API}/annotations/${encodeURIComponent(jobId)}/table`, { headers: apiHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not load report data");
      setRows(Array.isArray(json.annotations) ? json.annotations : []);
      setJob(json.job || null);
      setSummary(json.summary || null);
    } catch (e) {
      setError(e.message || "Could not load report data");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const downloadPdf = async () => {
    if (!jobId) { setError("No recording is selected."); return; }
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API}/report/${encodeURIComponent(jobId)}`, { headers: apiHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const name = getFilenameFromDisposition(res.headers.get("content-disposition"), `neurodecipher_${fileName || "report"}.pdf`);
      downloadBlob(blob, name);
    } catch (e) {
      setError(e.message || "Could not download PDF report");
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = async () => {
    if (!jobId) { setError("No recording is selected."); return; }
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API}/annotations/${encodeURIComponent(jobId)}/csv`, { headers: apiHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const name = getFilenameFromDisposition(res.headers.get("content-disposition"), `neurodecipher_${fileName || "annotations"}.csv`);
      downloadBlob(blob, name);
    } catch (e) {
      setError(e.message || "Could not export CSV annotations");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ height: "100vh", background: C.bg, color: C.text, fontFamily: "Inter, system-ui, sans-serif", display: "grid", gridTemplateRows: "52px minmax(0,1fr)", overflow: "hidden" }}>
      <div style={{ height: 52, borderBottom: `1px solid ${C.border}`, background: C.panel3, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          
            <div style={{ color: C.muted, fontSize: 9 }}>Report Generation & Annotation Export</div>
          
          <div style={{ width: 1, height: 34, background: C.border, margin: "0 10px" }} />
          <div style={{ fontWeight: 900 }}>Report Generation</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px 10px", fontSize: 10 }}>Analysis: {fileName || job?.fileName || "—"}</div>
          {/* <button onClick={downloadPdf} disabled={!jobId || loading} style={topBtn(C, C.green)}>Generate PDF</button>
          <button onClick={downloadCsv} disabled={!jobId || loading} style={topBtn(C, C.purple)}>Save Annotations CSV</button>
           */}
        </div>
      </div>

      <div style={{ minHeight: 0, display: "flex", gap: 10, padding: 10, overflow: "hidden" }}>
        <ReferenceAnalysisNav C={C} active="report" setActive={activeSet} onBackDashboard={onBackDashboard} onOpenRecordings={onOpenRecordings} onGoToReport={() => onOpenAnalysisPage?.("report")} theme={theme} setTheme={setTheme} />
        <main className="nd-scrollbar" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", display: "grid", gap: 10, alignContent: "start", paddingRight: 6 }}>
          {error && <div style={{ border: `1px solid ${hexToRgba(C.red,.35)}`, color: C.red, borderRadius: 8, padding: 10, background: hexToRgba(C.red,.08) }}>{error}</div>}

          <section style={{ display: "grid", gridTemplateColumns: "330px minmax(0, 1fr)", gap: 10, minWidth: 0 }}>
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 9, background: C.panel, padding: 14, display: "grid", gap: 12, alignContent: "start" }}>
              <div>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>Generate Report</div>
                <div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>{fileName || job?.fileName || "No analysis selected"}</div>
              </div>

              <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, background: C.panel2 }}>
                <div style={{ color: C.muted, fontSize: 10, fontWeight: 900, marginBottom: 8 }}>Report Includes</div>
                {[
                  "Analysis metadata",
                  "Segment start/stop times",
                  "AI result and confidence",
                  "Rule-based result and confidence",
                  "Hybrid prediction and confidence",
                  "Seizure subtype in brackets",
                  "Clinical disclaimer",
                ].map((x) => <div key={x} style={{ display: "flex", alignItems: "center", gap: 6, color: C.text, fontSize: 10.5, marginBottom: 6 }}><Check size={12} strokeWidth={2.5} color={C.green} /> {x}</div>)}
              </div>

              <button onClick={downloadPdf} disabled={!jobId || loading} style={primaryBtn(C, C.green)}>Generate PDF Report</button>
              <button onClick={downloadCsv} disabled={!jobId || loading} style={primaryBtn(C, C.purple)}>Save Annotation CSV</button>
              
            </div>

            <div style={{ border: `1px solid ${C.line}`, borderRadius: 9, background: C.panel, padding: 14, minWidth: 0, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ color: C.text, fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>Preview</div>
                  <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>The PDF will contain the same per-segment rows shown below.</div>
                </div>
                {loading && <div style={{ color: C.muted, fontSize: 11 }}>Loading…</div>}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <MiniStat C={C} label="Segments" value={summary?.total_segments ?? rows.length} />
                <MiniStat C={C} label="AI Seizure" value={summary?.ai_seizure_segments ?? "—"} color={C.red} />
                <MiniStat C={C} label="Rule Seizure" value={summary?.rule_seizure_segments ?? "—"} color={C.orange} />
                <MiniStat C={C} label="Hybrid Seizure" value={summary?.hybrid_seizure_segments ?? "—"} color={C.purple} />
              </div>
              <SegmentPreviewTable C={C} rows={rows} />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
