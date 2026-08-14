import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { API, apiHeaders, fmtT, WIN_OPTS, CH_H, PLOTLY_MARGIN } from "../../../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "../../utils.js";

function useBackendAnalysisDetails(jobId, fallbackEvents = [], fallbackRuleEvents = [], fallbackAudit = []) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!jobId) { setDetails(null); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/analysis/${encodeURIComponent(jobId)}/details`, { headers: apiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Analysis details failed with HTTP ${res.status}`);
      setDetails(data);
    } catch (err) {
      setError(err.message || "Could not load backend analysis details.");
      setDetails(null);
    } finally { setLoading(false); }
  }, [jobId]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    // Refresh backend analysis JSON as live prediction rows arrive.
    // This keeps Page 6 plots populated without showing backend PNG debug files.
    if (!jobId) return;
    const n = (fallbackEvents?.length || 0) + (fallbackRuleEvents?.length || 0);
    if (n <= 0) return;
    const timer = window.setTimeout(() => reload(), 900);
    return () => window.clearTimeout(timer);
  }, [jobId, fallbackEvents?.length, fallbackRuleEvents?.length, reload]);
  return {
    details: details || {
      job: { jobId }, events: fallbackEvents, ruleEvents: fallbackRuleEvents, annotations: fallbackAudit,
      summary: {}, charts: {}, source: "frontend-live-fallback"
    }, loading, error, reload };
}

export default useBackendAnalysisDetails;
export { useBackendAnalysisDetails };
