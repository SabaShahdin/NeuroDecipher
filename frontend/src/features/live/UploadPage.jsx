import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useNdThemeTokens } from "../../hooks/useNdTheme.js";
import { hexToRgba } from "../../components/utils.js";

export default function UploadPage({ phase, errorMsg, onUpload, onBackDashboard, onOpenRecordings }) {
  const { C } = useNdThemeTokens();
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");
  const inputRef = useRef(null);
  const loading = phase === "loading" || phase === "running";

  const pickFile = (file) => {
    setLocalError("");
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "edf") {
      setLocalError("Please select an EDF EEG file.");
      return;
    }
    onUpload?.(file);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: C.dark ? "linear-gradient(135deg,#040B14 0%,#071523 58%,#05101D 100%)" : "linear-gradient(135deg,#F8FAFC 0%,#EAF4FF 58%,#F8FAFC 100%)",
      color: C.text,
      fontFamily: "'Roboto', Arial, sans-serif",
      display: "grid",
      gridTemplateRows: "64px minmax(0,1fr)",
      overflow: "hidden"
    }}>
      <header style={{
        borderBottom: `1px solid ${C.border}`,
        background: C.panel3,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 22px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background: hexToRgba(C.blue, .14),
            color: C.blue,
            border: `1px solid ${hexToRgba(C.blue, .42)}`,
          }}><Upload size={18} strokeWidth={2.2} /></div>
          <div>
            <div style={{ fontWeight: 950, fontSize: 16 }}>Upload EEG Analysis</div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>Single upload flow for Dashboard, Analyses, and Viewer actions</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onOpenRecordings} style={{ border: `1px solid ${C.border}`, background: C.panel2, color: C.text, borderRadius: 10, padding: "9px 13px", cursor: "pointer", fontWeight: 900 }}>Analyses</button>
          <button onClick={onBackDashboard} style={{ border: `1px solid ${C.border}`, background: C.panel2, color: C.text, borderRadius: 10, padding: "9px 13px", cursor: "pointer", fontWeight: 900 }}>Dashboard</button>
        </div>
      </header>

      <main style={{ minHeight: 0, display: "grid", placeItems: "center", padding: 28 }}>
        <section style={{
          width: "min(720px, calc(100vw - 44px))",
          border: `1px solid ${C.border}`,
          borderRadius: 22,
          background: C.dark ? "linear-gradient(180deg, rgba(10,22,38,.98), rgba(7,17,31,.98))" : "#FFFFFF",
          boxShadow: C.dark ? "0 28px 90px rgba(0,0,0,.36)" : "0 28px 70px rgba(15,23,42,.12)",
          overflow: "hidden"
        }}>
          <div style={{
            minHeight: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "0 22px",
            borderBottom: `1px solid ${C.line}`,
            background: C.panel3
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: ".08em", textTransform: "uppercase" }}>New Analysis</div>
              <div style={{ marginTop: 5, fontSize: 11, color: C.muted }}>Upload EDF → signal loads → live AI / Rule / Hybrid prediction starts</div>
            </div>
            <div style={{ color: C.blue, fontSize: 11, fontWeight: 950 }}>EDF only</div>
          </div>

          <div style={{ padding: 22 }}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
              onClick={() => !loading && inputRef.current?.click()}
              style={{
                minHeight: 300,
                border: `2px dashed ${dragging ? C.blue : hexToRgba(C.muted, .55)}`,
                borderRadius: 18,
                background: dragging ? hexToRgba(C.blue, .12) : `radial-gradient(circle at 50% 0%, ${hexToRgba(C.blue, .14)}, transparent 48%), ${C.dark ? "rgba(3,10,20,.42)" : "rgba(248,250,252,.88)"}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                cursor: loading ? "default" : "pointer",
                textAlign: "center",
                transition: "all .18s ease"
              }}
            >
              <input ref={inputRef} type="file" accept=".edf" style={{ display: "none" }} onChange={(e) => pickFile(e.target.files?.[0])} />
              {loading ? (
                <>
                  <div style={{ width: 58, height: 58, borderRadius: "50%", border: `4px solid ${hexToRgba(C.muted, .25)}`, borderTopColor: C.blue, animation: "spin .8s linear infinite" }} />
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 950 }}>Uploading and preparing signal…</div>
                    <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>The live viewer will open when the file is accepted.</div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ width: 72, height: 72, borderRadius: 22, display: "grid", placeItems: "center", background: `linear-gradient(135deg, ${hexToRgba(C.blue, .20)}, ${hexToRgba(C.green, .14)})`, border: `1px solid ${hexToRgba(C.blue, .34)}`, color: C.blue }}><Upload size={30} strokeWidth={2} /></div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 950 }}>Drop EEG file here</div>
                    <div style={{ marginTop: 8, fontSize: 13, color: C.muted }}>or click to browse your computer</div>
                    <div style={{ marginTop: 14, fontSize: 11, color: C.blue, fontWeight: 950 }}>Accepted format: .edf</div>
                  </div>
                </>
              )}
            </div>

            {(localError || errorMsg) && (
              <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: hexToRgba(C.red, .12), border: `1px solid ${hexToRgba(C.red, .35)}`, color: C.red, fontSize: 13, fontWeight: 800, lineHeight: 1.35 }}>
                {localError || errorMsg}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export { UploadPage };
