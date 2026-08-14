import { API, apiHeaders, fmtT, isoNow } from "../constants.js";
import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  HOOK: useAnnotations
// ─────────────────────────────────────────────────────────────────────────────
export function useAnnotations({ jobId }) {
  const [edits, setEdits] = useState({});
  const [audit, setAudit] = useState([]);

  const editAiEvent = useCallback(async (index, ev, status, label, note, clinician) => {
    const entry = { index, label, status, note, clinician, ts: isoNow() };
    setEdits(prev => ({ ...prev, [index]: entry }));
    setAudit(prev => [...prev, {
      action: `AI #${index} (${fmtT(ev.start)}→${fmtT(ev.end)}) → '${status}'`,
      label, note, clinician, ts: entry.ts, source: "ai_review" }]);
    if (!jobId) return true;
    try {
      const res = await fetch(`${API}/annotations/${jobId}`, {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(entry) });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (err) {
      setAudit(prev => [...prev, {
        action: "AI review save failed",
        label, note: err.message || "Network error", clinician, ts: isoNow(), source: "error" }]);
      return false;
    }
  }, [jobId]);

  const resetAnnotations = useCallback(() => {
    setEdits({}); setAudit([]);
  }, []);

  return { edits, audit, editAiEvent, resetAnnotations };
}
