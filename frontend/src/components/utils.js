import React from "react";
function pct(v, fallback = "—") {
  if (v == null || Number.isNaN(Number(v))) return fallback;
  const n = Number(v);
  return `${Math.round((n <= 1 ? n * 100 : n))}%`;
}

function asPctNumber(v) {
  if (v == null || Number.isNaN(Number(v))) return 0;
  const n = Number(v);
  return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
}

function displayLabel(label, subtype, subtypeFull) {
  const raw = (label || "pending").toLowerCase();
  const st = String(subtypeFull || subtype || label || "").replace(/_/g, " ").toLowerCase();
  if (raw === "seizure" || ["gnsz", "fnsz", "cpsz"].includes(raw)) {
    if (st.includes("complex partial") || st.includes("cpsz") || raw === "cpsz") return "Complex Partial Seizure";
    if (st.includes("focal") || st.includes("fnsz") || raw === "fnsz") return "Focal Non-Specific Seizure";
    if (st.includes("general") || st.includes("generalised") || st.includes("gnsz") || raw === "gnsz") return "Generalised Non-Specific Seizure";
    return "Seizure";
  }
  if (raw === "bckg" || raw === "background" || raw === "normal" || raw === "non-seizure") return "Non-Seizure";
  return "Pending";
}

function segmentKey(ev) {
  return ev?.index != null ? Number(ev.index) : null;
}

function buildSegmentBundles(events = [], ruleEvents = [], edits = {}) {
  const map = new Map();
  const ensure = (idx) => {
    if (!map.has(idx)) map.set(idx, { index: idx, ai: null, rule: null, start: null, end: null });
    return map.get(idx);
  };
  events.forEach(ev => {
    const idx = segmentKey(ev);
    if (idx == null) return;
    const b = ensure(idx);
    b.ai = ev;
    b.start = Math.min(Number(b.start ?? ev.start ?? 0), Number(ev.start ?? 0));
    b.end = Math.max(Number(b.end ?? ev.end ?? 0), Number(ev.end ?? 0));
  });
  ruleEvents.forEach(ev => {
    const idx = segmentKey(ev);
    if (idx == null) return;
    const b = ensure(idx);
    b.rule = ev;
    b.start = Math.min(Number(b.start ?? ev.start ?? 0), Number(ev.start ?? 0));
    b.end = Math.max(Number(b.end ?? ev.end ?? 0), Number(ev.end ?? 0));
  });
  return [...map.values()]
    .map(b => {
      const aiLabel = edits?.[b.index]?.status === "rejected" ? "rejected" : (edits?.[b.index]?.label ?? b.ai?.label ?? null);
      return { ...b, aiLabel };
    })
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

function pickBundleForTime(bundles, t, selectedIndex = null) {
  if (selectedIndex != null) {
    const exact = bundles.find(b => b.index === selectedIndex);
    if (exact) return exact;
  }
  const hit = bundles.find(b => t >= Number(b.start ?? 0) && t <= Number(b.end ?? 0));
  if (hit) return hit;
  return bundles[bundles.length - 1] || null;
}


function hexToRgba(hex, alpha = 1) {
  const h = String(hex || "#ffffff").replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export { pct, asPctNumber, displayLabel, segmentKey, buildSegmentBundles, pickBundleForTime, hexToRgba };
