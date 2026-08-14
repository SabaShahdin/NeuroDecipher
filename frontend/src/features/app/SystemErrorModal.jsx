import { useNdThemeTokens } from "../../hooks/useNdTheme.js";
import { hexToRgba } from "../../components/utils.js";

function getErrorText(error) {
  if (!error) return "An unexpected error occurred during analysis.";
  if (typeof error === "string") return error;
  return error.message || error.error || "An unexpected error occurred during analysis.";
}

export default function SystemErrorModal({ error, onDashboardNow }) {
  const { C } = useNdThemeTokens();
  if (!error) return null;

  const message = getErrorText(error);
  const accent = C.red || "#EF4444";
  const panelBg = C.dark
    ? `linear-gradient(180deg, ${hexToRgba(C.panel3 || "#0B223C", 0.98)} 0%, ${hexToRgba(C.panel || "#08182B", 0.98)} 100%)`
    : `linear-gradient(180deg, ${hexToRgba(C.panel || "#FFFFFF", 0.99)} 0%, ${hexToRgba(C.panel2 || "#EDF6FF", 0.98)} 100%)`;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: C.dark
          ? "rgba(2, 8, 18, 0.68)"
          : "rgba(219, 234, 254, 0.58)",
        backdropFilter: "blur(6px)",
        fontFamily: "'Roboto', Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "min(600px, 100%)",
          borderRadius: 20,
          border: `1px solid ${hexToRgba(accent, C.dark ? 0.5 : 0.35)}`,
          background: panelBg,
          boxShadow: C.dark
            ? "0 28px 80px rgba(0,0,0,.55)"
            : "0 24px 70px rgba(37,99,235,.20)",
          padding: 24,
          color: C.text,
          fontFamily: "'Roboto', Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              background: hexToRgba(accent, C.dark ? 0.18 : 0.12),
              color: accent,
              border: `1px solid ${hexToRgba(accent, C.dark ? 0.42 : 0.28)}`,
              fontSize: 24,
              fontWeight: 950,
              lineHeight: 1,
              flex: "0 0 auto",
            }}
          >
            !
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 750, color: C.text, lineHeight: 1.15 }}>
              Analysis stopped 
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: "14px 16px",
            borderRadius: 14,
            background: C.dark
              ? hexToRgba(accent, 0.13)
              : hexToRgba(accent, 0.08),
            border: `1px solid ${hexToRgba(accent, C.dark ? 0.3 : 0.18)}`,
            color: C.dark ? "#FFE4E6" : "#7F1D1D",
            fontSize: 14,
            fontWeight: 650,
            lineHeight: 1.5,
            maxHeight: 150,
            overflowY: "auto",
            overflowX: "hidden",
            wordBreak: "break-word",
          }}
          className="nd-scrollbar"
        >
          {message}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginTop: 18,
            color: C.dim,
            fontSize: 12,
            fontWeight: 650,
          }}
        >
          
          <button
            type="button"
            onClick={onDashboardNow}
            style={{
              border: `1px solid ${hexToRgba(C.blue || C.accent, C.dark ? 0.55 : 0.35)}`,
              borderRadius: 12,
              padding: "10px 16px",
              background: C.dark
                ? hexToRgba(C.blue || C.accent, 0.22)
                : C.blue || C.accent,
              color: C.dark ? C.text : "#FFFFFF",
              fontFamily: "'Roboto', Arial, sans-serif",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: C.dark ? "none" : "0 10px 22px rgba(37,99,235,.18)",
              whiteSpace: "nowrap",
            }}
          >
            Go to Dashboard now
          </button>
        </div>
      </div>
    </div>
  );
}
