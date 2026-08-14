import { hexToRgba } from "../utils.js";

/**
 * NeuroDecipher — shared building blocks for the Sign In / Sign Up screens.
 * Keeping these in one place means both auth screens always stay visually
 * in sync, in both the light and dark theme.
 */

// Brain + circuit/EEG mark used as the app logo on the auth screens.
export function BrainMark({ size = 56 }) {
  return (
    <img
      src="/neurodecipher-logo.png"
      alt="NeuroDecipher logo"
      width={size}
      height={size}
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}

// Small pill switch that flips between the light and dark theme.
export function ThemeToggle({ theme, setTheme, C }) {
  const isDark = theme !== "light";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle color theme"
      style={{
        position: "absolute", top: 16, right: 16,
        width: 34, height: 34, borderRadius: 10,
        display: "grid", placeItems: "center",
        border: `1px solid ${C.border}`,
        background: C.panel2, color: C.muted,
        cursor: "pointer",
      }}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

// Consistent error / info message box — replaces the plain colored <div>
// that used to hold auth errors with a proper icon + message layout.
export function MessageBox({ tone = "error", children, C }) {
  if (!children) return null;
  const palette = tone === "error"
    ? { fg: C.red, bg: hexToRgba(C.red, C.dark ? 0.14 : 0.08), border: hexToRgba(C.red, 0.35) }
    : { fg: C.teal, bg: hexToRgba(C.teal, C.dark ? 0.14 : 0.08), border: hexToRgba(C.teal, 0.35) };

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        color: palette.fg, background: palette.bg, border: `1px solid ${palette.border}`,
        borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600,
        lineHeight: 1.4, marginBottom: 16,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
        {tone === "error" ? (
          <>
            <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 7.5v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="16.6" r="1" fill="currentColor" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 11v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="7.7" r="1" fill="currentColor" />
          </>
        )}
      </svg>
      <span>{children}</span>
    </div>
  );
}

// Shared field styling so every input on both auth screens matches exactly.
export function authInputStyle(C, extra = {}) {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: `1px solid ${C.border}`,
    background: C.panel2,
    color: C.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "'Roboto', Arial, sans-serif",
    ...extra,
  };
}

export function authLabelStyle(C) {
  return {
    display: "block", fontSize: 12, fontWeight: 800,
    color: C.muted, marginBottom: 6, letterSpacing: "0.01em",
  };
}
