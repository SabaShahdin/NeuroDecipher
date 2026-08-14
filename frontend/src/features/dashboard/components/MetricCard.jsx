import { subPanelSurface } from "../../../theme/ndThemeTokens.js";

export default function MetricCard({ C, loading, icon, label, value, sub, color }) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        background: C.panel,
        borderRadius: 14,
        padding: "14px 15px",
        minHeight: 112,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: C.dark
          ? "0 10px 28px rgba(0,0,0,0.22)"
          : "0 10px 24px rgba(15,23,42,0.06)",
      }}
    >
      {/* Icon + Number Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            minWidth: 42,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            color,
            background: `${color}1F`,
            border: `1px solid ${color}55`,
          }}
        >
          {icon}
        </div>

        <div
          style={{
            fontSize: 30,
            fontWeight: 950,
            color: C.text,
            letterSpacing: "-0.9px",
            lineHeight: 1,
          }}
        >
          {loading ? "—" : value}
        </div>
      </div>

      {/* Label + Subtext */}
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 900,
            color: C.text,
            lineHeight: 1.2,
          }}
        >
          {label}
        </div>

        <div
          style={{
            marginTop: 4,
            fontSize: 11.5,
            fontWeight: 650,
            color: C.muted,
            lineHeight: 1.3,
          }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}
