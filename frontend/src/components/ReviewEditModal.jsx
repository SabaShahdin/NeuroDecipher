import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, CH_COLORS, CH_REGIONS, REGION_ACCENT, STATUS_CFG, SUBTYPE_FULL, SUBTYPE_SHORT, SUBTYPE_COLORS, REGION_ORDER, WIN_OPTS, PLOTLY_MARGIN, fmtT, isoNow, uid, annColor, getRegion } from "../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "./utils.js";
import { StatusBadge, SubtypeBadge, HybridBadge } from "./badges.jsx";
// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT: ReviewEditModal
// ─────────────────────────────────────────────────────────────────────────────
export default function ReviewEditModal({ state, clinician, onClose, onSave }) {
  const [label, setLabel] = useState(state?.label ?? "seizure");
  const [note, setNote] = useState(state?.note ?? "");
  useEffect(() => {
    setLabel(state?.label ?? "seizure");
    setNote(state?.note ?? "");
  }, [state]);
  if (!state) return null;
  const { ev, statusName } = state;
  const title = statusName === "accepted" ? "Accept AI prediction" : statusName === "rejected" ? "Reject AI prediction" : "Modify AI prediction";
  return (
    <div role="dialog" aria-modal="true" style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(15,23,42,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20 }}>
      <div style={{ width: 420, maxWidth: "100%", background: "#fff", borderRadius: 14, border: `1px solid ${T.shellBorder}`, boxShadow: "0 24px 80px rgba(15,23,42,0.25)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.shellBorder}`, background: T.shell2 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.shellText }}>{title}</div>
          <div style={{ fontSize: 10, color: T.shellMuted, fontFamily: "'Roboto', Arial, sans-serif", marginTop: 3 }}>
            Window #{ev.index} · {fmtT(ev.start)} → {fmtT(ev.end)} · Clinician: {clinician || "Unsigned"}
          </div>
        </div>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700, color: T.shellSubtext }}>
            Final label
            <select value={label} onChange={e => setLabel(e.target.value)} disabled={statusName === "rejected"} style={{ padding: "8px 10px", border: `1px solid ${T.shellBorder}`, borderRadius: 8, fontFamily: "'Roboto', Arial, sans-serif" }}>
              <option value="seizure">Seizure</option>
              <option value="bckg">Background</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700, color: T.shellSubtext }}>
            Review note
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder="Optional clinical note" style={{ resize: "vertical", padding: "8px 10px", border: `1px solid ${T.shellBorder}`, borderRadius: 8, fontFamily: "'Roboto', Arial, sans-serif", fontSize: 12 }} />
          </label>
        </div>
        <div style={{ padding: 12, borderTop: `1px solid ${T.shellBorder}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.shellBorder}`, background: "#fff", cursor: "pointer", fontWeight: 700 }}>Cancel</button>
          <button onClick={() => onSave(ev.index, ev, statusName, statusName === "rejected" ? state.label : label, note, clinician)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.shellAccentD}`, background: T.shellAccent, color: "#fff", cursor: "pointer", fontWeight: 800 }}>Save review</button>
        </div>
      </div>
    </div>
  );
}


export { ReviewEditModal };
