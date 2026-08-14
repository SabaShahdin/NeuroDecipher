export function buildRecordingTheme(tokens) {
  const C = tokens || {};
  const dark = !!C.dark;
  return {
    ...C,
    dark,
    bg: C.bg || (dark ? "#071A2F" : "#F2F7FF"),
    panel: C.panel || (dark ? "rgba(12,35,61,.96)" : "rgba(255,255,255,.96)"),
    panel2: C.panel2 || (dark ? "rgba(15,43,73,.94)" : "rgba(239,246,255,.96)"),
    panel3: C.panel3 || (dark ? "#12375C" : "#EAF3FF"),
    border: C.border || (dark ? "rgba(96,165,250,.32)" : "rgba(96,165,250,.38)"),
    line: C.line || (dark ? "rgba(125,173,221,.18)" : "rgba(147,197,253,.26)"),
    text: C.text || (dark ? "#DCEBFF" : "#0B1B3A"),
    muted: C.muted || (dark ? "#AFC8E6" : "#315C96"),
    dim: C.dim || (dark ? "#7F9DBC" : "#5C78A7"),
    accent: C.accent || (dark ? "#4BA3FF" : "#1D4ED8"),
    accent2: C.accent2 || (dark ? "#38BDF8" : "#0284C7"),
    blue: C.blue || (dark ? "#60A5FA" : "#2563EB"),
    cyan: C.teal || (dark ? "#67E8F9" : "#0891B2"),
    red: C.red || (dark ? "#FDA4AF" : "#DC2626"),
    orange: C.orange || (dark ? "#FDE68A" : "#D97706"),
    purple: C.purple || (dark ? "#C4B5FD" : "#6D28D9"),
    success: C.green || (dark ? "#93C5FD" : "#1D4ED8"),
    surfaceGradient: dark
      ? "linear-gradient(135deg,#061629 0%,#0B2541 52%,#081D33 100%)"
      : "linear-gradient(135deg,#F6FAFF 0%,#E8F3FF 52%,#F3F8FF 100%)",
    gridOverlay: dark
      ? "linear-gradient(rgba(96,165,250,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,.07) 1px, transparent 1px)"
      : "linear-gradient(rgba(37,99,235,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,.08) 1px, transparent 1px)",
  };
}

export function recordingInputStyle(C) {
  return {
    width: "100%",
    height: 36,
    borderRadius: 9,
    border: `1px solid ${C.border}`,
    background: C.dark ? "rgba(7,26,47,.74)" : "#FFFFFF",
    color: C.text,
    outline: "none",
    padding: "0 11px",
    fontSize: 12,
    fontFamily: "'Roboto', Arial, sans-serif",
    boxShadow: C.dark ? "inset 0 1px 0 rgba(255,255,255,.04)" : "0 1px 2px rgba(37,99,235,.06)",
  };
}

export function recordingLabelStyle(C) {
  return {
    display: "block",
    fontSize: 10,
    color: C.muted,
    fontWeight: 850,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: ".08em",
  };
}

export function panelStyle(C) {
  return {
    border: `1px solid ${C.border}`,
    background: C.panel,
    borderRadius: 14,
    boxShadow: C.shadow || (C.dark ? "0 18px 48px rgba(2,8,23,.26)" : "0 14px 38px rgba(37,99,235,.10)"),
    backdropFilter: "blur(16px)",
  };
}
