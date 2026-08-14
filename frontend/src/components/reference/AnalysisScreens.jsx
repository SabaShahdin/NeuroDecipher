import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { API, apiHeaders, fmtT } from "../../constants.js";
import { pct, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "../utils.js";
import { BackendDetailShell } from "./BackendDetailShell.jsx";
import { ReferenceAnalysisNav } from "./ReferenceAnalysisNav.jsx";
import { useBackendAnalysisDetails } from "./ReferenceComponents.jsx";
import { MiniStatCard, SimpleBarChart, SimpleTimeline, AiExplainCard, AiLineChart, AiHeatmap, AiTopography, AiSpectrogram, AiFeatureTable, AiModelMetadata, AiMiniLineGraph, AiEventTimeline, AiComparisonTable, AiFeatureContributionTable, AiBandPowerChart, AiChartCard, AiSvgLineChart, AiEventTimelineChart, AiEngineConfidenceBars, AiFrequencyTrendChart, AiPlotImage, AiTopSegmentTimeline, ClinicalEmptyPlot, ClinicalConfidencePlot, ClinicalSegmentTimelinePlot, ClinicalHorizontalBarPlot, ClinicalFrequencyPlot, ClinicalEngineComparisonTable } from "./AnalysisCharts.jsx";
function AiAnalysisDetailsScreen({ C, bundles, details, onSelect }) {
  const advanced = details?.aiExplainability || details?.charts?.aiAdvanced || {};
  const clean = advanced.cleanProfessional || {};
  const [selectedAiSegment, setSelectedAiSegment] = useState(null);
  const aiEvents = bundles.filter(b => b.ai);
  const aiSz = bundles.filter(b => b.ai?.label === "seizure").length;

  const confidenceRows = (clean.confidenceTimeline?.length ? clean.confidenceTimeline : bundles.map(b => ({
    segment: b.index,
    start: b.start,
    end: b.end,
    aiConfidence: Number(b.ai?.confidence ?? b.ai?.prob ?? 0),
    ruleConfidence: Number(b.rule?.confidence ?? 0),
    hybridConfidence: Number(b.rule?.hybrid_confidence ?? 0),
    aiLabel: b.ai?.label || b.aiLabel,
    ruleLabel: b.rule?.label,
    hybridLabel: b.rule?.hybrid_label,
    finalLabel: b.rule?.hybrid_label || b.ai?.label || b.rule?.label || "pending" }))).map((r, i) => ({
    ...r,
    segment: Number(r.segment ?? i),
    start: Number(r.start ?? i * TIME_STEP_SIZE),
    end: Number(r.end ?? (Number(r.start ?? i * TIME_STEP_SIZE) + TIME_STEP_SIZE)) }));

  const timelineRows = (clean.seizureEventTimeline?.length ? clean.seizureEventTimeline : confidenceRows).map((r, i) => ({
    ...r,
    segment: Number(r.segment ?? i),
    start: Number(r.start ?? confidenceRows[i]?.start ?? i * TIME_STEP_SIZE),
    end: Number(r.end ?? confidenceRows[i]?.end ?? (i + 1) * TIME_STEP_SIZE),
    aiLabel: r.aiLabel || confidenceRows[i]?.aiLabel,
    ruleLabel: r.ruleLabel || confidenceRows[i]?.ruleLabel,
    hybridLabel: r.hybridLabel || confidenceRows[i]?.hybridLabel,
    finalLabel: r.finalLabel || r.hybridLabel || r.aiLabel || confidenceRows[i]?.finalLabel || "pending" }));

  const comparisonRows = clean.engineComparison?.length ? clean.engineComparison : confidenceRows;
  const segmentViews = clean.segmentViews || [];
  const selectedBundle = selectedAiSegment == null ? null : bundles.find(b => Number(b.index) === Number(selectedAiSegment));
  const selectedView = selectedAiSegment == null ? null : (segmentViews.find(v => Number(v.segment) === Number(selectedAiSegment)) || (selectedBundle ? {
    segment: selectedBundle.index,
    start: selectedBundle.start,
    end: selectedBundle.end,
    aiLabel: selectedBundle.ai?.label || "pending",
    aiConfidence: Number(selectedBundle.ai?.confidence ?? selectedBundle.ai?.prob ?? 0),
    ruleConfidence: Number(selectedBundle.rule?.confidence ?? 0),
    hybridConfidence: Number(selectedBundle.rule?.hybrid_confidence ?? 0),
    channelImportance: clean.segmentChannelImportance || advanced.channelImportance || [],
    featureContributionTable: clean.featureContributionTable || advanced.featureContributionTable || [],
    frequencyBandPower: clean.frequencyBandPower || advanced.frequencyAnalysis || [] } : null));

  const fileChannels = clean.fileChannelImportance || advanced.channelImportance || [];
  const segmentChannels = selectedView?.channelImportance || clean.segmentChannelImportance || advanced.channelImportance || [];
  const featureRows = selectedView?.featureContributionTable || clean.featureContributionTable || advanced.featureContributionTable || [];
  const bandRows = selectedView?.frequencyBandPower || selectedView?.frequencyAnalysis || clean.frequencyBandPower || advanced.frequencyAnalysis || [];
  const frequencyTrend = clean.frequencyBandTrend || [];
  const fullScalp = clean.scalpTopography || advanced.scalpTopography || fileChannels.map((r, i) => ({ channel: r.channel, value: r.value, x: Math.cos(i) * 0.55, y: Math.sin(i) * 0.55 }));
  const fullSpectrogram = clean.spectrogram || advanced.spectrogram || {};
  const fullMetadata = clean.modelMetadata || advanced.modelMetadata || {};
  const fullStability = clean.predictionStability || advanced.predictionStability || {};
  const fullConfidenceEvolution = (advanced.confidenceEvolution?.length ? advanced.confidenceEvolution : confidenceRows.map(r => ({
    segment: Number(r.segment || 0) + 1,
    time: r.start,
    confidence: r.aiConfidence,
    probability: r.aiConfidence,
    label: r.aiLabel })));

  const selectedScalp = selectedView?.scalpTopography || fullScalp;
  const selectedSpectrogram = selectedView?.spectrogram || fullSpectrogram;
  const selectedStability = selectedView?.predictionStability || fullStability;
  const selectedConfidenceEvolution = selectedView?.confidenceEvolution || (selectedView ? [{
    segment: Number(selectedView.segment || 0) + 1,
    time: selectedView.start,
    confidence: selectedView.aiConfidence,
    probability: selectedView.aiConfidence,
    label: selectedView.aiLabel }] : fullConfidenceEvolution);

  const handleSelect = (idx) => setSelectedAiSegment(idx);
  const clearSelection = () => setSelectedAiSegment(null);

  const StabilityCard = ({ stability = {} }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
      {[
        ["Stability score", pct(stability.score), C.green],
        ["Label flips", stability.labelFlips ?? 0, C.orange],
        ["Confidence std", Number(stability.confidenceStd ?? 0).toFixed(3), C.blue],
        ["Windows", stability.windowCount ?? confidenceRows.length, C.purple],
      ].map(([k, v, color]) => (
        <div key={k} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, minWidth: 0, background: C.panel2 }}>
          <div style={{ color: C.dim, fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em" }}>{k}</div>
          <div style={{ color, fontWeight: 950, fontSize: 18, marginTop: 5, overflowWrap: "anywhere" }}>{v ?? "—"}</div>
        </div>
      ))}
    </div>
  );

  const MetadataCard = ({ metadata = {} }) => {
    const items = [
      ["Detection model", metadata.detectionModel],
      ["Classification model", metadata.classificationModel],
      ["Graph method", metadata.graphMethod],
      ["Window", `${metadata.windowSeconds ?? "—"}s`],
      ["Resampled Fs", `${metadata.resampledFrequency ?? "—"} Hz`],
      ["Channels", metadata.standardChannels],
    ];
    return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>
      {items.map(([k, v]) => (
        <div key={k} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 11, background: C.panel2, minWidth: 0 }}>
          <div style={{ color: C.dim, fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em" }}>{k}</div>
          <div style={{ color: C.text, fontWeight: 900, fontSize: 12, marginTop: 5, overflowWrap: "anywhere" }}>{v ?? "—"}</div>
        </div>
      ))}
      {metadata.explainabilityMode && <div style={{ gridColumn: "1 / -1", color: C.muted, fontSize: 11, lineHeight: 1.55, overflowWrap: "anywhere" }}>{metadata.explainabilityMode}</div>}
    </div>;
  };

  return <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
    <ClinicalSegmentTimelinePlot C={C} rows={timelineRows} selectedIndex={selectedAiSegment} onSelect={handleSelect} onClear={clearSelection} />

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
      <MiniStatCard C={C} label="AI windows" value={aiEvents.length} color={C.blue} sub="backend AI prediction rows" />
      <MiniStatCard C={C} label="AI seizure windows" value={aiSz} color={C.red} sub="segments classified seizure" />
      <MiniStatCard C={C} label={selectedView ? "Selected segment" : "Current mode"} value={selectedView ? `S${Number(selectedView.segment) + 1}` : "Full file"} color={C.purple} sub={selectedView ? `${fmtT(selectedView.start)}–${fmtT(selectedView.end)}` : "overall recording analysis"} />
      <MiniStatCard C={C} label="Stability" value={pct((selectedView ? selectedStability : fullStability).score)} color={C.green} sub={`${(selectedView ? selectedStability : fullStability).labelFlips ?? 0} label flips`} />
    </div>

    {selectedView ? <>
      <div style={{ border: `1px solid ${hexToRgba(C.purple, .38)}`, background: hexToRgba(C.purple, .08), borderRadius: 14, padding: 14 }}>
        <div style={{ color: C.text, fontWeight: 950, fontSize: 16 }}>Segment View · selected EEG window</div>
        <div style={{ color: C.muted, fontSize: 12, marginTop: 4, lineHeight: 1.55 }}>Only the approved clinical plots are shown for this segment. Click “Full recording” on the timeline to return to global analysis.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))", gap: 14 }}>
        <AiChartCard C={C} title="Channel Importance Ranking" subtitle="WHERE: segment-level channels ranked by contribution." badge="core">
          <ClinicalHorizontalBarPlot C={C} rows={segmentChannels.map(r => ({ label: r.channel, value: r.value }))} color={C.blue} />
        </AiChartCard>
        <AiChartCard C={C} title="Confidence Evolution Graph" subtitle="HOW SURE: selected segment confidence with timeline context." badge="core">
          <AiLineChart C={C} data={selectedConfidenceEvolution} />
        </AiChartCard>
        <AiChartCard C={C} title="Spectrogram" subtitle="TIME-FREQUENCY: strongest channel energy map for this segment." badge="core">
          <AiSpectrogram C={C} spectrogram={selectedSpectrogram} />
        </AiChartCard>
        <AiChartCard C={C} title="Frequency Analysis" subtitle="EEG band power for the selected window." badge="support">
          <AiBandPowerChart C={C} bands={bandRows} />
        </AiChartCard>
        <AiChartCard C={C} title="Prediction Stability" subtitle="Stability metrics for the selected inference." badge="support">
          <StabilityCard stability={selectedStability} />
        </AiChartCard>
        <AiChartCard C={C} title="Brain Scalp Topography" subtitle="Approximate focus map from segment channel importance." badge="optional">
          <AiTopography C={C} points={selectedScalp} />
        </AiChartCard>
      </div>
      <AiExplainCard C={C} title="Feature Contribution Table" subtitle="WHY: backend-derived values used to explain this segment.">
        <AiFeatureContributionTable C={C} rows={featureRows} />
      </AiExplainCard>
      <AiExplainCard C={C} title="Model Metadata" subtitle="Model/runtime settings used for this analysis.">
        <MetadataCard metadata={fullMetadata} />
      </AiExplainCard>
    </> : <>
      <div style={{ border: `1px solid ${hexToRgba(C.blue, .38)}`, background: hexToRgba(C.blue, .08), borderRadius: 14, padding: 14 }}>
        <div style={{ color: C.text, fontWeight: 950, fontSize: 16 }}>Full Analysis View · global AI analysis</div>
        <div style={{ color: C.muted, fontSize: 12, marginTop: 4, lineHeight: 1.55 }}>Only the selected clinical plots are shown. Click any segment above to switch these charts to segment-level analysis.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, fontFamily: "'Roboto', Arial, sans-serif", fontSize: 10, color: C.dim }}>
          <span>confidence rows: {confidenceRows.length}</span>
          <span>channel rows: {fileChannels.length}</span>
          <span>frequency rows: {frequencyTrend.length}</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(460px,1fr))", gap: 14 }}>
        <AiChartCard C={C} title="Channel Importance Ranking" subtitle="WHERE: average channel contribution across the full recording." badge="core">
          <ClinicalHorizontalBarPlot C={C} rows={fileChannels.map(r => ({ label: r.channel, value: r.value }))} color={C.purple} />
        </AiChartCard>
        <AiChartCard C={C} title="Confidence Evolution Graph" subtitle="HOW SURE: AI confidence trend across persisted prediction windows." badge="core">
          <AiLineChart C={C} data={fullConfidenceEvolution} />
        </AiChartCard>
        <AiChartCard C={C} title="Spectrogram" subtitle="TIME-FREQUENCY: representative/high-risk channel energy map." badge="core">
          <AiSpectrogram C={C} spectrogram={fullSpectrogram} />
        </AiChartCard>
        <AiChartCard C={C} title="Frequency Analysis" subtitle="Band-power trend over the uploaded EEG recording." badge="support">
          <ClinicalFrequencyPlot C={C} rows={frequencyTrend.length ? frequencyTrend : confidenceRows.map(r => ({ segment: r.segment, start: r.start, Delta: 0, Theta: 0, Alpha: 0, Beta: 0, Gamma: 0 }))} />
        </AiChartCard>
        <AiChartCard C={C} title="Prediction Stability" subtitle="Stability score, label flips and confidence variability." badge="support">
          <StabilityCard stability={fullStability} />
        </AiChartCard>
        <AiChartCard C={C} title="Brain Scalp Topography" subtitle="Approximate global focus map using backend-derived channel importance." badge="optional">
          <AiTopography C={C} points={fullScalp} />
        </AiChartCard>
      </div>
      <AiExplainCard C={C} title="Feature Contribution Table" subtitle="WHY: backend-derived feature values for the representative/high-risk analysis window.">
        <AiFeatureContributionTable C={C} rows={featureRows} />
      </AiExplainCard>
      <AiExplainCard C={C} title="Model Metadata" subtitle="Model/runtime settings used for this analysis.">
        <MetadataCard metadata={fullMetadata} />
      </AiExplainCard>
      <AiExplainCard C={C} title="AI vs Rule vs Hybrid Reference Table" subtitle="Kept as a compact reference table below the approved plots; click a row to inspect that segment.">
        <ClinicalEngineComparisonTable C={C} rows={comparisonRows} onSelect={handleSelect} />
      </AiExplainCard>
    </>}
  </div>;
}

function RuleBasedDetailsScreen({ C, bundles, details, onSelect }) {
  const ruleRows = details?.charts?.ruleTriggers || [];
  const recentRules = bundles.flatMap(b => (b.rule?.rules || []).map(r => ({ ...r, segment: b.index, start: b.start, end: b.end }))).slice(-20);
  return <div style={{ display: "grid", gap: 12 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 12 }}>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, background: C.panel2, overflow: "hidden" }}>
        <div style={{ padding: 12, color: C.text, fontWeight: 900, borderBottom: `1px solid ${C.line}` }}>Triggered Rules</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr style={{ color: C.muted, textAlign: "left" }}><th style={{ padding: 9 }}>Segment</th><th>Rule</th><th>Status</th></tr></thead><tbody>{recentRules.map((r,i)=><tr key={i} style={{ borderTop: `1px solid ${C.line}` }}><td style={{ padding: 9, color: C.muted, fontFamily: "'Roboto', Arial, sans-serif" }}>#{r.segment}</td><td style={{ color: C.text }}>{r.name || r.id || "Rule"}</td><td><span style={{ color: C.orange, background: hexToRgba(C.orange,.14), border: `1px solid ${hexToRgba(C.orange,.35)}`, padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 900 }}>Triggered</span></td></tr>)}</tbody></table>
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, background: C.panel2, padding: 12 }}><div style={{ color: C.text, fontWeight: 900, marginBottom: 8 }}>Rule Explanation</div><div style={{ color: C.muted, fontSize: 12, lineHeight: 1.65 }}>Rules are displayed from the backend payload for each segment. If rhythmic discharge, spike count, duration, or amplitude thresholds are triggered, the segment is shown in the rule timeline and summarized here.</div></div>
    </div>
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, background: C.panel2, padding: 12 }}><div style={{ color: C.text, fontWeight: 900, marginBottom: 8 }}>Rule Trigger Frequency</div><SimpleBarChart C={C} data={ruleRows} color={C.orange} /></div>
    <SimpleTimeline C={C} bundles={bundles} type="rule" onSelect={onSelect} />
  </div>;
}

function HybridFusionDetailsScreen({ C, bundles, details, onSelect }) {
  const hybridSz = bundles.filter(b => b.rule?.hybrid_label === "seizure").length;
  const aiSz = bundles.filter(b => b.ai?.label === "seizure").length;
  const ruleSz = bundles.filter(b => b.rule?.label === "seizure").length;
  const agree = bundles.filter(b => b.ai && b.rule && b.ai.label === b.rule.label).length;
  return <div style={{ display: "grid", gap: 12 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
      <MiniStatCard C={C} label="AI Seizure" value={aiSz} color={C.blue} />
      <MiniStatCard C={C} label="Rules Seizure" value={ruleSz} color={C.orange} />
      <MiniStatCard C={C} label="Hybrid Seizure" value={hybridSz} color={C.green} />
      <MiniStatCard C={C} label="Agreement" value={`${bundles.length ? Math.round(agree / bundles.length * 100) : 0}%`} color={C.purple} />
    </div>
    <div style={{ border: `1px solid ${C.line}`, background: C.panel2, borderRadius: 8, padding: 12 }}><div style={{ color: C.text, fontWeight: 900, marginBottom: 8 }}>Fusion Timeline</div><SimpleTimeline C={C} bundles={bundles} type="hybrid" onSelect={onSelect} /></div>
    <div style={{ border: `1px solid ${C.line}`, background: C.panel2, borderRadius: 8, padding: 12 }}><div style={{ color: C.text, fontWeight: 900, marginBottom: 8 }}>Decision Explanation</div><div style={{ color: C.muted, fontSize: 12, lineHeight: 1.65 }}>Hybrid confidence is read from the rule-event payload produced by the backend. The UI does not invent decisions: it displays stored AI probability, rule confidence, alpha, and hybrid label per segment.</div></div>
  </div>;
}

function AnnotationReviewDetailsScreen({ C, bundles, edits, audit, editAiEvent, clinician, onSelect }) {
  const suggested = bundles.filter(b => b.aiLabel === "seizure" || b.rule?.hybrid_label === "seizure").slice(0, 80);
  return <div style={{ display: "grid", gap: 12 }}>
    <div style={{ border: `1px solid ${C.line}`, background: C.panel2, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${C.line}`, color: C.text, fontWeight: 900 }}>AI Suggested Events</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr style={{ color: C.muted, textAlign: "left" }}>{["Start", "End", "Type", "AI Conf.", "Rule Conf.", "Hybrid Conf.", "Action"].map(h=><th key={h} style={{ padding: 9 }}>{h}</th>)}</tr></thead><tbody>{suggested.map(b=><tr key={b.index} style={{ borderTop: `1px solid ${C.line}` }}><td style={{ padding: 9, color: C.muted, fontFamily: "'Roboto', Arial, sans-serif" }}>{fmtT(b.start)}</td><td style={{ color: C.muted, fontFamily: "'Roboto', Arial, sans-serif" }}>{fmtT(b.end)}</td><td style={{ color: C.blue }}>{displayLabel(b.aiLabel || b.rule?.hybrid_label, b.ai?.ai_subtype || b.rule?.rule_subtype, b.ai?.ai_subtype_full || b.rule?.rule_subtype_full)}</td><td>{pct(b.ai?.confidence)}</td><td>{pct(b.rule?.confidence)}</td><td>{pct(b.rule?.hybrid_confidence)}</td><td><button onClick={() => { onSelect?.(b.index, b.start); editAiEvent?.(b.index, b.ai || b.rule, "accepted", b.aiLabel || b.rule?.hybrid_label || "seizure", "Accepted from annotation review", clinician); }} style={{ marginRight: 6, display: "inline-flex", alignItems: "center", color: C.green, background: hexToRgba(C.green,.12), border: `1px solid ${hexToRgba(C.green,.4)}`, borderRadius: 5, cursor: "pointer", padding: 4 }}><Check size={13} strokeWidth={2.5} /></button><button onClick={() => editAiEvent?.(b.index, b.ai || b.rule, "rejected", "bckg", "Rejected from annotation review", clinician)} style={{ display: "inline-flex", alignItems: "center", color: C.red, background: hexToRgba(C.red,.12), border: `1px solid ${hexToRgba(C.red,.4)}`, borderRadius: 5, cursor: "pointer", padding: 4 }}><X size={13} strokeWidth={2.5} /></button></td></tr>)}</tbody></table>
    </div>
    <div style={{ border: `1px solid ${C.line}`, background: C.panel2, borderRadius: 8, padding: 12 }}><div style={{ color: C.text, fontWeight: 900, marginBottom: 8 }}>Your Annotations</div>{Object.values(edits || {}).length === 0 ? <div style={{ color: C.muted, fontSize: 11 }}>No local annotations yet.</div> : Object.values(edits).map((e,i)=><div key={i} style={{ color: C.muted, fontSize: 11, padding: "6px 0", borderTop: i ? `1px solid ${C.line}` : "none" }}>Segment #{e.index} · {e.status} · {e.label} · {e.clinician}</div>)}</div>
  </div>;
}

function ReportGenerationDetailsScreen({ C, bundles, details, jobId, fileName, onGoToReport }) {
  const seizure = bundles.filter(b => b.rule?.hybrid_label === "seizure" || b.aiLabel === "seizure");
  return <div style={{ display: "grid", gridTemplateColumns: "310px 1fr", gap: 12 }}>
    <div style={{ border: `1px solid ${C.line}`, background: C.panel2, borderRadius: 8, padding: 14 }}>
      <div style={{ color: C.text, fontWeight: 950, marginBottom: 8 }}>Generate Report</div>
      <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.6 }}>The report uses backend persisted job, prediction, annotation, and audit data for this recording.</div>
      <button onClick={onGoToReport} style={{ marginTop: 14, width: "100%", height: 38, borderRadius: 7, border: `1px solid ${hexToRgba(C.green,.5)}`, background: `linear-gradient(90deg, ${C.green}, ${C.teal})`, color: C.dark ? "#03140D" : "#FFFFFF", fontWeight: 950, cursor: "pointer" }}>Generate / Preview PDF</button>
      <div style={{ marginTop: 16, display: "grid", gap: 8 }}><MiniStatCard C={C} label="Total Segments" value={bundles.length} color={C.blue} /><MiniStatCard C={C} label="Seizure Segments" value={seizure.length} color={C.red} /><MiniStatCard C={C} label="Job ID" value={String(jobId || "—").slice(0,8)} color={C.green} sub={fileName} /></div>
    </div>
    <div style={{ border: `1px solid ${C.line}`, background: C.dark ? "#F8FAFC" : "#FFFFFF", color: "#111827", borderRadius: 8, padding: 18, display: "grid", gridTemplateColumns: "repeat(3,minmax(180px,1fr))", gap: 14 }}>
      {["NEURO DECIPHER EEG SEIZURE ANALYSIS REPORT", "SEIZURE TIMELINE", "CONCLUSION"].map((t,i)=><div key={t} style={{ minHeight: 260, background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 8px 24px rgba(15,23,42,.08)", padding: 14 }}><div style={{ fontSize: 13, fontWeight: 900, borderBottom: "1px solid #E5E7EB", paddingBottom: 8, marginBottom: 12 }}>{i+1}. {t}</div><div style={{ fontSize: 11, color: "#475569", lineHeight: 1.6 }}>{i===0 ? `File: ${fileName || "—"}\nFinal decision is based on AI, rule-based, and hybrid fusion outputs.` : i===1 ? "Timeline bars are generated from backend prediction windows and selected seizure segments." : `Conclusion: ${seizure.length ? "Seizure activity detected in one or more segments." : "No seizure-positive segment stored yet."}`}</div>{i===1 && <SimpleBarChart C={{...C, line:"#E5E7EB", panel3:"#FFF", muted:"#475569"}} data={bundles.slice(0,20).map(b=>({label:String(b.index),value:(b.rule?.hybrid_label==="seizure"||b.aiLabel==="seizure")?1:.2}))} color="#EF4444" height={120}/>}</div>)}
    </div>
  </div>;
}

function ReferenceDetailWorkbench({ C, active, setActive, jobId, fileName, events, ruleEvents, edits, audit, editAiEvent, clinician, onBackDashboard, onOpenRecordings, onGoToReport, onSelectSegment }) {
  const { details, loading, error, reload } = useBackendAnalysisDetails(jobId, events, ruleEvents, audit);
  const backendEvents = details?.events?.length ? details.events : events;
  const backendRules = details?.ruleEvents?.length ? details.ruleEvents : ruleEvents;
  const bundles = buildSegmentBundles(backendEvents, backendRules, edits);
  const titleMap = {
    ai: ["AI Analysis Details Screen", "Model confidence, seizure subtype and contributing feature views", "6"],
    rule: ["Rule-Based Engine Details Screen", "Triggered clinical rules, rule explanation and firing timeline", "7"],
    hybrid: ["Hybrid Fusion Details Screen", "AI + rule evidence combination and final fusion decision", "8"],
    annotations: ["Annotation Review Screen", "AI suggested events and clinician accept/reject workflow", "9"],
    report: ["Report Generation Screen", "PDF report controls and report preview", "10"] };
  const [title, sub, num] = titleMap[active] || titleMap.ai;
  return <div style={{ height: "100vh", display: "flex", gap: 8, padding: 8, background: C.dark ? "linear-gradient(135deg,#040B14 0%,#071523 58%,#05101D 100%)" : "linear-gradient(135deg,#F8FAFC 0%,#EAF4FF 58%,#F8FAFC 100%)", color: C.text, fontFamily: "'Roboto', Arial, sans-serif", overflow: "hidden" }}>
    <ReferenceAnalysisNav C={C} active={active} setActive={setActive} onBackDashboard={onBackDashboard} onOpenRecordings={onOpenRecordings} onGoToReport={onGoToReport} />
    <BackendDetailShell C={C} title={title} subtitle={sub} screenNo={num} details={details} loading={loading} error={error} onRefresh={reload}>
      {active === "ai" && <AiAnalysisDetailsScreen C={C} bundles={bundles} details={details} onSelect={onSelectSegment} />}
      {active === "rule" && <RuleBasedDetailsScreen C={C} bundles={bundles} details={details} onSelect={onSelectSegment} />}
      {active === "hybrid" && <HybridFusionDetailsScreen C={C} bundles={bundles} details={details} onSelect={onSelectSegment} />}
      {active === "annotations" && <AnnotationReviewDetailsScreen C={C} bundles={bundles} edits={edits} audit={audit} editAiEvent={editAiEvent} clinician={clinician} onSelect={onSelectSegment} />}
      {active === "report" && <ReportGenerationDetailsScreen C={C} bundles={bundles} details={details} jobId={jobId} fileName={fileName} onGoToReport={onGoToReport} />}
    </BackendDetailShell>
  </div>;
}

export { AiAnalysisDetailsScreen, RuleBasedDetailsScreen, HybridFusionDetailsScreen, AnnotationReviewDetailsScreen, ReportGenerationDetailsScreen, ReferenceDetailWorkbench };
