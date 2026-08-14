import { panelSurface } from "../../../theme/ndThemeTokens.js";

const statusText = item => typeof item === "string" ? item : (item?.status || "not active");
const statusNote = item => typeof item === "string" ? "" : (item?.note || "");

export default function ModelStatusPanel({ C, modelStatus = {} }) {
  const statusColor = status => String(statusText(status) || "").toLowerCase() === "active" ? C.accent : C.orange;
  return (
    <div style={{ ...panelSurface(C), padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 850, marginBottom: 12 }}>Model Status</div>
      {["AI Model", "Rule Engine", "Hybrid Engine", "Database"].map(name => {
        const key = name === "AI Model" ? "aiModel" : name === "Rule Engine" ? "ruleEngine" : name === "Hybrid Engine" ? "hybridEngine" : "database";
        const st = modelStatus[key] || { status: "not active" };
        return (
          <div key={name} style={{ padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
              <span style={{ color: C.muted }}>{name}</span>
              <strong style={{ color: statusColor(st), textTransform: "capitalize" }}>{statusText(st)}</strong>
            </div>
            {statusNote(st) && <div style={{ marginTop: 3, color: C.dim, fontSize: 10, lineHeight: 1.35 }}>{statusNote(st)}</div>}
          </div>
        );
      })}
    </div>
  );
}
