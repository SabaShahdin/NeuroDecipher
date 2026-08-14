import { API, apiHeaders } from "../constants.js";

const INTERPRETABILITY_CACHE_TTL_MS = 10 * 60 * 1000;
const PREFETCH_THROTTLE_MS = Math.max(250, Number(import.meta.env.VITE_INTERPRETABILITY_PREFETCH_MS ?? 1200));

const lastPrefetchAt = new Map();
const inFlight = new Map();

export const getInterpretabilityCacheKey = (jobId) =>
  jobId ? `neurodecipher:interpretability:${jobId}` : null;

export function readInterpretabilityCache(jobId) {
  const key = getInterpretabilityCacheKey(jobId);
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || Date.now() - Number(parsed.savedAt || 0) > INTERPRETABILITY_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeInterpretabilityCache(jobId, data) {
  const key = getInterpretabilityCacheKey(jobId);
  if (!key || typeof window === "undefined" || !data) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Ignore storage quota/private mode issues.
  }
}

export function clearInterpretabilityCache(jobId) {
  if (typeof window === "undefined") return;
  try {
    if (jobId) {
      const key = getInterpretabilityCacheKey(jobId);
      if (key) window.sessionStorage.removeItem(key);
      lastPrefetchAt.delete(jobId);
      return;
    }
    for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith("neurodecipher:interpretability:")) {
        window.sessionStorage.removeItem(key);
      }
    }
    lastPrefetchAt.clear();
  } catch {}
}

export async function prefetchInterpretability(jobId, { force = false, reason = "background" } = {}) {
  if (!jobId || typeof window === "undefined") return null;

  const now = Date.now();
  const last = Number(lastPrefetchAt.get(jobId) || 0);
  if (!force && now - last < PREFETCH_THROTTLE_MS) return readInterpretabilityCache(jobId);
  if (inFlight.has(jobId)) return inFlight.get(jobId);

  const request = (async () => {
    try {
      lastPrefetchAt.set(jobId, Date.now());
      const res = await fetch(`${API}/analysis/${encodeURIComponent(jobId)}/interpretability?prefetch=1`, {
        // No custom header here. Custom headers trigger CORS preflight and can
        // block live prediction display in development if backend headers differ.
        headers: apiHeaders(),
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (json && !json.error) {
        writeInterpretabilityCache(jobId, json);
        window.dispatchEvent(new CustomEvent("nd:interpretability-prefetched", {
          detail: { jobId, reason, segments: json?.segments?.length || 0 }
        }));
        return json;
      }
    } catch (error) {
      // Background warm-up must never interrupt live prediction or show a system error.
      console.debug?.("[interpretability prefetch] skipped", reason, error);
    } finally {
      inFlight.delete(jobId);
    }
    return null;
  })();

  inFlight.set(jobId, request);
  return request;
}
