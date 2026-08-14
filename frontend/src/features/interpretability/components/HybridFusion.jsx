import { hexToRgba } from "../../../components/utils.js";
import { clamp01, isSeizure, safeArr } from "./InterpretabilityUtils.js";

function HybridFusion({ C, data }) {
  const hasData = data && (data.donut || data.matrix || data.summary);

  if (!hasData) {
    return (
      <div
        style={{
          height: 250,
          display: "grid",
          placeItems: "center",
          color: C.muted,
          fontSize: 12,
          textAlign: "center",
          border: `1px dashed ${C.line}`,
          borderRadius: 8,
          background: C.panel2,
          padding: 16,
        }}
      >
        Hybrid fusion data not available yet.
        <br />
        Run prediction first or select an analyzed EEG segment.
      </div>
    );
  }

  const donut = data.donut || {};
  const summary = data.summary || {};
  const matrix = safeArr(data.matrix);

  const ai = clamp01(donut.ai_contribution);
  const rule = clamp01(donut.rule_contribution);
  const context = clamp01(
    donut.context_contribution ?? Math.max(0, 1 - ai - rule)
  );

  const total = ai + rule + context || 1;
  const aiP = ai / total;
  const ruleP = rule / total;
  const contextP = context / total;

  const r = 43;
  const circ = 2 * Math.PI * r;

  const aiLen = aiP * circ;
  const ruleLen = ruleP * circ;
  const contextLen = contextP * circ;

  const rows = matrix.length
    ? matrix
    : [
        { system: "AI", ai: 1.0, rules: 0.0, hybrid: 0.0 },
        { system: "Rules", ai: 0.0, rules: 1.0, hybrid: 0.0 },
        { system: "Hybrid", ai: 0.0, rules: 0.0, hybrid: 1.0 },
      ];

  const finalDecision = summary.final_decision || summary.hybrid_label || "Pending";

  const isSz = isSeizure(finalDecision || summary.hybrid_label);

  const cellValue = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : String(v ?? "—");
  };

  const donutLabelStyle = {
    fill: "#FFFFFF",
    fontWeight: 950,
    textAnchor: "middle",
    paintOrder: "stroke",
    stroke: "rgba(0,0,0,0.65)",
    strokeWidth: 2.8,
    strokeLinejoin: "round",
  };

  const donutPercentStyle = {
    fill: "#FFFFFF",
    fontWeight: 850,
    textAnchor: "middle",
    paintOrder: "stroke",
    stroke: "rgba(0,0,0,0.65)",
    strokeWidth: 2.4,
    strokeLinejoin: "round",
  };

  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "minmax(140px, auto) auto",
        gap: 8,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "165px minmax(0, 1fr)",
          gap: 12,
          alignItems: "center",
          minWidth: 0,
        }}
      >
        {/* LEFT: Evidence Donut */}
        <div
          style={{
            minWidth: 0,
            display: "grid",
            justifyItems: "center",
            alignContent: "center",
          }}
        >
          <div
            style={{
              color: C.text,
              fontSize: 9,
              fontWeight: 900,
              textAlign: "center",
              marginBottom: 3,
            }}
          >
            Evidence Contribution
          </div>

          <svg
            viewBox="0 0 140 140"
            style={{
              width: 158,
              height: 132,
              display: "block",
            }}
          >
            <circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={C.dark ? "#102235" : "#E2E8F0"}
              strokeWidth="24"
            />

            <circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={C.red}
              strokeWidth="24"
              strokeDasharray={`${aiLen} ${circ}`}
              strokeDashoffset="0"
              transform="rotate(-90 70 70)"
            />

            <circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={C.orange}
              strokeWidth="24"
              strokeDasharray={`${ruleLen} ${circ}`}
              strokeDashoffset={-aiLen}
              transform="rotate(-90 70 70)"
            />

            <circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={C.green}
              strokeWidth="24"
              strokeDasharray={`${contextLen} ${circ}`}
              strokeDashoffset={-(aiLen + ruleLen)}
              transform="rotate(-90 70 70)"
            />

            <circle cx="70" cy="70" r="25" fill={C.panel} />

            {/* Bigger, clearer graph text */}
            <text
              x="39"
              y="69"
              fontSize="12"
              {...donutLabelStyle}
            >
              AI
            </text>
            <text
              x="39"
              y="84"
              fontSize="10.5"
              {...donutPercentStyle}
            >
              {Math.round(aiP * 100)}%
            </text>

            <text
              x="102"
              y="75"
              fontSize="10.5"
              {...donutLabelStyle}
            >
              Rules
            </text>
            <text
              x="102"
              y="89"
              fontSize="10"
              {...donutPercentStyle}
            >
              {Math.round(ruleP * 100)}%
            </text>

            <text
              x="73"
              y="28"
              fontSize="9.5"
              {...donutLabelStyle}
            >
              Context
            </text>
            <text
              x="73"
              y="40"
              fontSize="9"
              {...donutPercentStyle}
            >
              {Math.round(contextP * 100)}%
            </text>
          </svg>

          <div
            style={{
              color: C.text,
              fontSize: 8,
              textAlign: "center",
              marginTop: 0,
            }}
          >
            Context{" "}
            <span style={{ color: C.green, fontWeight: 900 }}>
              ⇧ {Math.round(contextP * 100)}%
            </span>
          </div>
        </div>

        {/* RIGHT: Agreement Matrix */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: C.text,
              fontSize: 9,
              fontWeight: 900,
              textAlign: "center",
              marginBottom: 6,
            }}
          >
            Agreement Matrix
          </div>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 9,
              color: C.text,
              tableLayout: "fixed",
              background: C.panel2,
              borderRadius: 7,
              overflow: "hidden",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    width: 54,
                    padding: "6px 5px",
                    border: `1px solid ${C.line}`,
                    color: C.muted,
                    fontWeight: 850,
                  }}
                />
                {["AI", "Rules", "Hybrid"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "6px 5px",
                      border: `1px solid ${C.line}`,
                      color: C.text,
                      fontWeight: 850,
                      textAlign: "center",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td
                    style={{
                      padding: "7px 5px",
                      border: `1px solid ${C.line}`,
                      color: C.text,
                      fontWeight: 850,
                      background: hexToRgba(C.muted, 0.04),
                    }}
                  >
                    {r.system}
                  </td>

                  <td
                    style={{
                      padding: "7px 5px",
                      border: `1px solid ${C.line}`,
                      textAlign: "center",
                    }}
                  >
                    {cellValue(r.ai)}
                  </td>

                  <td
                    style={{
                      padding: "7px 5px",
                      border: `1px solid ${C.line}`,
                      textAlign: "center",
                    }}
                  >
                    {cellValue(r.rules)}
                  </td>

                  <td
                    style={{
                      padding: "7px 5px",
                      border: `1px solid ${C.line}`,
                      textAlign: "center",
                    }}
                  >
                    {cellValue(r.hybrid)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* BOTTOM SUMMARY */}
      <div
        style={{
          border: `1px solid ${C.line}`,
          borderRadius: 7,
          overflow: "hidden",
          background: C.panel2,
        }}
      >
        {[
          ["Fusion Strategy", summary.fusion_strategy || "Weighted Evidence Fusion"],
          ["Final Decision", finalDecision],
        ].map(([label, value], i) => (
          <div
            key={label}
            style={{
              display: "grid",
              gridTemplateColumns: "120px minmax(0, 1fr)",
              gap: 8,
              padding: "7px 9px",
              borderBottom: i < 2 ? `1px solid ${C.line}` : "none",
              alignItems: "center",
            }}
          >
            <div
              style={{
                color: C.text,
                fontSize: 9,
                fontWeight: 850,
              }}
            >
              {label}
            </div>

            <div
              style={{
                color:
                  label === "Final Decision"
                    ? isSz
                      ? C.green
                      : C.text
                    : C.text,
                fontSize: label === "Final Decision" ? 10.5 : 9.5,
                fontWeight: label === "Final Decision" ? 950 : 650,
                overflowWrap: "anywhere",
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default HybridFusion;
export { HybridFusion };