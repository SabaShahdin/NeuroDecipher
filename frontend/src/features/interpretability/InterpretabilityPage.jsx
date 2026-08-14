import { useEffect, useMemo, useState } from "react";
import { API, apiHeaders } from "../../constants.js";
import { useNdThemeTokens } from "../../hooks/useNdTheme.js";
import { buildSegmentBundles, hexToRgba } from "../../components/utils.js";
import { ReferenceAnalysisNav } from "../../components/reference/ReferenceAnalysisNav.jsx";

import { clamp01, pct, labelText, isSeizure, classLabel, subtypeText, cleanCh, safeArr, Panel, Gauge, LineChart, HorizontalBars, Topography, Spectrogram, BandPower, ShapContributionChart, RuleTable, HybridFusion, ArtifactPanel, EegAttentionViewer, readInterpretabilityCache, writeInterpretabilityCache, SelectControl } from "./components/InterpretabilitySections.jsx";
export default function InterpretabilityPage({
  jobId,
  fileName,
  eegData,
  events,
  ruleEvents,
  edits,
  colorMap,
  onBackDashboard,
  onOpenRecordings,
  onGoToReport,
  onOpenAnalysisPage,
  
  interpretabilityEnabled = false }) {
  const { C, theme, setTheme } = useNdThemeTokens();
  const [details, setDetails] = useState(() => readInterpretabilityCache(jobId));
  const [error, setError] = useState("");
  const [selectedSegment, setSelectedSegment] = useState(() => {
    const cached = readInterpretabilityCache(jobId);
    const first = cached?.segments?.[0]?.segment ?? cached?.event_summary_table?.[0]?.segment;
    return first !== undefined && first !== null ? Number(first) : null;
  });
  const [isRefreshingInterpretability, setIsRefreshingInterpretability] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!jobId) {
        setDetails(null);
        setSelectedSegment(null);
        return;
      }

      const cached = readInterpretabilityCache(jobId);
      if (cached && alive) {
        setDetails(cached);
        setError("");
        setSelectedSegment((current) => {
          if (current !== null && current !== undefined) return current;
          const first = cached?.segments?.[0]?.segment ?? cached?.event_summary_table?.[0]?.segment;
          return first !== undefined && first !== null ? Number(first) : null;
        });
      }

      try {
        setIsRefreshingInterpretability(true);
        setError("");
        const res = await fetch(`${API}/analysis/${encodeURIComponent(jobId)}/interpretability`, {
          headers: apiHeaders() });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Could not load interpretability data");
        if (alive) {
          writeInterpretabilityCache(jobId, json);
          setDetails(json);
          setSelectedSegment((current) => {
            const exists = json?.segments?.some((s) => Number(s.segment) === Number(current));
            if (exists) return current;
            const first = json?.segments?.[0]?.segment ?? json?.event_summary_table?.[0]?.segment;
            return first !== undefined && first !== null ? Number(first) : null;
          });
        }
      } catch (e) {
        if (alive && !cached) setError(e.message || "Could not load interpretability data");
      } finally {
        if (alive) setIsRefreshingInterpretability(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [jobId]);

  useEffect(() => {
    if (!jobId || typeof window === "undefined") return undefined;

    const applyCachedInterpretability = () => {
      const cached = readInterpretabilityCache(jobId);
      if (!cached) return;
      setDetails(cached);
      setError("");
      setSelectedSegment((current) => {
        const exists = cached?.segments?.some((seg) => Number(seg.segment) === Number(current));
        if (exists) return current;
        const first = cached?.segments?.[0]?.segment ?? cached?.event_summary_table?.[0]?.segment;
        return first !== undefined && first !== null ? Number(first) : current;
      });
    };

    const onPrefetched = (event) => {
      if (event?.detail?.jobId !== jobId) return;
      applyCachedInterpretability();
    };

    window.addEventListener("nd:interpretability-prefetched", onPrefetched);
    applyCachedInterpretability();
    return () => window.removeEventListener("nd:interpretability-prefetched", onPrefetched);
  }, [jobId]);


  const bundles = useMemo(
    () => buildSegmentBundles(events || details?.events || [], ruleEvents || details?.ruleEvents || [], edits || {}),
    [events, ruleEvents, edits, details]
  );
  const signal =
    details?.eeg_viewer?.signal ||
    (eegData
      ? {
          channels: eegData.channels,
          times: eegData.times,
          data: eegData.data,
          duration: eegData.times?.at?.(-1),
          samplingRate: eegData.samplingRate }
      : null);
  const selectedBundle = selectedSegment != null
    ? bundles.find((b) => Number(b.index) === Number(selectedSegment))
    : null;

  const liveSelectedSummary = selectedBundle ? {
    ai_class: selectedBundle.ai?.label,
    ai_confidence: selectedBundle.ai?.confidence ?? selectedBundle.ai?.prob,
    ai_subtype: selectedBundle.ai?.ai_subtype_full || selectedBundle.ai?.ai_subtype,
    rule_class: selectedBundle.rule?.label,
    rule_confidence: selectedBundle.rule?.confidence ?? selectedBundle.rule?.rule_subtype_confidence,
    rule_trigger_ratio: selectedBundle.rule?.rule_trigger_ratio,
    triggered_rules: selectedBundle.rule?.triggered_rules,
    total_rules: selectedBundle.rule?.total_rules,
    rule_subtype: selectedBundle.rule?.rule_subtype_full || selectedBundle.rule?.rule_subtype,
    hybrid_class: selectedBundle.rule?.hybrid_label || selectedBundle.ai?.label,
    hybrid_score: selectedBundle.rule?.hybrid_confidence ?? Math.max(
      clamp01(selectedBundle.ai?.confidence ?? selectedBundle.ai?.prob ?? 0),
      clamp01(selectedBundle.rule?.confidence ?? selectedBundle.rule?.rule_subtype_confidence ?? 0)
    ),
    // Hybrid subtype only makes sense once the hybrid label itself is seizure.
    // Prefer the AI checkpoint's subtype (it's the primary classifier); fall
    // back to the rule engine's own subtype call if AI didn't produce one.
    hybrid_subtype: isSeizure(selectedBundle.rule?.hybrid_label || selectedBundle.ai?.label)
      ? (selectedBundle.ai?.ai_subtype_full || selectedBundle.ai?.ai_subtype
         || selectedBundle.rule?.rule_subtype_full || selectedBundle.rule?.rule_subtype)
      : null,
    agreement_score: selectedBundle.rule?.agreement_score,
  } : {};

  const selected = selectedSegment != null ? details?.segments?.find((s) => Number(s.segment) === Number(selectedSegment)) : null;
  const summary = selected?.prediction_summary || (Object.keys(liveSelectedSummary).length ? liveSelectedSummary : details?.prediction_summary) || {};
  const ruleRows = selected?.rule_trigger_details || selectedBundle?.rule?.rule_trigger_details || details?.rule_trigger_details || [];
  const hybrid = selected?.hybrid_fusion_analysis || selectedBundle?.rule?.hybrid_fusion_analysis || details?.hybrid_fusion_analysis || {};

  const navSetActive = (key) => {
    if (key === "interpretability" || key === "ai" || key === "rule" || key === "hybrid") return;
    onOpenAnalysisPage?.(key);
  };

  const liveViewerEvents = useMemo(() => bundles.map((b) => ({
    segment: b.index,
    index: b.index,
    start: b.start,
    end: b.end,
    aiLabel: b.ai?.label,
    ruleLabel: b.rule?.label,
    hybridLabel: b.rule?.hybrid_label,
    finalLabel: b.rule?.hybrid_label || b.ai?.label || b.rule?.label,
  })), [bundles]);

  const viewerEvents = useMemo(() => {
    const rowsBySegment = new Map();
    liveViewerEvents.forEach((row) => rowsBySegment.set(Number(row.segment ?? row.index), row));
    safeArr(details?.event_summary_table).forEach((row) => {
      const key = Number(row.segment ?? row.index);
      if (!Number.isFinite(key)) return;
      rowsBySegment.set(key, { ...(rowsBySegment.get(key) || {}), ...row, segment: key });
    });
    return Array.from(rowsBySegment.values()).sort((a, b) => Number(a.segment ?? a.index ?? 0) - Number(b.segment ?? b.index ?? 0));
  }, [details, liveViewerEvents]);

  const liveConfidenceRows = useMemo(() => bundles.map((b) => {
    const ai = b.ai || {};
    const rule = b.rule || {};
    const aiConfidence = clamp01(ai.confidence ?? ai.prob ?? 0);
    const ruleConfidence = clamp01(rule.confidence ?? rule.rule_subtype_confidence ?? 0);
    const hybridConfidence = clamp01(rule.hybrid_confidence ?? Math.max(aiConfidence, ruleConfidence));
    return {
      segment: b.index,
      time: b.start ?? b.index,
      start: b.start,
      end: b.end,
      aiConfidence,
      ruleConfidence,
      hybridConfidence,
      label: rule.hybrid_label || ai.label || rule.label,
      hybridLabel: rule.hybrid_label,
    };
  }), [bundles]);

  const confidenceRows = useMemo(() => {
    const rowsBySegment = new Map();
    liveConfidenceRows.forEach((row) => rowsBySegment.set(Number(row.segment), row));
    safeArr(details?.confidence_over_time).forEach((row, i) => {
      const key = Number(row.segment ?? row.index ?? i);
      if (!Number.isFinite(key)) return;
      rowsBySegment.set(key, { ...(rowsBySegment.get(key) || {}), ...row, segment: key });
    });
    if (selectedSegment != null && selectedBundle && !rowsBySegment.has(Number(selectedSegment))) {
      const ai = selectedBundle.ai || {};
      const rule = selectedBundle.rule || {};
      const aiConfidence = clamp01(ai.confidence ?? ai.prob ?? 0);
      const ruleConfidence = clamp01(rule.confidence ?? rule.rule_subtype_confidence ?? 0);
      rowsBySegment.set(Number(selectedSegment), {
        segment: selectedBundle.index,
        time: selectedBundle.start ?? selectedBundle.index,
        start: selectedBundle.start,
        end: selectedBundle.end,
        aiConfidence,
        ruleConfidence,
        hybridConfidence: clamp01(rule.hybrid_confidence ?? Math.max(aiConfidence, ruleConfidence)),
        label: rule.hybrid_label || ai.label || rule.label,
        hybridLabel: rule.hybrid_label,
      });
    }
    return Array.from(rowsBySegment.values()).sort((a, b) => Number(a.segment ?? 0) - Number(b.segment ?? 0));
  }, [details, liveConfidenceRows, selectedBundle, selectedSegment]);


  const readyForInterpretability = Boolean(
    interpretabilityEnabled &&
    jobId &&
    (
      (details?.segments?.length || 0) > 0 ||
      (events?.length || 0) > 0 ||
      (ruleEvents?.length || 0) > 0
    )
  );

  return (
    <div className="nd-page-shell" style={{ height: "100vh", maxHeight: "100vh", background: C.pageGradient || C.bg, color: C.text, fontFamily: "'Roboto', Arial, sans-serif", display: "grid", gridTemplateColumns: "168px minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr)", gap: 12, padding: 12, overflow: "hidden", minHeight: 0 }}>
      <ReferenceAnalysisNav C={C} active="interpretability" setActive={navSetActive} onBackDashboard={onBackDashboard} onOpenRecordings={onOpenRecordings} onGoToReport={onGoToReport} interpretabilityDisabled={!readyForInterpretability} theme={theme} setTheme={setTheme} />

      <section style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
      <div style={{ height: 52, border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel3, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", minWidth: 0, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
         
          <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Interpretability & Analytics</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0, flexShrink: 0 }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px 10px", fontSize: 10, color: C.text, maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Analysis: {fileName || details?.job?.fileName || "—"}{isRefreshingInterpretability && details ? " · updating" : ""}</div>
          <div
            title={selected?.clinical_interpretation?.summary || details?.clinical_interpretation?.summary || "Clinical interpretation will appear after backend analysis is available."}
            className="nd-scrollbar"
            style={{
              border: `1px solid ${hexToRgba(C.purple, .35)}`,
              background: hexToRgba(C.purple, .10),
              borderRadius: 8,
              padding: "7px 10px",
              fontSize: 11,
              color: C.text,
              maxWidth: 520,
              minWidth: 260,
              maxHeight: 48,
              lineHeight: 1.35,
              whiteSpace: "normal",
              overflowY: "auto",
              overflowX: "hidden",
              overflowWrap: "anywhere"
            }}
          >
            <b style={{ color: C.purple, fontWeight: 950 }}>Clinical Interpretation:</b>{" "}
            {selected?.clinical_interpretation?.summary || details?.clinical_interpretation?.summary || "Pending"}
          </div>
        </div>
      </div>

      <div style={{ minHeight: 0, flex: 1, display: "flex", overflow: "hidden" }}>

        <main className="nd-scrollbar" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "grid", alignContent: "start", gap: 8, paddingRight: 6 }}>
          {error && <div style={{ color: C.red, border: `1px solid ${hexToRgba(C.red, 0.35)}`, padding: 10, borderRadius: 8 }}>{error}</div>}
          {!readyForInterpretability && <div style={{ color: C.muted, border: `1px solid ${C.line}`, padding: 16, borderRadius: 10, background: C.panel, display: "grid", gap: 8 }}><div style={{ color: C.text, fontWeight: 950 }}>Interpretability is preparing</div><div>Run live prediction first. This page unlocks after the first AI / Rule / Hybrid prediction arrives.</div><div style={{ height: 6, borderRadius: 99, background: hexToRgba(C.muted,.12), overflow: "hidden" }}><div style={{ width: "42%", height: "100%", background: C.purple, animation: "pulse 1.2s ease-in-out infinite" }} /></div></div>}
<div
  style={{
    display: "grid",
    gridTemplateColumns: "minmax(520px, 1.05fr) minmax(520px, 1fr)",
    gridTemplateRows: "190px 230px",
    gap: 8,
    minWidth: 0,
    alignItems: "stretch" }}
>
  <Panel
    C={C}
    title="EEG Viewer with AI Annotation Overlay"
    compact
    style={{
      gridRow: "1 / span 2",
      height: 428,
      minHeight: 428 }}
    bodyStyle={{
      padding: 0,
      display: "flex",
      minHeight: 0,
      overflow: "hidden" }}
  >
    <EegAttentionViewer
      C={C}
      signal={signal}
      heightPx={396}
      events={viewerEvents}
      selectedSegment={selectedSegment}
      onSelectSegment={setSelectedSegment}
    />
  </Panel>

  <Panel
    C={C}
    title="Prediction Summary"
    subtitle="(AI / Rule / Hybrid)"
    compact
    style={{
      height: 190,
      minHeight: 190 }}
    bodyStyle={{
      padding: 8,
      minHeight: 0,
      overflow: "hidden" }}
  >
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 8,
        minWidth: 0 }}
    >
      <Gauge
        C={C}
        title="AI Prediction"
        label={classLabel(summary.ai_class || summary.aiLabel)}
        value={summary.ai_confidence}
        color={C.red}
        meta={subtypeText(summary.ai_class || summary.aiLabel, summary.ai_subtype || selected?.subtype)}
      />

      <Gauge
        C={C}
        title="Rule Prediction"
        label={classLabel(summary.rule_class || summary.ruleLabel)}
        value={summary.rule_confidence || summary.rule_trigger_ratio}
        color={C.orange}
        meta={subtypeText(summary.rule_class || summary.ruleLabel, summary.rule_subtype)}
        submeta={`Triggered Rules ${summary.triggered_rules ?? "—"} / ${
          summary.total_rules ?? "—"
        }`}
      />

      <Gauge
        C={C}
        title="Hybrid Fusion"
        label={classLabel(summary.hybrid_class || summary.hybridLabel)}
        value={summary.hybrid_score}
        color={C.green}
        meta={subtypeText(summary.hybrid_class || summary.hybridLabel, summary.hybrid_subtype)}
        submeta={`Agreement Score ${pct(summary.agreement_score)}`}
      />
    </div>
  </Panel>

  <Panel
    C={C}
    title="Confidence Over Time"
    compact
    style={{
      height: 230,
      minHeight: 230 }}
    bodyStyle={{
      padding: "4px 8px 2px",
      minHeight: 0,
      overflow: "hidden" }}
  >
    <LineChart
      C={C}
      rows={confidenceRows}
      selectedSegment={selectedSegment}
      heightPx={194}
    />
  </Panel>
</div>

          

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 8, minWidth: 0 }}>
            
            <Panel C={C} title="Rule Trigger Details"><RuleTable C={C} rows={ruleRows} /></Panel>
            
          <Panel
  C={C}
  n="10"
  title="Hybrid Fusion Analysis"
  compact
  style={{ height: 282, minHeight: 282 }}
  bodyStyle={{ padding: 8 }}
>
  <HybridFusion C={C} data={hybrid} />
</Panel>
          </div>

<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8, minWidth: 0 }}>
              <Panel
                C={C}
                n="4"
                title="Channel Importance"
                subtitle="(Hybrid / AI / Rule)"
                style={{ minHeight: 238, height: 238 }}
                bodyStyle={{ padding: "10px 8px 8px", overflow: "hidden" }}
              >
                <HorizontalBars
                  C={C}
                  rows={selected?.channel_importance || details?.channel_importance_hybrid || details?.channel_importance_ai}
                  color={C.purple}
                  valueKey="importance_score"
                  heightPx={190}
                  mode="hybrid"
                />
              </Panel>
            <Panel C={C} n="5" title="AI Attention Heatmap" subtitle="Scalp topography"><Topography C={C} points={selected?.ai_attention_heatmap || details?.ai_attention_heatmap} /></Panel>
            <Panel C={C} n="8" title="SHAP-like Feature Contribution"><ShapContributionChart C={C} rows={selected?.shap_feature_contribution || details?.shap_feature_contribution} /></Panel>
            
          </div>

        </main>
      </div>
      </section>
    </div>
  );
}
