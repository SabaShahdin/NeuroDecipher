import { readInterpretabilityCache, writeInterpretabilityCache } from "../../../services/interpretabilityPrefetch.js";

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v || 0)));

const pct = (v) => `${Math.round(clamp01(v) * 100)}%`;

const labelText = (v) =>
  String(v || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

const isSeizure = (v) => String(v || "").toLowerCase().includes("seizure");

const SUBTYPE_NAMES = {
  gnsz: "Generalized Seizure",
  fnsz: "Focal Seizure",
  cpsz: "Complex Partial Seizure",
};

// Display label for a class (AI / Rule / Hybrid). Anything that isn't a
// seizure call (bckg, background, non-seizure, missing) reads as "Normal"
// instead of a raw backend code or a bare "Pending".
const classLabel = (v) => (isSeizure(v) ? labelText(v) : "Normal");

// Display text for a subtype meta line, paired with the class it belongs to.
// - Not a seizure call -> "Normal"
// - Seizure call but subtype not computed yet -> "Subtype pending"
// - Seizure call with a subtype code (gnsz/fnsz/cpsz) -> its full clinical name
const subtypeText = (label, subtype) => {
  if (!isSeizure(label)) return "Normal";
  if (!subtype) return "Subtype pending";
  const key = String(subtype).trim().toLowerCase();
  return SUBTYPE_NAMES[key] || labelText(subtype);
};

const cleanCh = (ch) =>
  String(ch || "")
    .replace(/^EEG\s+/i, "")
    .replace(/-LE$|-REF$|-AVG$/i, "");

const safeArr = (v) => (Array.isArray(v) ? v : []);

export { clamp01, pct, labelText, isSeizure, classLabel, subtypeText, cleanCh, safeArr, readInterpretabilityCache, writeInterpretabilityCache };
