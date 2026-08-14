/**
 * NeuroDecipher — dashboard.jsx  (SINGLE-FILE COMPLETE VERSION)
 * ═══════════════════════════════════════════════════════════════
 * All pages, components, hooks, and utilities consolidated into one file.
 *
 * Backend alignment:
 *  • POST /upload   → { jobId, fileName, channels, times, data, samplingRate }
 *  • GET  /predictions/<jobId>  → SSE stream
 *      meta:        { type:"meta", total }
 *      prediction:  { type:"prediction", source:"ai"|"rule", index, start, end,
 *                     label, prob, confidence,
 *                     [ai_subtype, ai_subtype_full, ai_subtype_confidence, ai_subtype_probs],  ← AI only
 *                     [rule_subtype, rule_subtype_full, rule_subtype_confidence],              ← Rule seizure
 *                     [hybrid_confidence, hybrid_label, alpha, ai_prob_used, rule_conf_used], ← Rule always
 *                     [rules, n_sz_rules], total, progress }
 *      done:        { type:"done", n_seizure_ai, n_bckg_ai, n_seizure_rule,
 *                     n_bckg_rule, n_seizure_hybrid, n_bckg_hybrid, elapsed_s }
 *      error:       { type:"error", message }
 *  • POST /annotations/<jobId> → save AI review edit
 *  • GET  /report/<jobId>      → PDF download
 *
 * Pages:  Upload → Processing → Review → Report
 * Layout: Toolbar | ChannelPanel | EegViewer + TimelineStrip + RawSignal | RightPanel | StatusBar
 */


// ─────────────────────────────────────────────────────────────────────────────
//  CONSTANTS & DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const API = (
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE_URL) ||
  "http://localhost:5000"
).replace(/\/$/, "");

const MAX_FRONTEND_UPLOAD_MB = Number(
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_MAX_UPLOAD_MB) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_MAX_UPLOAD_MB) ||
  2048
);

const AUTH_TOKEN_STORAGE_KEY = "nd_auth_token";

function getStoredAuthToken() {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function setStoredAuthToken(token) {
  try {
    if (token) window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore storage failures (private browsing, etc.) */
  }
}

function apiHeaders(extra = {}) {
  const token = getStoredAuthToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function sseUrl(url) {
  const token = getStoredAuthToken();
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

const T = {
  shell:        "#F8FAFC",
  shellBorder:  "#E5E7EB",
  shellBorder2: "#CBD5E1",
  shellMuted:   "#64748B",
  shellText:    "#0F172A",
  shellSubtext: "#475569",
  shellAccent:  "#2563EB",
  shellAccentD: "#1D4ED8",
  shellAccentL: "#EFF6FF",
  shell1:       "#FFFFFF",
  shell2:       "#F1F5F9",
  shell3:       "#E2E8F0",
  shell4:       "#CBD5E1",
  canvas:       "#FFFFFF",
  canvasBg:     "#F8FAFC",
  plotGrid:     "#E5E7EB",
  border:       "#E5E7EB",
  text:         "#0F172A",
  muted:        "#64748B",
  seizureFill:  "rgba(220,38,38,0.07)",
  seizureLine:  "#DC2626",
  seizureSoft:  "#FEF2F2",
  seizureText:  "#991B1B",
  interictal:   "#D97706",
  artifact:     "#7C3AED",
  bckgFill:     "rgba(100,116,139,0.05)",
  ok:           "#059669",
  warn:         "#D97706",
  playhead:     "#EA580C",
  aiColor:      "#2563EB",
  aiBg:         "rgba(37,99,235,0.06)",
  hybridColor:  "#7C3AED",
  hybridBg:     "rgba(124,58,237,0.07)" };

const CH_H = 56;

const CH_COLORS = [
  "#2563EB","#3B82F6","#0EA5E9","#0284C7","#0369A1","#1D4ED8","#1E40AF",
  "#059669","#10B981","#047857","#065F46",
  "#D97706","#B45309","#92400E","#F59E0B",
  "#7C3AED","#8B5CF6","#6D28D9",
  "#DC2626","#DB2777","#E11D48",
];

const CH_REGIONS = {
  Frontal:   ["FP1","FP2","F3","F4","F7","F8","FZ"],
  Central:   ["C3","C4","CZ"],
  Temporal:  ["T3","T4","T5","T6"],
  Parietal:  ["P3","P4","PZ"],
  Occipital: ["O1","O2"] };

const REGION_ACCENT = {
  Frontal: "#2563EB", Central: "#059669", Temporal: "#D97706",
  Parietal: "#7C3AED", Occipital: "#DB2777", Other: "#64748B" };

const STATUS_CFG = {
  ai_predicted: { label: "AI",         bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
  accepted:     { label: "Accepted", bg: "#F0FDF4", color: "#059669", border: "#86EFAC" },
  rejected:     { label: "Rejected", bg: "#F8FAFC", color: "#64748B", border: "#CBD5E1" },
  modified:     { label: "Edited",   bg: "#FFFBEB", color: "#D97706", border: "#FCD34D" } };

const SUBTYPE_FULL = {
  gnsz: "Generalised Non-Specific Seizure",
  fnsz: "Focal Non-Specific Seizure",
  cpsz: "Complex Partial Seizure",
  seiz: "Seizure (Unclassified)" };

const SUBTYPE_SHORT = {
  gnsz: "GN-SZ", fnsz: "FN-SZ", cpsz: "CP-SZ",
  seiz: "SZ", unavailable: "SZ?", error: "SZ!" };

const SUBTYPE_COLORS = {
  gnsz: "#991B1B", fnsz: "#9A3412", cpsz: "#5B21B6",
  seiz: "#991B1B" };

const REGION_ORDER = ["Frontal","Central","Temporal","Parietal","Occipital","Other"];

const WIN_OPTS = [5, 10, 20, 30, 60];

const PLOTLY_MARGIN = { l: 38, r: 6, t: 8, b: 28 };

// ─────────────────────────────────────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────────────────────────────────────
function fmtT(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const sc = Math.floor(s % 60);
  return h
    ? `${h}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`
    : `${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`;
}

function isoNow() { return new Date().toISOString(); }
function uid()    { return Math.random().toString(36).slice(2); }

function annColor(type = "") {
  const t = type.toLowerCase();
  if (t.includes("seizure") || t.includes("ictal")) return T.seizureLine;
  if (t.includes("spike"))                          return T.interictal;
  if (t.includes("artifact"))                       return T.artifact;
  return T.shellAccent;
}

function getRegion(ch) {
  const upper = ch.toUpperCase().replace(/-LE$/,"").replace(/^EEG\s+/,"").trim();
  for (const [region, list] of Object.entries(CH_REGIONS)) {
    if (list.some(r => upper === r)) return region;
  }
  return "Other";
}

// ─────────────────────────────────────────────────────────────────────────────
//  GLOBAL STYLES (injected once)
// ─────────────────────────────────────────────────────────────────────────────
const GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { overflow: hidden; background:#F8FAFC; }
  .nd-glass { background: rgba(255,255,255,0.86); backdrop-filter: blur(14px); border: 1px solid rgba(226,232,240,0.85); box-shadow: 0 24px 70px rgba(15,23,42,0.10); }
  .nd-soft-card { border: 1px solid #E2E8F0; background: #fff; border-radius: 14px; box-shadow: 0 10px 28px rgba(15,23,42,0.05); }
  .nd-action-btn:hover { transform: translateY(-1px); filter: brightness(0.98); }

  :root {
    --nd-scroll-size: 8px;
    --nd-scroll-radius: 999px;
    --nd-scroll-track: transparent;
    --nd-scroll-track-hover: rgba(148,163,184,.14);
    --nd-scroll-thumb: rgba(96,165,250,.42);
    --nd-scroll-thumb-hover: rgba(96,165,250,.72);
    color-scheme: light;
  }
  html[data-theme="dark"] {
    --nd-scroll-track: transparent;
    --nd-scroll-track-hover: rgba(73,117,153,.20);
    --nd-scroll-thumb: rgba(147,168,190,.38);
    --nd-scroll-thumb-hover: rgba(231,240,250,.64);
    color-scheme: dark;
  }
  html, body, #root, *, *::before, *::after { scrollbar-width: thin; scrollbar-color: var(--nd-scroll-thumb) transparent; }
  *::-webkit-scrollbar { width: var(--nd-scroll-size); height: var(--nd-scroll-size); background: transparent; }
  *::-webkit-scrollbar-button, *::-webkit-scrollbar-button:single-button, *::-webkit-scrollbar-button:vertical:decrement, *::-webkit-scrollbar-button:vertical:increment, *::-webkit-scrollbar-button:horizontal:decrement, *::-webkit-scrollbar-button:horizontal:increment { display:none !important; width:0 !important; height:0 !important; background:transparent !important; }
  *::-webkit-scrollbar-track, *::-webkit-scrollbar-track-piece { background: var(--nd-scroll-track); border:0; border-radius: var(--nd-scroll-radius); }
  *::-webkit-scrollbar-track:hover { background: var(--nd-scroll-track-hover); }
  *::-webkit-scrollbar-thumb { min-height:38px; min-width:38px; border-radius:var(--nd-scroll-radius); border:2px solid transparent; background-color:var(--nd-scroll-thumb); background-clip:padding-box; }
  *::-webkit-scrollbar-thumb:hover, *::-webkit-scrollbar-thumb:active { background-color:var(--nd-scroll-thumb-hover); background-clip:padding-box; }
  *::-webkit-scrollbar-corner, *::-webkit-resizer { background:transparent; }
  .nd-scrollbar { scrollbar-width: thin; scrollbar-color: var(--nd-scroll-thumb) transparent; }
  .nd-scrollbar::-webkit-scrollbar { width:7px; height:7px; }
  .nd-scrollbar::-webkit-scrollbar-track, .nd-scrollbar::-webkit-scrollbar-track-piece { background:transparent !important; }
  .nd-scrollbar::-webkit-scrollbar-thumb { border:1.5px solid transparent; }

  @keyframes ndPulse {
    0%,100% { opacity:1; transform:scale(1); }
    50%      { opacity:.5; transform:scale(1.25); }
  }
  @keyframes ndPulseGreen {
    0%,100% { box-shadow:0 0 0 0 rgba(5,150,105,0.4); }
    50%      { box-shadow:0 0 0 5px rgba(5,150,105,0); }
  }
  @keyframes fadeIn {
    from { opacity:0; transform:translateY(6px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes slideUp {
    from { opacity:0; transform:translateY(20px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes rbPulse {
    0%,100% { opacity:1; }
    50%      { opacity:0.55; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes waveFlow {
    0%   { stroke-dashoffset: 200; }
    100% { stroke-dashoffset: 0; }
  }
`;



export {
  API, MAX_FRONTEND_UPLOAD_MB,
  T, CH_H, CH_COLORS, CH_REGIONS, REGION_ACCENT, STATUS_CFG, SUBTYPE_FULL,
  SUBTYPE_SHORT, SUBTYPE_COLORS, REGION_ORDER, WIN_OPTS, PLOTLY_MARGIN, GLOBAL_STYLE,
  apiHeaders, sseUrl, fmtT, isoNow, uid, annColor, getRegion,
  AUTH_TOKEN_STORAGE_KEY, getStoredAuthToken, setStoredAuthToken };
