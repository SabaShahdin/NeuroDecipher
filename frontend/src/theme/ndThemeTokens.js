export const ND_THEME_STORAGE_KEY = "nd_theme";

export function buildNdThemeTokens(theme = "dark") {
  const dark = theme !== "light";

  if (!dark) {
    return {
      dark: false,
      name: "light",
      bg: "#F2F7FF",
      bg2: "#E6F1FF",
      gridBg: "#FFFFFF",
      panel: "rgba(255,255,255,.97)",
      panel2: "rgba(237,246,255,.96)",
      panel3: "#EAF3FF",
      panel4: "#D7E9FF",
      border: "rgba(96,165,250,.46)",
      line: "rgba(147,197,253,.34)",
      grid: "rgba(37,99,235,.12)",
      text: "#08214A",
      muted: "#315C96",
      dim: "#5D79A9",
      trace: "#1E3A8A",
      raw: "#2563EB",
      accent: "#2563EB",
      accent2: "#0284C7",
      green: "#1D4ED8",
      teal: "#0891B2",
      blue: "#2563EB",
      purple: "#5B5FEF",
      red: "#DC2626",
      orange: "#D97706",
      yellow: "#CA8A04",
      shadow: "0 16px 40px rgba(37,99,235,.12)",
      pageGradient: "linear-gradient(135deg,#F7FBFF 0%,#E6F1FF 48%,#F3F8FF 100%)",
      gridOverlay: "linear-gradient(rgba(37,99,235,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,.08) 1px, transparent 1px)",
    };
  }

  return {
    dark: true,
    name: "dark",
    bg: "#061426",
    bg2: "#0A2038",
    gridBg: "#07182B",
    panel: "rgba(8,24,43,.98)",
    panel2: "rgba(10,31,54,.96)",
    panel3: "#0B223C",
    panel4: "#123A61",
    border: "rgba(91,145,205,.42)",
    line: "rgba(121,166,213,.30)",
    grid: "rgba(105,160,220,.16)",
    text: "#E6F1FF",
    muted: "#B8CDE6",
    dim: "#8EABC9",
    trace: "#D6EAFF",
    raw: "#9FD0FF",
    accent: "#4BA3FF",
    accent2: "#38BDF8",
    green: "#5EA8FF",
    teal: "#2DD4BF",
    blue: "#60A5FA",
    purple: "#A78BFA",
    red: "#F87171",
    orange: "#FDBA74",
    yellow: "#FDE68A",
    shadow: "0 22px 58px rgba(0,0,0,.46)",
    pageGradient: "linear-gradient(135deg,#030B15 0%,#07182B 50%,#061426 100%)",
    gridOverlay: "linear-gradient(rgba(94,151,214,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(94,151,214,.10) 1px, transparent 1px)",
  };
}

export const panelSurface = (C) => ({
  border: `1px solid ${C.border}`,
  background: C.panel,
  borderRadius: 12,
  boxShadow: C.shadow,
  backdropFilter: "blur(16px)",
});

export const subPanelSurface = (C) => ({
  border: `1px solid ${C.line}`,
  background: C.panel2,
  borderRadius: 10,
});
