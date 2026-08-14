import { Activity, Upload } from "lucide-react";
import { T } from "../../../constants.js";
import { hexToRgba } from "../../../components/utils.js";

function LiveUploadFirstPanel({ C, phase, errorMsg, onUploadFile, onBackDashboard, onOpenRecordings }) {
  const loading = phase === "loading" || phase === "running";
  return (
    <div style={{ minHeight: "100vh", background: C.dark ? "linear-gradient(135deg,#040B14 0%,#071523 58%,#05101D 100%)" : "linear-gradient(135deg,#F8FAFC 0%,#EAF4FF 58%,#F8FAFC 100%)", color: C.text, fontFamily: "'Roboto', Arial, sans-serif", display: "grid", gridTemplateRows: "54px minmax(0,1fr)", overflow: "hidden" }}>
      <header style={{ borderBottom: `1px solid ${C.border}`, background: C.panel3, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 10, display: "grid", placeItems: "center", background: hexToRgba(C.blue,.13), color: C.blue, border: `1px solid ${hexToRgba(C.blue,.42)}` }}><Activity size={16} strokeWidth={2.2} /></div>
          <div>
            <div style={{ fontWeight: 950, fontSize: 14 }}>Live Prediction</div>
            <div style={{ color: C.muted, fontSize: 10 }}>No analysis is loaded yet</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onOpenRecordings} style={{ border: `1px solid ${C.border}`, background: C.panel2, color: C.text, borderRadius: 8, padding: "8px 11px", cursor: "pointer", fontWeight: 850 }}>Analyses</button>
          <button onClick={onBackDashboard} style={{ border: `1px solid ${C.border}`, background: C.panel2, color: C.text, borderRadius: 8, padding: "8px 11px", cursor: "pointer", fontWeight: 850 }}>Dashboard</button>
        </div>
      </header>

      <main style={{ minHeight: 0, display: "grid", placeItems: "center", padding: 24 }}>
        <section onClick={() => !loading && onUploadFile?.()} style={{ width: "min(620px, calc(100vw - 40px))", border: `1px solid ${C.border}`, borderRadius: 18, background: C.dark ? "linear-gradient(180deg, rgba(10,22,38,.98), rgba(7,17,31,.98))" : "#FFFFFF", boxShadow: C.dark ? "0 28px 90px rgba(0,0,0,.36)" : "0 28px 70px rgba(15,23,42,.12)", overflow: "hidden", cursor: loading ? "default" : "pointer" }}>
          <div style={{ padding: 28, textAlign: "center", display: "grid", gap: 14, justifyItems: "center" }}>
            <div style={{ width: 66, height: 66, borderRadius: 20, display: "grid", placeItems: "center", background: `linear-gradient(135deg, ${hexToRgba(C.blue,.18)}, ${hexToRgba(C.green,.15)})`, border: `1px solid ${hexToRgba(C.blue,.34)}`, color: C.blue }}><Upload size={28} strokeWidth={2} /></div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 950 }}>Open Upload Page</div>
              <div style={{ marginTop: 8, fontSize: 13, color: C.muted }}>Use the single upload page to add a new EDF recording.</div>
              <div style={{ marginTop: 12, fontSize: 11, color: C.blue, fontWeight: 950 }}>Click anywhere here to continue</div>
            </div>
            {errorMsg && <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: hexToRgba(C.red,.12), border: `1px solid ${hexToRgba(C.red,.35)}`, color: C.red, fontSize: 12 }}>{errorMsg}</div>}
          </div>
        </section>
      </main>
    </div>
  );
}

function NoticeModal({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div role="alertdialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: 460, maxWidth: "100%", background: "#fff", borderRadius: 14, border: `1px solid ${T.shellBorder}`, boxShadow: "0 24px 80px rgba(15,23,42,0.25)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.shellBorder}`, background: "#FEF2F2", color: "#991B1B", fontWeight: 800 }}>{notice.title}</div>
        <div style={{ padding: 16, whiteSpace: "pre-wrap", color: T.shellSubtext, fontSize: 13, lineHeight: 1.6 }}>{notice.message}</div>
        <div style={{ padding: 12, borderTop: `1px solid ${T.shellBorder}`, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.shellBorder}`, background: "#fff", cursor: "pointer", fontWeight: 700 }}>Close</button>
        </div>
      </div>
    </div>
  );
}


export { LiveUploadFirstPanel, NoticeModal };
