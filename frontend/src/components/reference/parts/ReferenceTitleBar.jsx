import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { API, apiHeaders, fmtT, WIN_OPTS, CH_H, PLOTLY_MARGIN } from "../../../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "../../utils.js";

function ReferenceTitleBar({ C, onBackDashboard, activeTab = "live", setActiveTab = () => {} }) {
  return (
    <div style={{
      minHeight: 34, display: "flex", alignItems: "center", gap: 10,
      padding: "5px 10px", border: `1px solid ${C.border}`, borderBottom: "none",
      borderRadius: "8px 8px 0 0", background: C.dark ? "#06111D" : "#FFFFFF",
      color: C.text, fontSize: 12, fontWeight: 900, letterSpacing: ".035em",
      flexWrap: "wrap", overflow: "visible"
    }}>
      <button
        onClick={onBackDashboard}
        title="Back to main dashboard"
        style={{
          height: 25, borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel2,
          color: C.green, cursor: "pointer", padding: "0 9px", fontSize: 10,
          fontWeight: 900, fontFamily: "'Roboto', Arial, sans-serif", whiteSpace: "nowrap"
        }}
      >
        ← Dashboard
      </button>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0, flex: "1 1 260px" }}>
        <span style={{ overflowWrap: "anywhere" }}>5. EEG VIEWER &amp; ANALYSIS SCREEN</span>
        <span style={{ color: C.muted, fontSize: 10, whiteSpace: "nowrap" }}>(MAIN)</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {[ ["live","Live"], ["ai","AI"], ["rule","Rules"], ["hybrid","Hybrid"], ["annotations","Annotations"], ["report","Report"] ].map(([k,l]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{ height: 24, borderRadius: 5, border: `1px solid ${activeTab === k ? hexToRgba(C.green,.52) : C.border}`, background: activeTab === k ? hexToRgba(C.green,.13) : C.panel2, color: activeTab === k ? C.green : C.muted, cursor: "pointer", padding: "0 8px", fontSize: 9, fontWeight: 900, fontFamily: "'Roboto', Arial, sans-serif" }}>{l}</button>
        ))}
      </div>
    </div>
  );
}
// }

export default ReferenceTitleBar;
export { ReferenceTitleBar };
