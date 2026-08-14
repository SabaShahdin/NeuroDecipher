import { fmtT } from "../../../constants.js";
import { safeArr } from "./InterpretabilityUtils.js";

function RuleTable({ C, rows }) {
  const RULE_LABELS = {
    S1: "Spike Amplitude",
    S2: "Rhythmic Discharge",
    S3: "Spike Density",
    S4: "Duration",
    S5: "Evolution Pattern",
    S6: "Spatial Spread",
    S7: "Artifact Check",
    S8: "Background Suppression",
    B1: "Normal Background Rhythm",
    B2: "Borderline Background",
    B3: "Low Artifact Background" };

  const list = safeArr(rows).map((r, i) => {
    const rawId = String(r.rule_id || r.id || r.code || `R${i + 1}`).toUpperCase();
    const displayId = rawId.startsWith("S") || rawId.startsWith("B") ? `R${i + 1}` : rawId;
    const mappedName = RULE_LABELS[rawId];
    return {
      rule_id: displayId,
      rule_name: r.rule_name || r.description || r.name || mappedName || "Clinical Rule",
      value: r.value ?? r.computed_value ?? r.score ?? "—",
      threshold: r.threshold ?? r.limit ?? r.cutoff ?? "Required",
      status: r.status || (r.triggered === false ? "Passed" : "Triggered"),
      timestamp: r.timestamp || fmtT(r.start_time ?? r.start) };
  });

  if (!list.length) {
    return (
      <div
        style={{
          height: 238,
          display: "grid",
          placeItems: "center",
          color: C.muted,
          fontSize: 12,
          border: `1px dashed ${C.line}`,
          borderRadius: 8,
          background: C.panel2 }}
      >
        Rule trigger details not available.
      </div>
    );
  }

  const headers = ["Rule", "Description", "Value", "Threshold", "Status", "Time"];
  const colWidths = [42, "31%", "15%", "18%", "15%", "15%"];

  const cellBase = {
    padding: "7px 8px",
    borderBottom: `1px solid ${C.line}`,
    borderRight: `1px solid ${C.line}`,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    verticalAlign: "middle" };

  return (
    <div
      className="nd-scrollbar"
      style={{
        height: 238,
        maxHeight: 238,
        overflowY: "auto",
        overflowX: "auto",
        borderRadius: 7,
        border: `1px solid ${C.line}`,
        background: C.panel2 }}
    >
      <table
        style={{
          width: "100%",
          minWidth: 650,
          borderCollapse: "collapse",
          tableLayout: "fixed",
          color: C.text,
          fontSize: 10 }}
      >
        <thead style={{ position: "sticky", top: 0, zIndex: 2, background: C.panel2 }}>
          <tr>
            {headers.map((h, i) => (
              <th
                key={h}
                style={{
                  ...cellBase,
                  width: colWidths[i],
                  color: C.muted,
                  fontWeight: 850,
                  textAlign: "left",
                  borderRight: i === headers.length - 1 ? "none" : cellBase.borderRight }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {list.map((r, i) => {
            const status = String(r.status || "").toLowerCase();
            const ok = status.includes("trigger") || status.includes("pass");
            return (
              <tr key={`${r.rule_id}-${i}`}>
                <td style={cellBase}>{r.rule_id}</td>
                <td title={r.rule_name} style={cellBase}>{r.rule_name}</td>
                <td title={String(r.value)} style={cellBase}>{r.value}</td>
                <td title={String(r.threshold)} style={cellBase}>{r.threshold}</td>
                <td
                  style={{
                    ...cellBase,
                    color: ok ? C.green : C.muted,
                    fontWeight: 850 }}
                >
                  {r.status}
                </td>
                <td style={{ ...cellBase, borderRight: "none" }}>{r.timestamp}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default RuleTable;
export { RuleTable };
