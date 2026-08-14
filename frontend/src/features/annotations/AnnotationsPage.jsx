import { useCallback, useEffect, useMemo, useState } from "react";
import { API, apiHeaders, fmtT } from "../../constants.js";
import { useNdThemeTokens } from "../../hooks/useNdTheme.js";
import { hexToRgba } from "../../components/utils.js";
import { ReferenceAnalysisNav } from "../../components/reference/ReferenceAnalysisNav.jsx";

import { clamp01, pct, downloadBlob, filenameFromDisposition, isSeizureLabel, StatCard, ToolbarButton, AnnotationsTable, ConfidenceTrend, QuickAnalysis, td } from "./components/AnnotationWidgets.jsx";
export default function AnnotationsPage({
  jobId,
  fileName,
  onBackDashboard,
  onOpenRecordings,
  onGoToReport,
  onOpenAnalysisPage }) {
  const { C, theme, setTheme } = useNdThemeTokens();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");

  const activeSet = (key) => {
    if (key === "report" || key === "annotations") return onOpenAnalysisPage?.("annotations");
    return onOpenAnalysisPage?.(key);
  };

  const loadRows = useCallback(async () => {
    if (!jobId) {
      setRows([]);
      setSummary(null);
      setJob(null);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API}/annotations/${encodeURIComponent(jobId)}/table`, { headers: apiHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not load annotations");
      setRows(Array.isArray(json.annotations) ? json.annotations : []);
      setSummary(json.summary || null);
      setJob(json.job || null);
    } catch (e) {
      setError(e.message || "Could not load annotations");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const downloadPdf = async () => {
    if (!jobId) { setError("No recording is selected."); return; }
    try {
      setDownloading("pdf");
      setError("");
      const res = await fetch(`${API}/report/${encodeURIComponent(jobId)}`, { headers: apiHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const name = filenameFromDisposition(res.headers.get("content-disposition"), `neurodecipher_${fileName || "annotation_report"}.pdf`);
      downloadBlob(blob, name);
    } catch (e) {
      setError(e.message || "Could not generate PDF report");
    } finally {
      setDownloading("");
    }
  };

  const downloadCsv = async () => {
    if (!jobId) { setError("No recording is selected."); return; }
    try {
      setDownloading("csv");
      setError("");
      const res = await fetch(`${API}/annotations/${encodeURIComponent(jobId)}/csv`, { headers: apiHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const name = filenameFromDisposition(res.headers.get("content-disposition"), `neurodecipher_${fileName || "hybrid_annotations"}.csv`);
      downloadBlob(blob, name);
    } catch (e) {
      setError(e.message || "Could not export CSV annotations");
    } finally {
      setDownloading("");
    }
  };

  const filteredRows = useMemo(() => rows, [rows]);

  return (
    <div className="nd-page-shell" style={{ height: "100vh", maxHeight: "100vh", background: C.pageGradient || C.bg, color: C.text, fontFamily: "'Roboto', Arial, sans-serif", display: "grid", gridTemplateColumns: "168px minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr)", gap: 12, padding: 12, overflow: "hidden", minHeight: 0 }}>
      <ReferenceAnalysisNav
          C={C}
          active="annotations"
          setActive={activeSet}
          onBackDashboard={onBackDashboard}
          onOpenRecordings={onOpenRecordings}
          onGoToReport={() => onOpenAnalysisPage?.("annotations") || onGoToReport?.()}
          theme={theme}
          setTheme={setTheme}
         
        />

      <section style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
      <header style={{ height: 52, border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel3, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
         
          <div style={{ fontWeight: 900, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Annotation & Report Generation</div>
        </div>

       
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px 10px", fontSize: 10, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Analysis: {fileName || job?.fileName || "—"}</div>

      </header>

      <div style={{ minHeight: 0, flex: 1, display: "flex", overflow: "hidden" }}>

        <main className="nd-scrollbar" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "grid", gap: 10, alignContent: "start", paddingRight: 6 }}>
          {error && <div style={{ border: `1px solid ${hexToRgba(C.red, 0.35)}`, color: C.red, borderRadius: 8, padding: 10, background: hexToRgba(C.red, 0.08), fontSize: 12 }}>{error}</div>}

          <section style={{ minWidth: 0, display: "grid", gap: 10, alignContent: "start" }}>
            <QuickAnalysis C={C} summary={summary} rows={filteredRows} />
            <ConfidenceTrend C={C} rows={filteredRows} />
            <section style={{ minWidth: 0, display: "grid", gap: 10, alignContent: "start" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
                <StatCard C={C} label="Rows" value={summary?.total_segments ?? rows.length} />
                <StatCard C={C} label="AI Seizure" value={summary?.ai_seizure_segments ?? "—"} color={C.red} />
                <StatCard C={C} label="Rule Seizure" value={summary?.rule_seizure_segments ?? "—"} color={C.orange} />
                <StatCard C={C} label="Hybrid Seizure" value={summary?.hybrid_seizure_segments ?? "—"} color={C.purple} />
                <StatCard C={C} label="Avg Hybrid Conf." value={summary?.avg_hybrid_confidence_label ?? "—"} color={C.green} />
              </div>

              <div style={{ border: `1px solid ${C.line}`, borderRadius: 9, background: C.panel, padding: 12, minWidth: 0, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ color: C.text, fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>Automated Annotation Table</div>
                    <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>Start/stop time with AI, rule-based, and hybrid segment predictions.</div>
                  </div>
                  {loading && <div style={{ color: C.muted, fontSize: 11 }}>Loading…</div>}
                </div>
                <AnnotationsTable C={C} rows={filteredRows} />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", paddingTop: 2 }}>
                  <ToolbarButton C={C} onClick={downloadPdf} disabled={!jobId || loading || downloading === "pdf"} color={C.green}>{downloading === "pdf" ? "Generating…" : "Generate PDF Report"}</ToolbarButton>
                  <ToolbarButton C={C} onClick={downloadCsv} disabled={!jobId || loading || downloading === "csv"} color={C.purple}>{downloading === "csv" ? "Exporting…" : "Save Annotation CSV"}</ToolbarButton>
                </div>
              </div>
            </section>
          </section>
        </main>
      </div>
      </section>
    </div>
  );
}
