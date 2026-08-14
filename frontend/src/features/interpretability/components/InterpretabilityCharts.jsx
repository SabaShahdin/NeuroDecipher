import { fmtT } from "../../../constants.js";
import { hexToRgba } from "../../../components/utils.js";
import { clamp01, pct, labelText, cleanCh, safeArr, isSeizure } from "./InterpretabilityUtils.js";

function LineChart({ C, rows, selectedSegment = null, heightPx = 210 }) {
  const width = 520;
  const height = 210;
  const padL = 42;
  const padR = 14;
  const padT = 28;
  const padB = 34;

  const list = safeArr(rows);
  const maxT = Math.max(1, ...list.map((r, i) => Number(r.time ?? r.start ?? i)));

  const series = [
    ["aiConfidence", C.red, "AI"],
    ["ruleConfidence", C.orange, "Rule"],
    ["hybridConfidence", C.green, "Hybrid"],
  ];

  const pathFor = (key) =>
    list
      .map((r, i) => {
        const x = padL + (Number(r.time ?? r.start ?? i) / maxT) * (width - padL - padR);
        const y = height - padB - clamp01(r[key]) * (height - padT - padB);
        return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const onset = list.find((r) => isSeizure(r.event_marker || r.label || r.hybridLabel));
  const onsetX = onset
    ? padL + (Number(onset.time ?? onset.start ?? 0) / maxT) * (width - padL - padR)
    : null;

  const selected = selectedSegment != null
    ? list.find((r) => Number(r.segment ?? r.index) === Number(selectedSegment))
    : null;
  const selectedX = selected
    ? padL + (Number(selected.time ?? selected.start ?? selected.segment ?? 0) / maxT) * (width - padL - padR)
    : null;
  const selectedW = selected
    ? Math.max(4, ((Number(selected.end ?? selected.time ?? selected.start ?? 0) - Number(selected.start ?? selected.time ?? 0)) / maxT) * (width - padL - padR))
    : 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{
        width: "100%",
        height: heightPx,
        display: "block" }}
    >
      <rect width={width} height={height} fill="transparent" />

      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = height - padB - p * (height - padT - padB);
        return (
          <g key={p}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y}
              y2={y}
              stroke={hexToRgba(C.muted, 0.14)}
            />
            <text x="8" y={y + 3} fill={C.muted} fontSize="9">
              {Math.round(p * 100)}
            </text>
          </g>
        );
      })}

      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const x = padL + p * (width - padL - padR);
        return (
          <line
            key={`x-${p}`}
            x1={x}
            x2={x}
            y1={padT}
            y2={height - padB}
            stroke={hexToRgba(C.muted, 0.08)}
          />
        );
      })}

      {series.map(([key, color]) => (
        <path
          key={key}
          d={pathFor(key)}
          fill="none"
          stroke={color}
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {selectedX != null && (
        <g>
          <rect
            x={Math.max(padL, selectedX)}
            y={padT}
            width={selectedW || 7}
            height={height - padT - padB}
            fill={hexToRgba(C.purple, 0.10)}
            stroke={hexToRgba(C.purple, 0.45)}
          />
          <line
            x1={selectedX}
            x2={selectedX}
            y1={padT}
            y2={height - padB}
            stroke={C.purple}
            strokeDasharray="3 3"
          />
          <text
            x={Math.min(width - 102, selectedX + 7)}
            y={height - padB - 5}
            fill={C.purple}
            fontSize="9"
            fontWeight="850"
          >
            Selected #{selected.segment ?? selected.index ?? selectedSegment}
          </text>
          {series.map(([key, color]) => {
            const y = height - padB - clamp01(selected[key]) * (height - padT - padB);
            return <circle key={`selected-${key}`} cx={selectedX} cy={y} r="3.4" fill={color} stroke={C.panel || "white"} strokeWidth="1.2" />;
          })}
        </g>
      )}

      {onsetX != null && (
        <g>
          <line
            x1={onsetX}
            x2={onsetX}
            y1={padT}
            y2={height - padB}
            stroke={C.red}
            strokeDasharray="4 4"
          />
          <text
            x={Math.min(width - 92, onsetX + 7)}
            y={padT + 12}
            fill={C.red}
            fontSize="9"
            fontWeight="850"
          >
            Seizure Onset
          </text>
        </g>
      )}

      <g transform="translate(46,10)">
        {series.map(([key, color, label], i) => (
          <g key={key} transform={`translate(${i * 72},0)`}>
            <rect width="9" height="9" rx="2" fill={color} />
            <text x="14" y="9" fill={C.text} fontSize="9" fontWeight="750">
              {label}
            </text>
          </g>
        ))}
      </g>

      <text x={width / 2} y={height - 8} fill={C.muted} fontSize="9" textAnchor="middle">
        Time
      </text>
    </svg>
  );
}

function HorizontalBars({ C, rows, color, labelKey = "channel", valueKey = "importance_score", heightPx = 190, mode = "single" }) {
  const list = safeArr(rows).slice(0, 8).map((r, i) => ({ ...r, rank: r.rank ?? i + 1 }));

  if (!list.length) {
    return (
      <div style={{ height: heightPx, display: "grid", placeItems: "center", color: C.muted, fontSize: 12, border: `1px dashed ${C.line}`, borderRadius: 8, background: C.panel2, textAlign: "center", padding: 12 }}>
        Channel importance is not available yet.<br />Run prediction or select an analyzed segment.
      </div>
    );
  }

  const max = Math.max(1, ...list.map((r) => Number(r[valueKey] ?? r.hybrid_score ?? r.value ?? r.score ?? 0)));
  const showHybrid = mode === "hybrid" || list.some((r) => r.ai_score != null || r.rule_score != null || r.hybrid_score != null);


  return (
    <div
      style={{
        height: heightPx,
        display: "grid",
        alignContent: "start",
        gap: 6,
        minWidth: 0,
        overflowY: "auto",
        overflowX: "hidden",
        paddingTop: 2,
        paddingRight: 2 }}
    >
      {list.map((r, i) => {
        const v = Number(r[valueKey] ?? r.hybrid_score ?? r.value ?? r.score ?? 0);
        const ai = clamp01(r.ai_score ?? v);
        const rule = clamp01(r.rule_score ?? v);
        const hy = clamp01(r.hybrid_score ?? v);
        return (
          <div key={`${r.channel || i}-${i}`} title={`${r.channel || r[labelKey]} · Hybrid ${Math.round(hy*100)}%${r.top_driver ? ` · ${r.top_driver}` : ""}`} style={{ display: "grid", gridTemplateColumns: "54px 1fr 36px", gap: 8, alignItems: "center" }}>
            <div style={{ color: C.text, fontSize: 10, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r[labelKey] || r.channel || r.feature_name || r.feature}
            </div>
            <div style={{ display: "grid", gap: showHybrid ? 2 : 0 }}>
              {showHybrid ? (
                <>
                  <div style={{ height: 4, background: hexToRgba(C.red, .10), borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${Math.max(2, ai*100)}%`, height: "100%", background: C.red }} /></div>
                  <div style={{ height: 4, background: hexToRgba(C.orange, .10), borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${Math.max(2, rule*100)}%`, height: "100%", background: C.orange }} /></div>
                  <div style={{ height: 5, background: hexToRgba(C.purple, .10), borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${Math.max(2, hy*100)}%`, height: "100%", background: C.purple }} /></div>
                </>
              ) : (
                <div style={{ height: 13, background: "transparent", borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.max(2, (v / max) * 100)}%`, background: color }} /></div>
              )}
            </div>
            <div style={{ color: C.text, fontSize: 10, textAlign: "right", fontFamily: "'Roboto', Arial, sans-serif" }}>{Number.isFinite(v) ? v.toFixed(2) : v}</div>
          </div>
        );
      })}
      {showHybrid && <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 8, marginTop: 2 }}><span style={{ color: C.red }}>AI</span><span style={{ color: C.orange }}>Rule</span><span style={{ color: C.purple }}>Hybrid</span></div>}
      {!showHybrid && <><div style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 8, paddingLeft: 62, paddingRight: 34, marginTop: 2 }}><span>0</span><span>0.25</span><span>0.50</span><span>0.75</span><span>1.00</span></div><div style={{ color: C.muted, fontSize: 8, textAlign: "center", marginTop: -4 }}>Importance Score</div></>}
    </div>
  );
}

function Topography({ C, points }) {
  const list = safeArr(points).slice(0, 24);
  const W = 260, H = 190, cx = 120, cy = 92, R = 72;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 190, display: "block" }}>
      <circle cx={cx} cy={cy} r={R} fill={hexToRgba(C.blue, 0.18)} stroke={C.text} />
      <path d={`M${cx - 16} ${cy - R} Q${cx} ${cy - R - 20} ${cx + 16} ${cy - R}`} fill="none" stroke={C.text} />
      {list.map((p, i) => {
        const x = cx + Number(p.x_coord ?? p.x ?? 0) * R;
        const y = cy + Number(p.y_coord ?? p.y ?? 0) * R;
        const v = clamp01(p.activation_value ?? p.value);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={7 + v * 9} fill={v > 0.66 ? C.red : v > 0.33 ? C.orange : C.blue} opacity={0.8} />
            <text x={x} y={y + 3} fill="white" fontSize="7" textAnchor="middle">{cleanCh(p.electrode || p.channel).slice(0, 3)}</text>
          </g>
        );
      })}
      <text x={W - 48} y="28" fill={C.red} fontSize="9">High</text>
      <text x={W - 48} y={H - 24} fill={C.blue} fontSize="9">Low</text>
    </svg>
  );
}

function Spectrogram({ C, spec }) {
  const values = safeArr(spec?.values);
  const rows = values.length;
  const cols = Math.max(1, ...values.map((r) => safeArr(r).length));
  return (
    <svg viewBox="0 0 360 180" style={{ width: "100%", height: 190, display: "block" }}>
      <rect width="360" height="180" fill={C.dark ? "#06111D" : "#F8FAFC"} />
      {values.map((row, y) =>
        safeArr(row).map((v, x) => (
          <rect key={`${x}-${y}`} x={34 + x * (300 / cols)} y={10 + y * (140 / Math.max(rows, 1))} width={Math.ceil(300 / cols) + 0.5} height={Math.ceil(140 / Math.max(rows, 1)) + 0.5} fill={`rgba(${Math.round(40 + 220 * clamp01(v))},${Math.round(30 + 120 * clamp01(v))},${Math.round(180 - 160 * clamp01(v))},.9)`} />
        ))
      )}
      <text x="8" y="84" fill={C.muted} fontSize="9" transform="rotate(-90 8,84)">Frequency</text>
      <text x="160" y="174" fill={C.muted} fontSize="9">Time</text>
    </svg>
  );
}

function BandPower({ C, rows, heightPx = 205 }) {
  const list = safeArr(rows);
  const bands = ["Delta", "Theta", "Alpha", "Beta", "Gamma"];
  const stages = ["Pre-ictal", "Ictal", "Post-ictal"];
  const colors = [C.blue, C.red, C.green];

  const hasData = list.some((r) => Number(r.power_value ?? r.relative_power ?? r.value ?? 0) > 0);
  if (!hasData) {
    return (
      <div
        style={{
          height: heightPx,
          display: "grid",
          placeItems: "center",
          color: C.muted,
          fontSize: 11,
          textAlign: "center",
          border: `1px dashed ${C.line}`,
          borderRadius: 8,
          background: C.panel2,
          padding: 12 }}
      >
        Band power data is not available yet.
        <br />
        Run prediction or select an analyzed EEG segment.
      </div>
    );
  }

  const get = (band, stage) => {
    const r =
      list.find((x) => (x.band || x.label) === band && (x.stage || "Ictal") === stage) ||
      list.find((x) => (x.band || x.label) === band);
    return Number(r?.power_value ?? r?.relative_power ?? r?.value ?? 0);
  };

  const W = 390;
  const H = 205;
  const padL = 34;
  const padR = 16;
  const padT = 24;
  const padB = 35;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(0.05, ...bands.flatMap((b) => stages.map((s) => get(b, s))));
  const groupW = plotW / bands.length;
  const barW = Math.min(12, groupW / 5);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: heightPx, display: "block" }}
    >
      <rect width={W} height={H} fill="transparent" />

      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padT + (1 - p) * plotH;
        return (
          <g key={p}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke={hexToRgba(C.muted, 0.14)} />
            <text x="5" y={y + 3} fill={C.muted} fontSize="8">
              {Math.round(p * 100)}
            </text>
          </g>
        );
      })}

      {bands.map((band, i) => {
        const x0 = padL + i * groupW + groupW / 2 - (stages.length * barW + (stages.length - 1) * 3) / 2;
        return (
          <g key={band}>
            {stages.map((stage, j) => {
              const v = get(band, stage);
              const h = Math.max(1, (v / max) * plotH);
              const x = x0 + j * (barW + 3);
              const y = padT + plotH - h;
              return (
                <rect
                  key={`${band}-${stage}`}
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx="2"
                  fill={colors[j]}
                >
                  <title>{`${band} · ${stage}: ${(v * 100).toFixed(1)}% relative power`}</title>
                </rect>
              );
            })}
            <text x={padL + i * groupW + groupW / 2} y={H - 13} fill={C.text} fontSize="8.5" textAnchor="middle" fontWeight="750">
              {band}
            </text>
          </g>
        );
      })}

      <text x="12" y={padT + plotH / 2} fill={C.muted} fontSize="8" textAnchor="middle" transform={`rotate(-90 12 ${padT + plotH / 2})`}>
        Relative power
      </text>

      <g transform="translate(72,7)">
        {stages.map((stage, i) => (
          <g key={stage} transform={`translate(${i * 88},0)`}>
            <rect width="8" height="8" rx="2" fill={colors[i]} />
            <text x="12" y="8" fill={C.text} fontSize="8" fontWeight="750">
              {stage}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function ShapContributionChart({ C, rows, heightPx = 205 }) {
  const list = safeArr(rows)
    .map((r) => ({
      feature: r.feature_name || r.feature || "Feature",
      value: Number(r.shap_value ?? r.impact ?? r.contribution ?? 0),
      direction: r.impact_direction || r.direction || "backend-derived contribution",
      rawValue: r.raw_value,
      normValue: r.normalized_value }))
    .filter((r) => Number.isFinite(r.value))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 8);

  if (!list.length) {
    return (
      <div
        style={{
          height: heightPx,
          display: "grid",
          placeItems: "center",
          color: C.muted,
          fontSize: 11,
          textAlign: "center",
          border: `1px dashed ${C.line}`,
          borderRadius: 8,
          background: C.panel2,
          padding: 12 }}
      >
        SHAP-like feature contribution data is not available yet.
        <br />
        Select an analyzed segment after backend prediction finishes.
      </div>
    );
  }

  const maxAbs = Math.max(0.05, ...list.map((r) => Math.abs(r.value)));
  return (
    <div
      style={{
        height: heightPx,
        display: "grid",
        alignContent: "center",
        gap: 7,
        minWidth: 0 }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "92px 1fr 42px",
          gap: 8,
          color: C.muted,
          fontSize: 8.5,
          fontWeight: 850 }}
      >
        <span>Feature</span>
        <span style={{ textAlign: "center" }}>Negative ← Contribution → Positive</span>
        <span style={{ textAlign: "right" }}>Value</span>
      </div>

      {list.map((r, i) => {
        const pos = r.value >= 0;
        const w = Math.max(3, (Math.abs(r.value) / maxAbs) * 48);
        return (
          <div
            key={`${r.feature}-${i}`}
            title={`${r.feature}: ${r.value.toFixed(3)} · ${r.direction}${r.rawValue != null ? ` · raw=${r.rawValue}` : ""}`}
            style={{
              display: "grid",
              gridTemplateColumns: "92px 1fr 42px",
              gap: 8,
              alignItems: "center",
              minWidth: 0 }}
          >
            <div
              style={{
                color: C.text,
                fontSize: 9.5,
                fontWeight: 850,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap" }}
            >
              {r.feature}
            </div>

            <div
              style={{
                position: "relative",
                height: 14,
                background: hexToRgba(C.muted, 0.08),
                borderRadius: 4,
                overflow: "hidden" }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: hexToRgba(C.text, 0.42) }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  bottom: 2,
                  left: pos ? "50%" : `${50 - w}%`,
                  width: `${w}%`,
                  background: pos ? C.red : C.green,
                  borderRadius: 3 }}
              />
            </div>

            <div
              style={{
                color: pos ? C.red : C.green,
                fontSize: 9.5,
                fontWeight: 900,
                textAlign: "right" }}
            >
              {r.value.toFixed(2)}
            </div>
          </div>
        );
      })}

      <div style={{ color: C.muted, fontSize: 8, textAlign: "center", marginTop: 2 }}>
        Positive values support seizure; negative values support non-seizure/background.
      </div>
    </div>
  );
}

export { LineChart, HorizontalBars, Topography, Spectrogram, BandPower, ShapContributionChart };
