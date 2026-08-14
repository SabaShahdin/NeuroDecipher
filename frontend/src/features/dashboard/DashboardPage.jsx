import { useCallback, useEffect, useState } from "react";
import { API, apiHeaders } from "../../constants.js";
import { useNdThemeTokens } from "../../hooks/useNdTheme.js";
import { ReferenceAnalysisNav } from "../../components/reference/ReferenceAnalysisNav.jsx";
import MetricCard from "./components/MetricCard.jsx";
import RecentRecordingsTable from "./components/RecentRecordingsTable.jsx";
import SystemOverviewPanel from "./components/SystemOverviewPanel.jsx";
import ModelStatusPanel from "./components/ModelStatusPanel.jsx";
import {
  Database,
  BrainCircuit,
  Activity,
  CheckCircle2,
  FileText,
} from "lucide-react";
export default function DashboardPage({
  user,
  onStartAnalysis,
  onOpenRecordings,
  onOpenLive,
  onOpenAi,
  onOpenRule,
  onOpenHybrid,
  onOpenAnnotations,
  onOpenReport,
  onOpenReview,
  onOpenRecording,
}) {
  const { theme, setTheme, C } = useNdThemeTokens();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/dashboard/overview`, { headers: apiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.message || data.error || `Dashboard failed with HTTP ${res.status}`);
      setOverview(data);
    } catch (err) {
      setError(err.message || "Could not load dashboard overview from backend.");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const totals = overview?.totals || {};
  const recent = overview?.recentRecordings || [];
  const distribution = overview?.seizureDistribution || { seizure: 0, nonSeizure: 0 };
  const seizureTypes = overview?.seizureTypeDistribution || [];
  const modelStatus = overview?.modelStatus || {};
  const generatedAt = overview?.generatedAt ? new Date(overview.generatedAt).toLocaleString() : "—";

  const openNavTarget = (key) => {
    if (key === "live") (onOpenLive || onOpenReview)?.();
    else if (key === "ai") (onOpenAi || onOpenReview)?.();
    else if (key === "rule") (onOpenRule || onOpenReview)?.();
    else if (key === "hybrid") (onOpenHybrid || onOpenReview)?.();
    else if (key === "annotations") (onOpenAnnotations || onOpenReview)?.();
    else if (key === "report") onOpenReport?.();
  };

  return (
    <div className="nd-page-shell" style={{ height: "100vh", fontFamily: "'Roboto', Arial, sans-serif", color: C.text, background: C.pageGradient, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, opacity: C.dark ? 0.35 : 0.28, backgroundImage: C.gridOverlay, backgroundSize: "32px 32px" }} />
      <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "168px minmax(0,1fr)", height: "100vh", padding: 12, gap: 12, minHeight: 0 }}>
        <ReferenceAnalysisNav
          C={C}
          active="dashboard"
          setActive={openNavTarget}
          onBackDashboard={() => {}}
          onOpenRecordings={onOpenRecordings}
          onGoToReport={onOpenReport}
          theme={theme}
          setTheme={setTheme}
        />

        <main className="nd-scrollbar" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 6 }}>
         <section
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 14,
  }}
>
  <MetricCard
    C={C}
    loading={loading}
    icon={<Database size={22} strokeWidth={2.2} />}
    label="Analyses"
    value={totals.totalRecordings || 0}
    sub={`${totals.analysedRecordings || 0} analysed`}
    color={C.orange}
  />

  <MetricCard
    C={C}
    loading={loading}
    icon={<BrainCircuit size={22} strokeWidth={2.2} />}
    label="AI Analyses"
    value={totals.aiAnalyses || 0}
    sub="EEG with annotation"
    color={C.purple}
  />

  <MetricCard
    C={C}
    loading={loading}
    icon={<Activity size={22} strokeWidth={2.2} />}
    label="Seizure Analyses"
    value={totals.seizureRecordings || 0}
    sub={`${totals.seizureSegments || 0} seizure segments`}
    color={C.red}
  />

  <MetricCard
    C={C}
    loading={loading}
    icon={<CheckCircle2 size={22} strokeWidth={2.2} />}
    label="Non-Seizure"
    value={totals.nonSeizureRecordings || 0}
    sub="Clear analyses"
    color={C.accent}
  />

  <MetricCard
    C={C}
    loading={loading}
    icon={<FileText size={22} strokeWidth={2.2} />}
    label="Reports"
    value={totals.reportsGenerated || 0}
    sub={`${totals.annotations || 0} annotations`}
    color={C.accent2}
  />
</section>
          <section style={{ display: "grid", gridTemplateColumns: "1.55fr .8fr", gap: 12, flex: "1 1 auto", minHeight: 420 }}>
            <RecentRecordingsTable C={C} loading={loading} recent={recent} onStartAnalysis={onStartAnalysis} onOpenRecording={onOpenRecording} onOpenRecordings={onOpenRecordings} />
            <div style={{ display: "grid", gap: 12, height: "100%", minHeight: 0 }}>
              <SystemOverviewPanel C={C} totals={totals} distribution={distribution} seizureTypes={seizureTypes} />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
