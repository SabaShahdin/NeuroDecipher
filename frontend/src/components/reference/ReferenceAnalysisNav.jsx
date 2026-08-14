import { hexToRgba } from "../utils.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useState } from "react";

const Icon = ({ type, size = 17, color = "currentColor" }) => {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    style: { display: "block" },
  };

  const strokeProps = {
    stroke: color,
    strokeWidth: 2.2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  switch (type) {
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="2" {...strokeProps} />
          <rect x="14" y="3" width="7" height="7" rx="2" {...strokeProps} />
          <rect x="3" y="14" width="7" height="7" rx="2" {...strokeProps} />
          <rect x="14" y="14" width="7" height="7" rx="2" {...strokeProps} />
        </svg>
      );

    case "recordings":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="3" {...strokeProps} />
          <path d="M8 9h8" {...strokeProps} />
          <path d="M8 13h5" {...strokeProps} />
          <path d="M17 17l2 2" {...strokeProps} />
          <circle cx="16.5" cy="15.5" r="2.5" {...strokeProps} />
        </svg>
      );

    case "live":
      return (
        <svg {...common}>
          <path d="M3 12h4l2-5 4 10 2-5h6" {...strokeProps} />
          <circle cx="19" cy="5" r="2" fill={color} />
        </svg>
      );

    case "interpretability":
      return (
        <svg {...common}>
          <path d="M12 3a7 7 0 0 0-4 12.75V19h8v-3.25A7 7 0 0 0 12 3Z" {...strokeProps} />
          <path d="M9 22h6" {...strokeProps} />
          <path d="M10 19h4" {...strokeProps} />
          <path d="M9.5 10.5h5" {...strokeProps} />
          <path d="M12 8v5" {...strokeProps} />
        </svg>
      );

    case "annotations":
      return (
        <svg {...common}>
          <path d="M5 4h10l4 4v12H5V4Z" {...strokeProps} />
          <path d="M15 4v4h4" {...strokeProps} />
          <path d="M8 13h8" {...strokeProps} />
          <path d="M8 17h5" {...strokeProps} />
          <path d="M8 9h3" {...strokeProps} />
        </svg>
      );

    default:
      return null;
  }
};

function ReferenceAnalysisNav({
  C,
  active,
  setActive,
  onBackDashboard,
  onOpenRecordings,
  onGoToReport,
  interpretabilityDisabled = false,
  theme = C?.dark ? "dark" : "light",
  setTheme,
}) {
  const go = (key) => {
    if (key === "dashboard") {
      if (setActive) setActive("dashboard");
      if (onBackDashboard) onBackDashboard();
      return;
    }

    if (key === "recordings") {
      if (setActive) setActive("recordings");
      if (onOpenRecordings) onOpenRecordings();
      return;
    }

    if (setActive) setActive(key);
  };

  const items = [
    ["dashboard", "1", "Dashboard", "dashboard"],
    ["recordings", "2", "Analyses", "recordings"],
    ["live", "3", "Live Prediction", "live"],
    ["interpretability", "4", "Interpretability", "interpretability"],
    ["annotations", "5", "Annotations / Report", "annotations"],
  ];

  const NavButton = ({ item }) => {
    const [key, num, label, iconType] = item;
    const isActive =
      active === key || (active === "report" && key === "annotations");
    const disabled = key === "interpretability" && interpretabilityDisabled;

    const iconColor = isActive ? C.green : C.dim;

    return (
      <button
        type="button"
        onClick={() => !disabled && go(key)}
        disabled={disabled}
        title={
          disabled
            ? "Run live prediction first. Interpretability opens after the first prediction arrives."
            : label
        }
        style={{
          minHeight: 36,
          borderRadius: 8,
          border: `1px solid ${
            isActive ? hexToRgba(C.green, 0.5) : "transparent"
          }`,
          background: isActive ? hexToRgba(C.green, 0.13) : "transparent",
          color: isActive ? C.green : C.muted,
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 8px",
          fontSize: 10.5,
          fontWeight: isActive ? 900 : 720,
          lineHeight: 1.2,
          width: "100%",
          opacity: disabled ? 0.45 : 1,
          transition: "background 160ms ease, border 160ms ease, color 160ms ease",
        }}
      >
        <span
          style={{
            width: 22,
            minWidth: 22,
            height: 22,
            borderRadius: 7,
            display: "grid",
            placeItems: "center",
            color: iconColor,
            background: isActive ? hexToRgba(C.green, 0.12) : "transparent",
          }}
        >
          <Icon type={iconType} size={16.5} color={iconColor} />
        </span>

        <span style={{ overflowWrap: "anywhere" }}>{label}</span>
      </button>
    );
  };

  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout?.();
    } finally {
      setLoggingOut(false);
    }
  };

  const displayName = user?.name || user?.email || "Account";
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

  const footerBtn = {
    width: "100%",
    minHeight: 34,
    borderRadius: 7,
    border: `1px solid ${C.border}`,
    background: C.panel2,
    color: C.text,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "7px 8px",
    fontSize: 10.5,
    fontWeight: 850,
  };

  return (
    <aside
      style={{
        width: 168,
        minWidth: 168,
        border: `1px solid ${C.border}`,
        background: C.dark ? "#06111D" : "#FFFFFF",
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: "12px 10px",
          borderBottom: `1px solid ${C.line}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
          background: C.dark
            ? `linear-gradient(135deg, ${hexToRgba(
                C.green,
                0.12
              )}, rgba(6,17,29,0.95))`
            : `linear-gradient(135deg, ${hexToRgba(C.green, 0.10)}, #FFFFFF)`,
        }}
      >
        

        <div style={{ minWidth: 0, lineHeight: 1.05 }}>
          <div
            style={{
              color: C.text,
              fontWeight: 950,
              fontSize: 20,
              letterSpacing: "-0.35px",
              whiteSpace: "nowrap",
            }}
          >
            NeuroDecipher
          </div>

          <div
            style={{
              color: C.green,
              fontSize: 9.5,
              fontWeight: 800,
              marginTop: 3,
              letterSpacing: "0.7px",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Clinical EEG Analysis
          </div>
        </div>
      </div>

      <nav
        style={{
          padding: 8,
          display: "grid",
          gap: 5,
          flex: "1 1 auto",
          minHeight: 0,
          alignContent: "start",
          overflowY: "auto",
        }}
      >
        {items.map((item, index) => (
          <div key={item[0]}>
            {index === 2 && (
              <div
                style={{
                  height: 1,
                  background: C.line,
                  margin: "4px 0",
                }}
              />
            )}
            <NavButton item={item} />
          </div>
        ))}
      </nav>

      <div
        style={{
          marginTop: "auto",
          flexShrink: 0,
          borderTop: `1px solid ${C.line}`,
          padding: 8,
          display: "grid",
          gap: 7,
          justifyItems: "center",
          background: C.dark
            ? "rgba(3,10,20,.38)"
            : "rgba(248,250,252,.88)",
        }}
      >
        <div
          style={{
            width: "92%",
            display: "grid",
            gap: 6,
            border: `1px solid ${C.border}`,
            background: C.panel2,
            borderRadius: 7,
            padding: "6px 7px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span
              style={{
                width: 18,
                height: 18,
                minWidth: 18,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: hexToRgba(C.green, 0.16),
                color: C.green,
                border: `1px solid ${hexToRgba(C.green, 0.4)}`,
                fontSize: 9,
                fontWeight: 900,
                flexShrink: 0,
              }}
            >
              {initial}
            </span>
            <span
              title={displayName}
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: C.text,
                fontSize: 9.5,
                fontWeight: 800,
              }}
            >
              {displayName}
            </span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sign out"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              width: "100%",
              minHeight: 22,
              borderRadius: 6,
              border: `1px solid ${hexToRgba(C.red, 0.4)}`,
              background: loggingOut ? hexToRgba(C.red, 0.1) : hexToRgba(C.red, 0.14),
              color: C.red,
              fontSize: 9.5,
              fontWeight: 800,
              cursor: loggingOut ? "default" : "pointer",
              opacity: loggingOut ? 0.7 : 1,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setTheme?.(theme === "dark" ? "light" : "dark")}
          style={{ ...footerBtn, width: "92%" }}
          title="Toggle light/dark theme"
        >
          {theme === "dark" ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <span>{theme === "dark" ? "Light theme" : "Dark theme"}</span>
        </button>
      </div>
    </aside>
  );
}

export { ReferenceAnalysisNav };