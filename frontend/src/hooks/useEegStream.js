import { API, MAX_FRONTEND_UPLOAD_MB, apiHeaders, sseUrl } from "../constants.js";
import { clearInterpretabilityCache, prefetchInterpretability } from "../services/interpretabilityPrefetch.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STREAM_CACHE_KEY = "nd:lastPredictionSession:v2";
const STREAM_UI_BATCH_MS = Math.max(0, Number(import.meta.env.VITE_STREAM_UI_BATCH_MS ?? 0));


// ─────────────────────────────────────────────────────────────────────────────
// DEBUG HELPERS: prediction delivery tracing
// Toggle in browser console: window.ND_PRED_DEBUG = false
// ─────────────────────────────────────────────────────────────────────────────
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

  const count = indexes.length;
  const minIndex = count ? indexes[0] : null;
  const maxIndex = count ? indexes[count - 1] : null;
  const missingFromZeroToMax = [];

  if (maxIndex !== null) {
    const seen = new Set(indexes);
    for (let i = 0; i <= maxIndex; i += 1) {
      if (!seen.has(i)) missingFromZeroToMax.push(i);
      if (missingFromZeroToMax.length >= 80) break;
    }
  }

  return {
    count,
    minIndex,
    maxIndex,
    firstFive: indexes.slice(0, 5),
    lastFive: indexes.slice(-5),
    missingFromZeroToMax,
    missingCountShown: missingFromZeroToMax.length,
  };
}

function ndLog(tag, payload = {}) {
  if (!ndPredDebugEnabled()) return;
  try {
    console.log(tag, payload);
  } catch {}
}

function readCachedSession() {
  // Keep only lightweight metadata. Large EEG arrays/events must never be
  // serialized into localStorage because they can freeze the browser.
  try {
    const raw = window.localStorage.getItem(STREAM_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.jobId || !data?.fileName) return null;
    return {
      jobId: data.jobId,
      fileName: data.fileName || "",
      phase: data.phase || "idle",
      total: Number(data.total || 0),
    };
  } catch {
    return null;
  }
}

function writeCachedSession(payload) {
  try {
    if (!payload?.jobId) return;
    window.localStorage.setItem(STREAM_CACHE_KEY, JSON.stringify({
      jobId: payload.jobId,
      fileName: payload.fileName || "",
      phase: payload.phase || "ready",
      total: payload.total || 0,
      updatedAt: Date.now(),
    }));
  } catch {}
}

function clearCachedSession() {
  try { window.localStorage.removeItem(STREAM_CACHE_KEY); } catch {}
}
// ─────────────────────────────────────────────────────────────────────────────
//  HOOK: useEegStream  (upload + unified SSE)
// ─────────────────────────────────────────────────────────────────────────────
export function useEegStream() {
  const cached = readCachedSession();
  const eegSignalRef = useRef(null);
  const [eegMeta,    setEegMeta]    = useState(null);
  const [jobId,      setJobId]      = useState(() => cached?.jobId || null);
  const [fileName,   setFileName]   = useState(() => cached?.fileName || "");
  const [events,     setEvents]     = useState([]);     // AI predictions
  const [ruleEvents, setRuleEvents] = useState([]);     // Rule predictions (carries hybrid fields)
  const [phase,      setPhase]      = useState(() => cached?.phase || "idle");
  const [rulePhase,  setRulePhase]  = useState("idle");
  const [received,   setReceived]   = useState(0);
  const [total,      setTotal]      = useState(() => cached?.total || 0);
  const [errorMsg,   setErrorMsg]   = useState("");
  const esRef = useRef(null);
  const publishTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const interpretabilityPrefetchTimerRef = useRef(null);
  const interpretabilityPrefetchSignatureRef = useRef("");

  const storeEegSignal = useCallback((signal) => {
    if (!signal) {
      eegSignalRef.current = null;
      setEegMeta(null);
      return;
    }
    const safeSignal = {
      channels: Array.isArray(signal.channels) ? signal.channels : [],
      times: Array.isArray(signal.times) ? signal.times : [],
      data: Array.isArray(signal.data) ? signal.data : [],
      samplingRate: signal.samplingRate ?? 256,
      originalSamplingRate: signal.originalSamplingRate ?? signal.samplingRate ?? 256,
      displaySamplingRate: signal.displaySamplingRate ?? signal.samplingRate ?? 256,
      displayDownsampleStep: signal.displayDownsampleStep ?? 1,
      displaySampleCount: signal.displaySampleCount ?? (Array.isArray(signal.times) ? signal.times.length : 0),
      duration: signal.duration ?? (Array.isArray(signal.times) && signal.times.length ? signal.times[signal.times.length - 1] : 0),
    };
    // Keep the large EEG arrays out of React state. Components still receive an
    // eegData object, but the heavy buffers live in a ref so metadata changes do
    // not repeatedly serialize/copy large matrices through React state updates.
    eegSignalRef.current = safeSignal;
    setEegMeta({
      channelCount: safeSignal.channels.length,
      sampleCount: safeSignal.times.length,
      samplingRate: safeSignal.samplingRate,
      originalSamplingRate: safeSignal.originalSamplingRate,
      displaySamplingRate: safeSignal.displaySamplingRate,
      displayDownsampleStep: safeSignal.displayDownsampleStep,
      displaySampleCount: safeSignal.displaySampleCount,
      duration: safeSignal.duration ?? safeSignal.times.at?.(-1) ?? 0,
      updatedAt: Date.now(),
    });
  }, []);

  const eegData = useMemo(() => {
    if (!eegMeta || !eegSignalRef.current) return null;
    return { ...eegSignalRef.current, meta: eegMeta };
  }, [eegMeta]);

  useEffect(() => {
    if (!jobId || !fileName) return;
    writeCachedSession({ jobId, fileName, phase, total });
  }, [jobId, fileName, phase, total]);

  useEffect(() => () => {
    if (esRef.current) esRef.current.close();
    if (publishTimerRef.current) window.clearTimeout(publishTimerRef.current);
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    if (interpretabilityPrefetchTimerRef.current) window.clearTimeout(interpretabilityPrefetchTimerRef.current);
  }, []);

  const scheduleInterpretabilityPrefetch = useCallback((jid, aiCount = 0, ruleCount = 0, { force = false, reason = "live" } = {}) => {
    if (!jid || (aiCount + ruleCount <= 0 && !force)) return;
    const signature = `${jid}:${aiCount}:${ruleCount}:${reason}`;
    if (!force && interpretabilityPrefetchSignatureRef.current === signature) return;
    interpretabilityPrefetchSignatureRef.current = signature;
    if (interpretabilityPrefetchTimerRef.current) {
      window.clearTimeout(interpretabilityPrefetchTimerRef.current);
      interpretabilityPrefetchTimerRef.current = null;
    }
    const delay = force ? 80 : Math.max(250, Number(import.meta.env.VITE_INTERPRETABILITY_PREFETCH_DELAY_MS ?? 900));
    interpretabilityPrefetchTimerRef.current = window.setTimeout(() => {
      interpretabilityPrefetchTimerRef.current = null;
      prefetchInterpretability(jid, { force, reason });
    }, delay);
  }, []);

  const openStream = useCallback((jid, attempt = 0, existingAi = [], existingRule = []) => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    ndLog("[ND-PRED-SSE-OPENING]", {
      jobId: jid,
      attempt,
      existingAi: ndPredictionSummary(existingAi),
      existingRule: ndPredictionSummary(existingRule),
      url: sseUrl(`${API}/predictions/${jid}`),
    });

    const aiMap   = new Map(existingAi.map(ev => [`ai:${ev.index}`, ev]));
    const ruleMap = new Map(existingRule.map(ev => [`rule:${ev.index}`, ev]));
    let closedByServer = false;

    const sortByIndex = values => [...values].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    const mergeSnapshot = async (reason = "manual") => {
      try {
        const res = await fetch(`${API}/predictions/${encodeURIComponent(jid)}/snapshot`, {
          headers: apiHeaders(),
        });
        if (!res.ok) return false;
        const snap = await res.json().catch(() => null);
        if (!snap || snap.error) return false;

        const snapAi = Array.isArray(snap.events) ? snap.events : [];
        const snapRule = Array.isArray(snap.ruleEvents) ? snap.ruleEvents : [];

        snapAi.forEach((ev) => {
          if (ev?.type === "prediction" && ev?.index != null) aiMap.set(`ai:${ev.index}`, { ...ev });
        });
        snapRule.forEach((ev) => {
          if (ev?.type === "prediction" && ev?.index != null) ruleMap.set(`rule:${ev.index}`, { ...ev });
        });

        ndLog("[ND-PRED-SNAPSHOT-MERGE]", {
          jobId: jid,
          reason,
          snapshotAi: ndPredictionSummary(snapAi),
          snapshotRule: ndPredictionSummary(snapRule),
          mergedAi: ndPredictionSummary(sortByIndex(aiMap.values())),
          mergedRule: ndPredictionSummary(sortByIndex(ruleMap.values())),
        });
        publishNow();
        return true;
      } catch (error) {
        ndLog("[ND-PRED-SNAPSHOT-MERGE-FAILED]", {
          jobId: jid,
          reason,
          error: error?.message || String(error),
        });
        return false;
      }
    };

    const publishNow = () => {
      publishTimerRef.current = null;
      const aiList = sortByIndex(aiMap.values());
      const rbList = sortByIndex(ruleMap.values());
      setEvents(aiList);
      setRuleEvents(rbList);
      const maxIdx = Math.max(-1, ...aiList.map(e => e.index ?? -1), ...rbList.map(e => e.index ?? -1));
      setReceived(maxIdx + 1);
      ndLog("[ND-PRED-STATE-PUBLISH]", {
        jobId: jid,
        ai: ndPredictionSummary(aiList),
        rule: ndPredictionSummary(rbList),
        receivedWillBecome: maxIdx + 1,
        phaseWillRemain: phase,
      });
      scheduleInterpretabilityPrefetch(jid, aiList.length, rbList.length, { reason: "segment" });
    };
    const publish = () => {
      // Default is immediate display: backend emits segment -> frontend state updates.
      // Batching can be enabled with VITE_STREAM_UI_BATCH_MS if needed.
      if (STREAM_UI_BATCH_MS <= 0) {
        if (publishTimerRef.current) {
          window.clearTimeout(publishTimerRef.current);
          publishTimerRef.current = null;
        }
        publishNow();
        return;
      }
      if (publishTimerRef.current) return;
      publishTimerRef.current = window.setTimeout(publishNow, STREAM_UI_BATCH_MS);
    };

    const es = new EventSource(sseUrl(`${API}/predictions/${jid}`));
    esRef.current = es;

    es.onopen = () => {
      ndLog("[ND-PRED-SSE-OPEN]", { jobId: jid, attempt });
      if (attempt > 0) setErrorMsg("");
    };

    es.onmessage = ({ data: raw }) => {
      try {
        const msg = JSON.parse(raw);

        if (msg.type === "meta") {
          ndLog("[ND-PRED-SSE-META]", { jobId: jid, total: msg.total ?? 0, raw: msg });
          setTotal(msg.total ?? 0);
          setPhase("running");
          setRulePhase("running");
          return;
        }
        if (msg.type === "error") {
          ndLog("[ND-PRED-SSE-ERROR-MESSAGE]", { jobId: jid, raw: msg });
          closedByServer = true;
          setErrorMsg(msg.message || "Backend returned an analysis error.");
          setPhase("error"); setRulePhase("error");
          es.close(); return;
        }
        if (msg.type === "done") {
          closedByServer = true;
          ndLog("[ND-PRED-SSE-DONE]", {
            jobId: jid,
            backendTotal: msg.total ?? null,
            ai: ndPredictionSummary(sortByIndex(aiMap.values())),
            rule: ndPredictionSummary(sortByIndex(ruleMap.values())),
            raw: msg,
          });
          publish();
          setTotal(msg.total ?? Math.max(aiMap.size, ruleMap.size));
          setPhase("ready"); setRulePhase("ready");
          // Safety fill: if EventSource/browser missed any stream events, reload the
          // lightweight backend snapshot once at completion and merge it into state.
          mergeSnapshot("done").finally(() => {
            scheduleInterpretabilityPrefetch(jid, aiMap.size, ruleMap.size, { force: true, reason: "done" });
          });
          es.close(); return;
        }
        if (msg.type === "prediction") {
          if (msg.source === "ai") {
            aiMap.set(`ai:${msg.index}`, { ...msg });
            ndLog("[ND-PRED-AI-RECEIVED]", {
              jobId: jid,
              index: msg.index,
              start: msg.start,
              end: msg.end,
              label: msg.label,
              confidence: msg.confidence,
              ai_subtype: msg.ai_subtype,
              aiCountNow: aiMap.size,
              expectedMissingSoFar: ndPredictionSummary(sortByIndex(aiMap.values())).missingFromZeroToMax,
              raw: msg,
            });
            publish();
          } else if (msg.source === "rule") {
            ruleMap.set(`rule:${msg.index}`, {
              ...msg,
              rules:              msg.rules             ?? [],
              n_sz_rules:         msg.n_sz_rules        ?? 0,
              hybrid_confidence:  msg.hybrid_confidence ?? null,
              hybrid_label:       msg.hybrid_label      ?? null,
              alpha:              msg.alpha             ?? 0.5,
              ai_prob_used:       msg.ai_prob_used      ?? msg.ai_prob_used ?? null,
              rule_conf_used:     msg.rule_conf_used    ?? null,
              rule_subtype:       msg.rule_subtype       ?? null,
              rule_subtype_full:  msg.rule_subtype_full  ?? null,
              rule_subtype_confidence: msg.rule_subtype_confidence ?? null });
            ndLog("[ND-PRED-RULE-RECEIVED]", {
              jobId: jid,
              index: msg.index,
              start: msg.start,
              end: msg.end,
              label: msg.label,
              hybrid_label: msg.hybrid_label,
              confidence: msg.confidence,
              ruleCountNow: ruleMap.size,
              expectedMissingSoFar: ndPredictionSummary(sortByIndex(ruleMap.values())).missingFromZeroToMax,
              raw: msg,
            });
            publish();
          }
        }
      } catch(e) {
        console.error("[SSE parse]", e, raw);
        setErrorMsg("Received an unreadable server event. Check backend logs.");
      }
    };

    es.onerror = () => {
      ndLog("[ND-PRED-SSE-TRANSPORT-ERROR]", {
        jobId: jid,
        attempt,
        closedByServer,
        ai: ndPredictionSummary(sortByIndex(aiMap.values())),
        rule: ndPredictionSummary(sortByIndex(ruleMap.values())),
      });
      es.close();
      if (closedByServer) return;
      if (attempt < 3) {
        const wait = 800 * (attempt + 1);
        // Temporary SSE reconnects must not set the global frontend error.
        // Otherwise App.jsx resets the whole viewer even though the backend is still working.
        ndLog("[ND-PRED-SSE-RECONNECT-SCHEDULED]", {
          jobId: jid,
          nextAttempt: attempt + 1,
          waitMs: wait,
        });
        reconnectTimerRef.current = window.setTimeout(
          () => openStream(jid, attempt + 1, sortByIndex(aiMap.values()), sortByIndex(ruleMap.values())),
          wait
        );
        return;
      }
      setErrorMsg(`Cannot reach backend at ${API}. Check Flask server, CORS, and /predictions/${jid}.`);
      setPhase("error"); setRulePhase("error");
    };
  }, [scheduleInterpretabilityPrefetch]);

  const upload = useCallback(async (file) => {
    ndLog("[ND-PRED-UPLOAD-START]", {
      fileName: file?.name,
      sizeBytes: file?.size,
      sizeMb: file?.size ? Number((file.size / (1024 * 1024)).toFixed(2)) : null,
    });
    clearCachedSession();
    clearInterpretabilityCache();
    interpretabilityPrefetchSignatureRef.current = "";
    storeEegSignal(null); setEvents([]); setRuleEvents([]);
    setPhase("loading"); setRulePhase("idle");
    setReceived(0); setTotal(0); setErrorMsg("");
    setJobId(null); setFileName(file?.name ?? "");

    if (!file) {
      setErrorMsg("Please select an EEG file.");
      setPhase("error");
      return false;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "edf") {
      setErrorMsg("Unsupported file type. Please upload an .edf EEG file.");
      setPhase("error");
      return false;
    }

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_FRONTEND_UPLOAD_MB) {
      setErrorMsg(`File is ${sizeMb.toFixed(1)} MB. Maximum allowed size is ${MAX_FRONTEND_UPLOAD_MB} MB.`);
      setPhase("error");
      return false;
    }

        try {

      // 1. Get S3 presigned upload URL

      const presignRes = await fetch(`${API}/upload/presigned`, {
        method: "POST",
        headers: {
          ...apiHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || "application/octet-stream"
        })
      });


      const presign = await presignRes.json();

      if (!presignRes.ok || presign.error) {
        throw new Error(
          presign.error || "Could not create S3 upload URL"
        );
      }



      ndLog("[ND-S3-PRESIGNED-OK]", {
        s3Key: presign.s3Key
      });



      // 2. Upload directly to S3

      const s3Upload = await fetch(
        presign.uploadUrl,
        {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream"
          },
          body: file
        }
      );


      if (!s3Upload.ok) {
        throw new Error(
          `S3 upload failed HTTP ${s3Upload.status}`
        );
      }



      ndLog("[ND-S3-UPLOAD-COMPLETE]", {
        s3Key: presign.s3Key
      });



      // 3. Tell backend to start EEG processing

      const res = await fetch(`${API}/upload/start`, {
        method: "POST",
        headers: {
          ...apiHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          s3Key: presign.s3Key
        })
      });


      const result = await res.json();

      if (!res.ok || result.error) {
        throw new Error(
          result.error || `Upload start failed HTTP ${res.status}`
        );
      }
      storeEegSignal({
        channels:     result.channels ?? [],
        times:        result.times ?? [],
        data:         result.data ?? [],
        samplingRate: result.samplingRate ?? 256,
        originalSamplingRate: result.originalSamplingRate ?? result.samplingRate ?? 256,
        displaySamplingRate: result.displaySamplingRate ?? result.samplingRate ?? 256,
        displayDownsampleStep: result.displayDownsampleStep ?? 1,
        displaySampleCount: result.displaySampleCount ?? (Array.isArray(result.times) ? result.times.length : 0),
        duration: result.duration ?? (Array.isArray(result.times) && result.times.length ? result.times[result.times.length - 1] : 0) });
      setJobId(result.jobId);
      setFileName(result.fileName ?? file.name);
      ndLog("[ND-PRED-UPLOAD-OK]", {
        jobId: result.jobId,
        fileName: result.fileName ?? file.name,
        channels: (result.channels ?? []).length,
        samplesForViewer: Array.isArray(result.times) ? result.times.length : null,
        duration: result.duration,
        samplingRate: result.samplingRate,
        displaySamplingRate: result.displaySamplingRate,
      });
      setPhase("running");
      openStream(result.jobId);
      return true;
    } catch(err) {
      ndLog("[ND-PRED-UPLOAD-FAILED]", { fileName: file?.name, error: err?.message || String(err) });
      setErrorMsg(err.message || "Upload failed. Check backend logs.");
      setPhase("error");
      setRulePhase("error");
      return false;
    }
  }, [openStream, storeEegSignal]);

  const reset = useCallback(() => {
    ndLog("[ND-PRED-RESET]", { jobId, aiCount: events.length, ruleCount: ruleEvents.length, phase });
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    clearCachedSession();
    clearInterpretabilityCache();
    interpretabilityPrefetchSignatureRef.current = "";
    storeEegSignal(null); setEvents([]); setRuleEvents([]);
    setPhase("idle"); setRulePhase("idle");
    setReceived(0); setTotal(0); setErrorMsg("");
    setJobId(null); setFileName("");
  }, [storeEegSignal, jobId, events.length, ruleEvents.length, phase]);

  const loadExistingRecording = useCallback(async (jid) => {
    if (!jid) return false;
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setPhase("loading"); setRulePhase("loading"); setErrorMsg("");
    try {
      const res = await fetch(`${API}/recordings/${encodeURIComponent(jid)}/full`, { headers: apiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Could not load recording ${jid}`);
      storeEegSignal(data.signal || null);
      setJobId(jid);
      setFileName(data.job?.file_name || data.job?.recording_label || "Saved recording");
      const ai = Array.isArray(data.events) ? data.events : [];
      const rule = Array.isArray(data.ruleEvents) ? data.ruleEvents : [];
      setEvents(ai);
      setRuleEvents(rule);
      setReceived(Math.max(ai.length, rule.length));
      setTotal(Math.max(ai.length, rule.length));
      setPhase("ready");
      setRulePhase("ready");
      scheduleInterpretabilityPrefetch(jid, ai.length, rule.length, { force: true, reason: "saved-recording" });
      writeCachedSession({ jobId: jid, fileName: data.job?.file_name || data.job?.recording_label || "Saved recording", phase: "ready", total: Math.max(ai.length, rule.length) });
      return true;
    } catch (err) {
      setErrorMsg(err.message || "Could not reopen the saved recording.");
      setPhase("error");
      setRulePhase("error");
      return false;
    }
  }, [storeEegSignal, scheduleInterpretabilityPrefetch]);

  const clearError = useCallback(() => {
    setErrorMsg("");
    if (phase === "error") setPhase("idle");
    if (rulePhase === "error") setRulePhase("idle");
  }, [phase, rulePhase]);

  return {
    eegData, jobId, fileName,
    events, ruleEvents,
    phase, rulePhase,
    received, total, errorMsg,
    upload, reset, loadExistingRecording, clearError };
}

