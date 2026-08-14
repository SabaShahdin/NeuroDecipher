import { useCallback, useEffect, useMemo, useState } from "react";
import { API, apiHeaders } from "../../constants.js";
import { buildNdThemeTokens } from "../../theme/ndThemeTokens.js";
import { ReferenceAnalysisNav } from "../../components/reference/ReferenceAnalysisNav.jsx";
import { buildRecordingTheme } from "./components/RecordingTheme.js";
import RecordingNotice from "./components/RecordingNotice.jsx";
import RecordingStatsGrid from "./components/RecordingStatsGrid.jsx";
import RecordingEditPanel from "./components/RecordingEditPanel.jsx";
import RecordingRegistryTable from "./components/RecordingRegistryTable.jsx";

export default function RecordingManagementPage({
  user,
  onBackDashboard,
  onStartAnalysis,
  onOpenLive,
  onOpenAi,
  onOpenRule,
  onOpenHybrid,
  onOpenAnnotations,
  onOpenReport,
  onOpenRecording,
}) {
  const [theme, setTheme] = useState(() => {
    try { return window.localStorage.getItem("nd_theme") || "dark"; } catch { return "dark"; }
  });
  const C = useMemo(() => buildRecordingTheme(buildNdThemeTokens(theme)), [theme]);

  const [recordings, setRecordings] = useState([]);
  const [selectedRecording, setSelectedRecording] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [recordingForm, setRecordingForm] = useState({ recordingLabel: "", recordingType: "EEG", clinician: user?.name || "", notes: "", status: "review_pending" });

  useEffect(() => {
    try {
      window.localStorage.setItem("nd_theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    } catch {}
  }, [theme]);

  const apiFetch = useCallback(async (url, options = {}) => {
    const res = await fetch(`${API}${url}`, { ...options, headers: apiHeaders({ ...(options.headers || {}) }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.message || data.error || `Request failed with HTTP ${res.status}`);
    return data;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = search ? `?q=${encodeURIComponent(search)}` : "";
      const rRes = await apiFetch(`/recordings${qs}`);
      setRecordings(rRes.recordings || []);
    } catch (err) {
      setError(err.message || "Could not load recordings.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, search]);

  useEffect(() => { loadData(); }, [loadData]);

  const editRecording = (recording) => {
    setSelectedRecording(recording);
    setRecordingForm({
      recordingLabel: recording.recordingLabel || recording.fileName || "",
      recordingType: recording.recordingType || "EEG",
      clinician: recording.clinician || user?.name || "",
      notes: recording.notes || "",
      status: recording.status || "review_pending",
    });
  };

  const saveRecording = async (event) => {
    event.preventDefault();
    if (!selectedRecording?.jobId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch(`/recordings/${encodeURIComponent(selectedRecording.jobId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recordingForm),
      });
      setMessage("Analysis metadata updated.");
      setSelectedRecording(null);
      await loadData();
    } catch (err) {
      setError(err.message || "Analysis update failed.");
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => ({
    recordings: recordings.length,
    analysed: recordings.filter((r) => Number(r.totalSegments || 0) > 0 || String(r.jobStatus || "").toLowerCase() === "ready").length,
    seizure: recordings.filter((r) => (Number(r.aiSeizureWindows || 0) + Number(r.ruleSeizureWindows || 0) + Number(r.hybridSeizureWindows || 0)) > 0).length,
    pending: recordings.filter((r) => String(r.status || "").includes("pending") || String(r.status || "") === "queued").length,
  }), [recordings]);

  return (
    <div className="recording-page-shell" style={{ height: "100vh", fontFamily: "'Roboto', Arial, sans-serif", color: C.text, background: C.surfaceGradient, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, opacity: C.dark ? 0.32 : 0.24, backgroundImage: C.gridOverlay, backgroundSize: "32px 32px" }} />
      <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "168px minmax(0,1fr)", height: "100vh", padding: 12, gap: 12, minHeight: 0 }}>
        <ReferenceAnalysisNav
          C={C}
          active="recordings"
          setActive={(key) => {
            if (key === "live") (onOpenLive || onStartAnalysis)?.();
            else if (key === "ai") onOpenAi?.();
            else if (key === "rule") onOpenRule?.();
            else if (key === "hybrid") onOpenHybrid?.();
            else if (key === "annotations") onOpenAnnotations?.();
            else if (key === "report") onOpenReport?.();
          }}
          onBackDashboard={onBackDashboard}
          onOpenRecordings={() => {}}
          onGoToReport={onOpenReport}
          theme={theme}
          setTheme={setTheme}
        />

        <main className="nd-scrollbar" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 6 }}>
          <RecordingNotice C={C} error={error} message={message} />
          <RecordingStatsGrid C={C} stats={stats} loading={loading} />

          <section style={{ display: "grid", gridTemplateColumns: selectedRecording ? "360px 1fr" : "1fr", gap: 12, minHeight: 520 }}>
            <RecordingEditPanel
              C={C}
              selectedRecording={selectedRecording}
              recordingForm={recordingForm}
              setRecordingForm={setRecordingForm}
              saving={saving}
              onSave={saveRecording}
              onCancel={() => setSelectedRecording(null)}
            />
            <RecordingRegistryTable
              C={C}
              recordings={recordings}
              loading={loading}
              search={search}
              setSearch={setSearch}
              onStartAnalysis={onStartAnalysis}
              onEditRecording={editRecording}
              onOpenRecording={onOpenRecording}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
