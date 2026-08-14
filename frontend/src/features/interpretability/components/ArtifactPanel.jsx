import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { labelText, safeArr } from "./InterpretabilityUtils.js";

function ArtifactPanel({ C, rows }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>{safeArr(rows).slice(0, 4).map((r, i) => <div key={i} style={{ textAlign: "center", color: C.text }}><div style={{ display: "flex", justifyContent: "center", color: r.detected ? C.orange : C.green }}>{r.detected ? <AlertTriangle size={22} strokeWidth={1.75} /> : <CheckCircle2 size={22} strokeWidth={1.75} />}</div><div style={{ fontSize: 10, fontWeight: 800 }}>{r.artifact_type || r.type}</div><div style={{ fontSize: 9, color: r.severity === "high" ? C.red : r.severity === "moderate" ? C.orange : C.green }}>{labelText(r.severity || "low")}</div></div>)}</div>;
}

export default ArtifactPanel;
export { ArtifactPanel };
