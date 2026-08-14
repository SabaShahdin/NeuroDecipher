import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API, apiHeaders, fmtT } from "../../constants.js";
import { pct, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "../utils.js";
function BackendDetailShell({ C, title, subtitle, screenNo, children, details, loading, error, onRefresh }) {
  return <div style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
    <div style={{ minHeight: 48, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px", flexWrap: "wrap" }}>
      <div><div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>{screenNo}. {title}</div><div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{subtitle}</div></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontFamily: "'Roboto', Arial, sans-serif", fontSize: 9 }}>
        <span style={{ color: C.dim }}>Source: {details?.source || "backend"}</span>
        
      </div>
    </div>
    {error && <div style={{ margin: 12, padding: 10, borderRadius: 7, border: `1px solid ${hexToRgba(C.red,.5)}`, background: hexToRgba(C.red,.12), color: C.red, fontSize: 11 }}>{error}</div>}
    {loading && <div style={{ padding: 12, color: C.muted, fontSize: 11 }}>Loading backend analysis details…</div>}
    <div style={{ flex: 1, overflow: "auto", padding: 12 }}>{children}</div>
  </div>;
}


export { BackendDetailShell };
