import React from "react";
import {
  Database,
  CheckCircle2,
  Activity,
  Clock3,
} from "lucide-react";

const DEFAULT_STATS = [
  {
    key: "recordings",
    icon: Database,
    label: "Analyses",
    colorKey: "blue",
  },
  {
    key: "analysed",
    icon: CheckCircle2,
    label: "Analysed",
    colorKey: "cyan",
  },
  {
    key: "seizure",
    icon: Activity,
    label: "Seizure Positive",
    colorKey: "red",
  },
  {
    key: "pending",
    icon: Clock3,
    label: "Pending Review",
    colorKey: "purple",
  },
];

export default function RecordingStatsGrid({ C, stats = {}, loading }) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0,1fr))",
        gap: 14,
      }}
    >
      {DEFAULT_STATS.map(({ key, icon: Icon, label, colorKey }) => {
        const color = C[colorKey] || C.blue;

        return (
          <div
            key={key}
            style={{
              border: `1px solid ${C.line}`,
              background: C.panel2,
              borderRadius: 14,
              padding: "15px 16px",
              minHeight: 96,
              display: "flex",
              gap: 13,
              alignItems: "center",
              boxShadow: C.dark
                ? "inset 0 1px 0 rgba(255,255,255,.04)"
                : "0 10px 24px rgba(37,99,235,.07)",
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
              <Icon size={22} strokeWidth={2.2} />
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  color: C.muted,
                  fontWeight: 850,
                  lineHeight: 1.2,
                }}
              >
                {label}
              </div>

              <div
                style={{
                  marginTop: 5,
                  fontSize: 27,
                  color: C.text,
                  fontWeight: 950,
                  letterSpacing: "-0.7px",
                  lineHeight: 1,
                }}
              >
                {loading ? "—" : stats[key] ?? 0}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}