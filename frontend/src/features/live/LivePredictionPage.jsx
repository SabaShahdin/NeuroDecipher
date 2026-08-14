import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API, T, CH_COLORS, GLOBAL_STYLE, apiHeaders, fmtT } from "../../constants.js";
import { useNdThemeTokens } from "../../hooks/useNdTheme.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "../../components/utils.js";
import StatusDot from "../../components/StatusDot.jsx";
import ChannelPanel from "../../components/ChannelPanel.jsx";
import Toolbar from "../../components/Toolbar.jsx";
import EegViewer from "../../components/EegViewer.jsx";
import TimelineStrip from "../../components/TimelineStrip.jsx";
import RawSignalPanel from "../../components/RawSignalPanel.jsx";
import StatusBar from "../../components/StatusBar.jsx";
import RightPanel from "../../components/RightPanel.jsx";
import QuickInterpretabilityPanel from "../../components/QuickInterpretabilityPanel.jsx";
import InterpretabilityOverlay from "../../components/InterpretabilityOverlay.jsx";
import ReviewEditModal from "../../components/ReviewEditModal.jsx";
import { StatusBadge, SubtypeBadge, HybridBadge } from "../../components/badges.jsx";
import { ReferenceDetailWorkbench } from "../../components/reference/AnalysisScreens.jsx";
import { ReferenceAnalysisNav } from "../../components/reference/ReferenceAnalysisNav.jsx";
import { ReferenceViewerHeader, ReferenceChannelRail, ReferenceEegCanvas, ReferenceTimelineStack, ReferenceEnginePanels } from "../../components/reference/ReferenceComponents.jsx";
import { LiveUploadFirstPanel, NoticeModal } from "./components/LivePredictionPanels.jsx";
export default function LivePredictionPage({
  eegData, channels, totalDur, sr, colorMap,
  events, ruleEvents, edits, audit,
  timeOffset, setTimeOffset, isPlaying, togglePlay, jumpTo,
  windowSize, setWindowSize, gain, setGain,
  tool, setTool, selectedCh, setSelectedCh,
  clinician, setClinician,
  editAiEvent, phase, fileName, errorMsg, jobId,
  rulePhase, onGoToReport, onUpload, onUploadFile, onBackDashboard, onOpenRecordings, onOpenAnalysisPage, interpretabilityEnabled = false }) {
  const { theme, setTheme, C } = useNdThemeTokens();
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(null);
  const bundles = useMemo(() => buildSegmentBundles(events, ruleEvents, edits), [events, ruleEvents, edits]);
  const handleSelectSegment = useCallback((idx, start = null) => {
    setSelectedSegmentIndex(idx);
    if (Number.isFinite(Number(start))) jumpTo(Math.max(0, Number(start) - 0.5));
  }, [jumpTo]);
  useEffect(() => {
    if (bundles.length === 0) { setSelectedSegmentIndex(null); return; }
    if (selectedSegmentIndex == null || !bundles.some(b => b.index === selectedSegmentIndex)) setSelectedSegmentIndex(bundles[bundles.length - 1].index);
  }, [bundles, selectedSegmentIndex]);
  const waitingForFirstPrediction = eegData && phase === "running" && events.length === 0 && ruleEvents.length === 0;
  const resetView = () => { setSelectedCh(null); jumpTo(0); };

  if (!eegData && !jobId) {
    return (
      <LiveUploadFirstPanel
        C={C}
        phase={phase}
        errorMsg={errorMsg}
        onUploadFile={onUploadFile}
        onBackDashboard={onBackDashboard}
        onOpenRecordings={onOpenRecordings}
      />
    );
  }

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Roboto', Arial, sans-serif",
      color: C.text,
      background: C.dark ? "linear-gradient(135deg,#040B14 0%,#071523 58%,#05101D 100%)" : "linear-gradient(135deg,#F8FAFC 0%,#EAF4FF 58%,#F8FAFC 100%)",
      overflow: "hidden",
      padding: 8 }}>
      <div style={{ position: "absolute", inset: 0, opacity: C.dark ? .22 : .13, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(120,160,190,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(120,160,190,.12) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <div style={{ position: "relative", zIndex: 1, height: "100%", minWidth: 1120, display: "grid", gridTemplateRows: "minmax(0,1fr) auto", gap: 6, overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ minHeight: 0, display: "flex", gap: 8, overflow: "hidden" }}>
          <ReferenceAnalysisNav C={C} active="live" setActive={onOpenAnalysisPage} onBackDashboard={onBackDashboard} onOpenRecordings={onOpenRecordings} onGoToReport={onGoToReport} interpretabilityDisabled={!interpretabilityEnabled} theme={theme} setTheme={setTheme} />
          <section style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateRows: "auto minmax(0,1fr)", overflow: "hidden", borderRadius: 10 }}>
            <ReferenceViewerHeader C={C} fileName={fileName} totalDur={totalDur} windowSize={windowSize} setWindowSize={setWindowSize} gain={gain} setGain={setGain} onUpload={onUpload} theme={theme} setTheme={setTheme} errorMsg={errorMsg} onResetView={resetView} isPlaying={isPlaying} togglePlay={togglePlay} jumpTo={jumpTo} timeOffset={timeOffset} />
            <div style={{ minHeight: 0, display: "flex", border: `1px solid ${C.border}`, overflow: "hidden", background: C.panel, borderRadius: "0 0 10px 10px" }}>
              <ReferenceChannelRail C={C} channels={channels} colorMap={colorMap} selectedCh={selectedCh} setSelectedCh={setSelectedCh} resetView={resetView} />
              <main style={{ flex: "1 1 auto", minWidth: 480, display: "grid", gridTemplateRows: "minmax(330px,1fr) auto auto", gap: 8, padding: 8, position: "relative", background: C.panel, overflow: "hidden" }}>
                <ReferenceEegCanvas C={C} eegData={eegData} colorMap={colorMap} selectedCh={selectedCh} events={events} ruleEvents={ruleEvents} edits={edits} timeOffset={timeOffset} windowSize={windowSize} gain={gain} selectedSegmentIndex={selectedSegmentIndex} onSelectSegment={handleSelectSegment} />
                <ReferenceTimelineStack
  C={C}
  eegData={eegData}
  colorMap={colorMap}
  selectedCh={selectedCh}
  events={events}
  ruleEvents={ruleEvents}
  edits={edits}
  totalDur={totalDur}
  timeOffset={timeOffset}
  windowSize={windowSize}
  selectedSegmentIndex={selectedSegmentIndex}
  onSelectSegment={handleSelectSegment}
  onSeek={jumpTo}
/>
                {waitingForFirstPrediction && <div style={{ position: "absolute", inset: "54px 24px 236px 24px", display: "grid", placeItems: "center", pointerEvents: "none" }}>
                  <div style={{ border: `1px solid ${hexToRgba(C.blue,.5)}`, background: C.dark ? "rgba(6,18,31,.90)" : "rgba(255,255,255,.90)", backdropFilter: "blur(10px)", borderRadius: 14, padding: "18px 22px", color: C.text, boxShadow: "0 18px 54px rgba(0,0,0,.20)", textAlign: "center" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${hexToRgba(C.blue,.28)}`, borderTopColor: C.blue, margin: "0 auto 10px", animation: "spin 1s linear infinite" }} />
                    <div style={{ fontWeight: 950, fontSize: 13 }}>Backend analysis is running</div>
                    <div style={{ color: C.muted, fontSize: 10.5, marginTop: 5 }}>Waiting for the first AI / Rule / Hybrid segment…</div>
                  </div>
                </div>}
              </main>
              <ReferenceEnginePanels C={C} events={events} ruleEvents={ruleEvents} edits={edits} currentTime={timeOffset} windowSize={windowSize} selectedSegmentIndex={selectedSegmentIndex} onSelectSegment={handleSelectSegment} onJump={jumpTo} onGoToReport={onGoToReport} phase={phase} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}


