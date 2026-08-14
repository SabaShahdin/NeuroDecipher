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
export default function AiPredictionsPage({ jobId, fileName, events, ruleEvents, edits, audit, editAiEvent, clinician, onBackDashboard, onOpenRecordings, onGoToReport, onOpenAnalysisPage }) {
  const { C } = useNdThemeTokens();
  return (
    <ReferenceDetailWorkbench
      C={C}
      active="ai"
      setActive={onOpenAnalysisPage}
      jobId={jobId}
      fileName={fileName}
      events={events}
      ruleEvents={ruleEvents}
      edits={edits}
      audit={audit}
      editAiEvent={editAiEvent}
      clinician={clinician}
      onBackDashboard={onBackDashboard}
      onOpenRecordings={onOpenRecordings}
      onGoToReport={onGoToReport}
      onSelectSegment={() => {}}
    />
  );
}
