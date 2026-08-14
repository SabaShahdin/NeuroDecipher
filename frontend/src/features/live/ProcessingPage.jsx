import { hexToRgba } from "../../components/utils.js";
import { useNdThemeTokens } from "../../hooks/useNdTheme.js";

export default function ProcessingPage({ fileName, phase, received = 0, total = 0 }) {
  const { C } = useNdThemeTokens();
  const progress = total ? Math.min(100, Math.round((received / total) * 100)) : 0;
  const active = phase === "loading" || phase === "running";

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "'Roboto', Arial, sans-serif", color: C.text, background: C.dark ? "linear-gradient(135deg,#040B14,#071523)" : "linear-gradient(135deg,#F8FAFC,#EAF4FF)" }}>
      <section style={{ width: "min(560px, 100%)", border: `1px solid ${C.border}`, borderRadius: 18, background: C.panel, boxShadow: C.dark ? "0 28px 90px rgba(0,0,0,.35)" : "0 28px 70px rgba(15,23,42,.12)", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, display: "grid", placeItems: "center", background: hexToRgba(C.blue || C.green, .14), color: C.blue || C.green, border: `1px solid ${hexToRgba(C.blue || C.green, .35)}`, fontWeight: 950 }}>EEG</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 950 }}>Processing recording</div>
            <div title={fileName || "No recording"} style={{ marginTop: 4, color: C.muted, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName || "No recording"}</div>
          </div>
        </div>
        <div style={{ marginTop: 22, height: 12, borderRadius: 999, background: C.panel2, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: `linear-gradient(90deg, ${C.blue || C.green}, ${C.green})`, transition: "width .25s ease" }} />
        </div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 13, fontWeight: 800 }}>
          <span>{active ? "Analysis is running…" : "Waiting…"}</span>
          <span>{received}/{total || "—"} segments</span>
        </div>
      </section>
    </div>
  );
}
