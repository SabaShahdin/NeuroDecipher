import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CH_COLORS, GLOBAL_STYLE } from "./constants.js";
import { useEegStream } from "./hooks/useEegStream.js";
import { usePlayback } from "./hooks/usePlayback.js";
import { useAnnotations } from "./hooks/useAnnotations.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import SystemErrorModal from "./features/app/SystemErrorModal.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import RecordingManagementPage from "./pages/RecordingManagementPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";
import ProcessingPage from "./pages/ProcessingPage.jsx";
import LivePredictionPage from "./pages/LivePredictionPage.jsx";
import InterpretabilityPage from "./pages/InterpretabilityPage.jsx";
import AnnotationsPage from "./pages/AnnotationsPage.jsx";
import ReportPage from "./pages/ReportPage.jsx";

const PAGES = {
  DASHBOARD: "dashboard",
  RECORDINGS: "recordings",
  UPLOAD: "upload",
  PROCESSING: "processing",
  LIVE: "live",
  INTERPRETABILITY: "interpretability",
  ANNOTATIONS: "annotations",
  REPORT: "report",
  PDF_REPORT: "pdfReport" };

const ERROR_REDIRECT_MS = 5000;
const LIVE_SEGMENT_ANIMATION_MS = Math.max(60, Number(import.meta.env.VITE_LIVE_SEGMENT_ANIMATION_MS ?? 180));


function ndPredDebugEnabled() {
  try {
    return window.ND_PRED_DEBUG !== false;
  } catch {
    return true;
  }
}

function ndPredictionSummary(list = []) {
  const indexes = (Array.isArray(list) ? list : [])
    .map((ev) => Number(ev?.index))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  const maxIndex = indexes.length ? indexes[indexes.length - 1] : null;
  const missingFromZeroToMax = [];
  if (maxIndex !== null) {
    const seen = new Set(indexes);
    for (let i = 0; i <= maxIndex; i += 1) {
      if (!seen.has(i)) missingFromZeroToMax.push(i);
      if (missingFromZeroToMax.length >= 80) break;
    }
  }
  return {
    count: indexes.length,
    minIndex: indexes.length ? indexes[0] : null,
    maxIndex,
    firstFive: indexes.slice(0, 5),
    lastFive: indexes.slice(-5),
    missingFromZeroToMax,
  };
}

function ndLog(tag, payload = {}) {
  if (!ndPredDebugEnabled()) return;
  try { console.log(tag, payload); } catch {}
}

function getSegmentCount(aiEvents = [], ruleEvents = []) {
  const maxIndex = Math.max(
    -1,
    ...aiEvents.map((ev) => Number(ev?.index ?? -1)),
    ...ruleEvents.map((ev) => Number(ev?.index ?? -1)),
  );
  return maxIndex + 1;
}

function filterEventsByVisibleSegment(list = [], visibleSegments = 0) {
  if (!Number.isFinite(visibleSegments)) return list;
  return list.filter((ev) => Number(ev?.index ?? -1) < visibleSegments);
}

function normaliseFrontendErrorMessage(value) {
  if (!value) return "An unexpected frontend error occurred.";
  if (typeof value === "string") return value;
  if (value?.message) return value.message;
  if (value?.error) return value.error;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export default function NeuroDecipher() {
  const [page, setPage] = useState(PAGES.DASHBOARD);

  // Viewer controls
  const [windowSize, setWindowSize] = useState(10);
  const [gain,       setGain]       = useState(50);
  const [selectedCh, setSelectedCh] = useState(null);
  const [clinician,  setClinician]  = useState("Dr. Unknown");
  const [tool,       setTool]       = useState("select");

  // EEG stream — unified SSE (AI + Rule events in one connection)
  const {
    eegData, jobId, fileName,
    events,      // AI predictions   (source === "ai")
    ruleEvents,  // Rule predictions (source === "rule") — carry hybrid fields
    phase, rulePhase,
    received, total, errorMsg,
    upload, reset, loadExistingRecording, clearError } = useEegStream();

  const [systemErrorBox, setSystemErrorBox] = useState(null);
  const [visibleLiveSegments, setVisibleLiveSegments] = useState(0);
  const liveAnimationTimerRef = useRef(null);
  const currentAnimationJobRef = useRef(null);
  const dashboardRedirectTimerRef = useRef(null);

  const clearDashboardRedirectTimer = useCallback(() => {
    if (dashboardRedirectTimerRef.current) {
      clearTimeout(dashboardRedirectTimerRef.current);
      dashboardRedirectTimerRef.current = null;
    }
  }, []);

  const clearLiveAnimationTimer = useCallback(() => {
    if (liveAnimationTimerRef.current) {
      clearTimeout(liveAnimationTimerRef.current);
      liveAnimationTimerRef.current = null;
    }
  }, []);

  const showSystemError = useCallback((errorLike) => {
    const message = normaliseFrontendErrorMessage(errorLike);
    clearDashboardRedirectTimer();
    try { reset?.(); } catch {}
    setVisibleLiveSegments(0);
    currentAnimationJobRef.current = null;
    setSystemErrorBox({
      message,
      startedAt: Date.now(),
      redirectMs: ERROR_REDIRECT_MS
    });
    dashboardRedirectTimerRef.current = setTimeout(() => {
      setPage(PAGES.DASHBOARD);
      setSystemErrorBox(null);
      clearError?.();
      clearDashboardRedirectTimer();
    }, ERROR_REDIRECT_MS);
  }, [clearDashboardRedirectTimer, clearError, reset]);

  useEffect(() => {
    if (!errorMsg) return;
    showSystemError(errorMsg);
  }, [errorMsg, showSystemError]);

  useEffect(() => {
    const dispatchFrontendError = (message, extra = {}) => {
      window.dispatchEvent(new CustomEvent("nd:frontend-error", {
        detail: { message: normaliseFrontendErrorMessage(message), ...extra }
      }));
    };

    const onFrontendError = (event) => {
      showSystemError(event?.detail?.message || event?.message || "A frontend error occurred.");
    };
    const onUnhandledError = (event) => {
      showSystemError(event?.error || event?.message || "A frontend script error occurred.");
    };
    const onUnhandledRejection = (event) => {
      showSystemError(event?.reason || "A frontend async error occurred.");
    };

    window.addEventListener("nd:frontend-error", onFrontendError);
    window.addEventListener("error", onUnhandledError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    const originalFetch = window.fetch?.bind(window);
    if (originalFetch && !window.__ND_FETCH_ERROR_PATCHED__) {
      window.__ND_FETCH_ERROR_PATCHED__ = true;
      window.fetch = async (...args) => {
        const options = args?.[1] || {};
        const headers = options?.headers || {};
        const isSilentPrefetch =
          headers?.["X-ND-Background-Prefetch"] === "1" ||
          headers?.["x-nd-background-prefetch"] === "1" ||
          (typeof headers.get === "function" && headers.get("X-ND-Background-Prefetch") === "1");
        try {
          const response = await originalFetch(...args);
          if (!response.ok && !isSilentPrefetch) {
            let backendMessage = `Request failed with HTTP ${response.status}`;
            try {
              const clone = response.clone();
              const contentType = clone.headers.get("content-type") || "";
              if (contentType.includes("application/json")) {
                const body = await clone.json();
                backendMessage = body?.message || body?.error || backendMessage;
              } else {
                const text = await clone.text();
                if (text) backendMessage = text.slice(0, 700);
              }
            } catch {}
            dispatchFrontendError(backendMessage, { status: response.status });
          }
          return response;
        } catch (error) {
          if (!isSilentPrefetch) {
            dispatchFrontendError(error?.message || "Network request failed. Please check the backend server.");
          }
          throw error;
        }
      };
    }

    return () => {
      window.removeEventListener("nd:frontend-error", onFrontendError);
      window.removeEventListener("error", onUnhandledError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      clearDashboardRedirectTimer();
      clearLiveAnimationTimer();
    };
  }, [showSystemError, clearDashboardRedirectTimer, clearLiveAnimationTimer]);

  const dismissSystemError = useCallback(() => {
    clearDashboardRedirectTimer();
    try { reset?.(); } catch {}
    setVisibleLiveSegments(0);
    currentAnimationJobRef.current = null;
    setSystemErrorBox(null);
    setPage(PAGES.DASHBOARD);
    clearError?.();
  }, [clearDashboardRedirectTimer, clearError, reset]);

  const channels = eegData?.channels ?? [];
  const times    = eegData?.times    ?? [];
  const totalDur = times.length > 0 ? times[times.length - 1] : 0;
  const sr       = eegData?.samplingRate ?? 256;

  const colorMap = useMemo(
    () => channels.reduce((m, ch, i) => { m[ch] = CH_COLORS[i % CH_COLORS.length]; return m; }, {}),
    [channels],
  );

  const { timeOffset, setTimeOffset, isPlaying, togglePlay, jumpTo } =
    usePlayback({ totalDur, windowSize });

  const {
    edits, audit, editAiEvent, resetAnnotations } = useAnnotations({ jobId });

  const totalLiveSegments = useMemo(() => getSegmentCount(events, ruleEvents), [events, ruleEvents]);
  // IMPORTANT FINAL BEHAVIOUR:
  // Do not hide backend predictions behind a frontend animation counter.
  // The hook only contains predictions already received from backend SSE, so passing
  // these arrays directly means: backend produces segment -> frontend displays it.
  const animatedEvents = events;
  const animatedRuleEvents = ruleEvents;

  useEffect(() => {
    ndLog("[ND-PRED-UI-STATE]", {
      jobId,
      page,
      phase,
      rulePhase,
      total,
      received,
      visibleLiveSegments,
      totalLiveSegments,
      aiFromHook: ndPredictionSummary(events),
      ruleFromHook: ndPredictionSummary(ruleEvents),
      aiDisplayed: ndPredictionSummary(animatedEvents),
      ruleDisplayed: ndPredictionSummary(animatedRuleEvents),
    });
  }, [jobId, page, phase, rulePhase, total, received, visibleLiveSegments, totalLiveSegments, events, ruleEvents, animatedEvents, animatedRuleEvents]);

  useEffect(() => {
    // Keep this counter only for console/debug information. It must not control
    // whether prediction segments are shown. Every segment received from backend
    // is displayed immediately in the viewer/timeline.
    if (!jobId || totalLiveSegments <= 0) {
      ndLog("[ND-PRED-DISPLAY-IDLE]", { jobId, totalLiveSegments });
      setVisibleLiveSegments(0);
      currentAnimationJobRef.current = jobId || null;
      clearLiveAnimationTimer();
      return;
    }

    if (currentAnimationJobRef.current !== jobId) {
      ndLog("[ND-PRED-DISPLAY-NEW-JOB]", {
        previousJobId: currentAnimationJobRef.current,
        jobId,
        totalLiveSegments,
      });
      currentAnimationJobRef.current = jobId;
    }

    clearLiveAnimationTimer();
    if (visibleLiveSegments !== totalLiveSegments) {
      ndLog("[ND-PRED-DISPLAY-SYNC]", {
        jobId,
        previousVisible: visibleLiveSegments,
        nextVisible: totalLiveSegments,
      });
      setVisibleLiveSegments(totalLiveSegments);
    }
  }, [jobId, totalLiveSegments, visibleLiveSegments, clearLiveAnimationTimer]);

  // Auto-advance to processing page on upload
  const handleUpload = async file => {
    if (!file) return;
    ndLog("[ND-PRED-UI-UPLOAD]", { fileName: file?.name, sizeBytes: file?.size });
    resetAnnotations();
    setVisibleLiveSegments(0);
    currentAnimationJobRef.current = null;
    setTimeOffset(0);
    setSelectedCh(null);
    setTool("select");
    const ok = await upload(file);
    if (ok) {
      // Open the live viewer immediately. It shows the loaded signal and waits
      // for the first SSE prediction, then renders AI/Rule/Hybrid segment by segment.
      setPage(PAGES.LIVE);
    }
  };

  // Toolbar file input handler
  const handleToolbarUpload = e => {
    const file = e.target.files[0];
    if (file) handleUpload(file);
  };

  // Jump to review on first prediction
  useEffect(() => {
    if ((events.length > 0 || ruleEvents.length > 0) && page === PAGES.PROCESSING) setPage(PAGES.LIVE);
  }, [events.length, ruleEvents.length, page]);

  useEffect(() => {
    if (phase === "ready" && page === PAGES.PROCESSING) {
      const t = setTimeout(() => setPage(PAGES.LIVE), 400);
      return () => clearTimeout(t);
    }
  }, [phase, page]);

  // Live-follow: auto-scroll to latest segment
  const liveFollowRef  = useRef(true);
  const lastEventCount = useRef(0);

  useEffect(() => {
    if (phase === "loading") { liveFollowRef.current = true; lastEventCount.current = 0; }
  }, [phase]);

  const handleJumpTo = useCallback(t => {
    liveFollowRef.current = false;
    jumpTo(t);
  }, [jumpTo]);

  useEffect(() => {
    if (!liveFollowRef.current || animatedEvents.length === 0) return;
    if (animatedEvents.length === lastEventCount.current) return;
    lastEventCount.current = animatedEvents.length;
    const latest   = animatedEvents[animatedEvents.length - 1];
    const mid      = (latest.start + latest.end) / 2;
    const maxOff   = Math.max(0, (eegData?.times?.at(-1) ?? 0) - windowSize);
    setTimeOffset(Math.min(Math.max(mid - windowSize / 2, 0), maxOff));
  }, [animatedEvents, windowSize, eegData, setTimeOffset]);

  const handleNewFile = () => {
    ndLog("[ND-PRED-UI-NEW-FILE]", { jobId, ai: ndPredictionSummary(events), rule: ndPredictionSummary(ruleEvents) });
    reset?.();
    resetAnnotations?.();
    setVisibleLiveSegments(0);
    currentAnimationJobRef.current = null;
    setTimeOffset(0);
    setSelectedCh(null);
    setTool("select");
    setPage(PAGES.UPLOAD);
  };


  const handleOpenSavedRecording = async (jid) => {
    resetAnnotations?.();
    setVisibleLiveSegments(0);
    currentAnimationJobRef.current = null;
    setTimeOffset(0);
    setSelectedCh(null);
    setTool("select");
    const ok = await loadExistingRecording?.(jid);
    if (ok) setPage(PAGES.LIVE);
  };

  const openAnalysisPage = useCallback((target = "live") => {
    if (target === "live" && !eegData && !jobId) {
      setPage(PAGES.UPLOAD);
      return;
    }
    const pageMap = {
      live: PAGES.LIVE,
      ai: PAGES.INTERPRETABILITY,
      rule: PAGES.INTERPRETABILITY,
      hybrid: PAGES.INTERPRETABILITY,
      interpretability: PAGES.INTERPRETABILITY,
      annotations: PAGES.ANNOTATIONS,
      report: PAGES.ANNOTATIONS,
      dashboard: PAGES.DASHBOARD,
      recordings: PAGES.RECORDINGS };
    setPage(pageMap[target] || PAGES.LIVE);
  }, [eegData, jobId]);

  return (
    <ErrorBoundary onError={showSystemError}>
      <style>{GLOBAL_STYLE}</style>

      <SystemErrorModal error={systemErrorBox} onDashboardNow={dismissSystemError} />

      {page === PAGES.DASHBOARD && (
        <DashboardPage
          user={{ name: "Clinical User", role: "Clinician" }}
          onStartAnalysis={() => setPage(PAGES.UPLOAD)}
          onOpenRecordings={() => setPage(PAGES.RECORDINGS)}
          onOpenLive={() => openAnalysisPage("live")}
          onOpenAi={() => openAnalysisPage("ai")}
          onOpenRule={() => openAnalysisPage("rule")}
          onOpenHybrid={() => openAnalysisPage("hybrid")}
          onOpenAnnotations={() => openAnalysisPage("annotations")}
          onOpenReport={() => openAnalysisPage("annotations")}
          onOpenReview={() => openAnalysisPage("live")}
          onOpenRecording={handleOpenSavedRecording}
        />
      )}

      {page === PAGES.RECORDINGS && (
        <RecordingManagementPage
          user={{ name: "Clinical User", role: "Clinician" }}
          onBackDashboard={() => setPage(PAGES.DASHBOARD)}
          onStartAnalysis={() => setPage(PAGES.UPLOAD)}
          onOpenLive={() => openAnalysisPage("live")}
          onOpenAi={() => openAnalysisPage("ai")}
          onOpenRule={() => openAnalysisPage("rule")}
          onOpenHybrid={() => openAnalysisPage("hybrid")}
          onOpenAnnotations={() => openAnalysisPage("annotations")}
          onOpenReport={() => openAnalysisPage("annotations")}
          onOpenRecording={handleOpenSavedRecording}
        />
      )}

      {page === PAGES.UPLOAD && (
        <UploadPage
          phase={phase}
          errorMsg={errorMsg}
          onUpload={handleUpload}
          onBackDashboard={() => setPage(PAGES.DASHBOARD)}
          onOpenRecordings={() => setPage(PAGES.RECORDINGS)}
        />
      )}

      {page === PAGES.PROCESSING && (
        <ProcessingPage
          fileName={fileName} phase={phase}
          received={received} total={total}
          events={events} eegData={eegData}
        />
      )}

      {page === PAGES.LIVE && (
        <LivePredictionPage
          eegData={eegData} channels={channels}
          totalDur={totalDur} sr={sr} colorMap={colorMap}
          events={animatedEvents} ruleEvents={animatedRuleEvents} edits={edits} audit={audit}
          timeOffset={timeOffset} setTimeOffset={setTimeOffset}
          isPlaying={isPlaying} togglePlay={togglePlay} jumpTo={handleJumpTo}
          windowSize={windowSize} setWindowSize={setWindowSize}
          gain={gain} setGain={setGain}
          tool={tool} setTool={setTool}
          selectedCh={selectedCh} setSelectedCh={setSelectedCh}
          clinician={clinician} setClinician={setClinician}
          editAiEvent={editAiEvent}
          phase={phase} rulePhase={rulePhase}
          fileName={fileName} errorMsg={errorMsg} jobId={jobId}
          onGoToReport={() => setPage(PAGES.ANNOTATIONS)}
          onUpload={handleNewFile}
          onUploadFile={handleNewFile}
          onBackDashboard={() => setPage(PAGES.DASHBOARD)}
          onOpenRecordings={() => setPage(PAGES.RECORDINGS)}
          onOpenAnalysisPage={openAnalysisPage}
          interpretabilityEnabled={events.length > 0 || ruleEvents.length > 0 || phase === "ready"}
        />
      )}

      {page === PAGES.INTERPRETABILITY && (
        <InterpretabilityPage
          jobId={jobId}
          fileName={fileName}
          eegData={eegData}
          events={events}
          ruleEvents={ruleEvents}
          edits={edits}
          colorMap={colorMap}
          onBackDashboard={() => setPage(PAGES.DASHBOARD)}
          onOpenRecordings={() => setPage(PAGES.RECORDINGS)}
          onGoToReport={() => setPage(PAGES.ANNOTATIONS)}
          onOpenAnalysisPage={openAnalysisPage}
          interpretabilityEnabled={events.length > 0 || ruleEvents.length > 0 || phase === "ready"}
        />
      )}

      {page === PAGES.ANNOTATIONS && (
        <AnnotationsPage jobId={jobId} fileName={fileName} events={events} ruleEvents={ruleEvents} edits={edits} audit={audit} editAiEvent={editAiEvent} clinician={clinician} onBackDashboard={() => setPage(PAGES.DASHBOARD)} onOpenRecordings={() => setPage(PAGES.RECORDINGS)} onGoToReport={() => setPage(PAGES.ANNOTATIONS)} onOpenAnalysisPage={openAnalysisPage} />
      )}

      {page === PAGES.REPORT && (
        <AnnotationsPage jobId={jobId} fileName={fileName} onBackDashboard={() => setPage(PAGES.DASHBOARD)} onOpenRecordings={() => setPage(PAGES.RECORDINGS)} onGoToReport={() => setPage(PAGES.ANNOTATIONS)} onOpenAnalysisPage={openAnalysisPage} />
      )}

      {page === PAGES.PDF_REPORT && (
        <ReportPage
          fileName={fileName} clinician={clinician}
          events={events} edits={edits} audit={audit}
          eegData={eegData} jobId={jobId}
          ruleEvents={ruleEvents}
          onBackToReview={() => setPage(PAGES.ANNOTATIONS)}
          onNewFile={handleNewFile}
        />
      )}
    </ErrorBoundary>
  );
}
