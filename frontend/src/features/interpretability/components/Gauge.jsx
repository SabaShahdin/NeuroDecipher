import { clamp01, labelText, safeArr, isSeizure, cleanCh } from "./InterpretabilityUtils.js";
import { hexToRgba } from "../../../components/utils.js";
import { fmtT } from "../../../constants.js";

function Gauge({ C, title, label, value, color, meta, submeta }) {
  const p = clamp01(value);

  return (
    <div
      style={{
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        padding: "12px 12px 11px",
        minWidth: 0,
        height: "100%",
        background: C.panel2,
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: 8,
        overflow: "hidden" }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: C.text,
            fontSize: 9.5,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: ".04em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis" }}
        >
          {title}
        </div>

        <div
          style={{
            color,
            fontSize: 15,
            fontWeight: 950,
            marginTop: 7,
            lineHeight: 1.15,
            overflowWrap: "anywhere" }}
        >
          {labelText(label)}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "72px minmax(0, 1fr)",
          gap: 11,
          alignItems: "center",
          minWidth: 0 }}
      >
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: "50%",
            background: `conic-gradient(${color} ${p * 360}deg, ${
              C.dark ? "#102235" : "#E2E8F0"
            } 0deg)`,
            display: "grid",
            placeItems: "center",
            flexShrink: 0 }}
        >
          <div
            style={{
              width: 49,
              height: 49,
              borderRadius: "50%",
              background: C.panel2,
              display: "grid",
              placeItems: "center",
              color,
              fontSize: 15,
              fontWeight: 950 }}
          >
            {Math.round(p * 100)}%
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: C.muted,
              fontSize: 10,
              lineHeight: 1.45,
              overflowWrap: "anywhere" }}
          >
            {meta}
          </div>

          {submeta && (
            <div
              style={{
                color,
                fontSize: 10.5,
                fontWeight: 850,
                marginTop: 6,
                lineHeight: 1.35,
                overflowWrap: "anywhere" }}
            >
              {submeta}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}function EegAttentionViewer({
  C,
  signal,
  events,
  selectedSegment,
  onSelectSegment,
  heightPx = 420 }) {
  const channels = safeArr(signal?.channels).slice(0, 19);
  const data = safeArr(signal?.data).slice(0, channels.length);
  const times = safeArr(signal?.times);

  const duration =
    Number(signal?.duration || times.at?.(-1) || 0) ||
    Math.max(...safeArr(events).map((e) => Number(e.end || e.end_time || 0)), 1);

  const width = 980;
  const left = 70;
  const right = 18;

  // Tight viewer spacing
  const top = 0;
  const bottom = 12;

  // Use the full available height for channels
  const innerH = Math.max(1, heightPx - top - bottom);
  const rowH = channels.length ? innerH / channels.length : 18;

  const height = heightPx;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const eventsRows = safeArr(events);

  const selected =
    selectedSegment != null
      ? eventsRows.find((e) => Number(e.segment ?? e.index) === Number(selectedSegment))
      : null;

  const seizureEvents = eventsRows.filter((e) =>
    isSeizure(e.finalLabel || e.hybridLabel || e.aiLabel || e.event_type || e.type || e.label)
  );

  const linePath = (arr, row) => {
    const vals = safeArr(arr);
    if (!vals.length) return "";

    const step = Math.max(1, Math.floor(vals.length / 560));
    const sampled = [];

    for (let i = 0; i < vals.length; i += step) {
      sampled.push(Number(vals[i] || 0));
    }

    const mean = sampled.reduce((a, b) => a + b, 0) / (sampled.length || 1);

    const std =
      Math.sqrt(
        sampled.reduce((a, b) => a + (b - mean) * (b - mean), 0) /
          (sampled.length || 1)
      ) || 1;

    const y0 = top + row * rowH + rowH / 2;

    return sampled
      .slice(0, 620)
      .map((v, i) => {
        const x = left + (i / Math.max(1, sampled.length - 1)) * plotW;

        // Dynamic gain based on row height so traces fill the viewer cleanly
        const y = y0 - ((v - mean) / std) * Math.min(4.2, rowH * 0.22);

        return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const clickSvg = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xInSvg = ((e.clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (xInSvg - left) / plotW));
    const t = ratio * duration;

    const found = eventsRows.find(
      (ev) =>
        t >= Number(ev.start ?? ev.start_time ?? 0) &&
        t <= Number(ev.end ?? ev.end_time ?? 0)
    );

    if (found) onSelectSegment?.(Number(found.segment ?? found.index ?? 0));
  };

  const firstSeizure = seizureEvents[0];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "block",
        cursor: "crosshair",
        flex: 1 }}
      onClick={clickSvg}
    >
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        fill={C.gridBg || C.panel2}
      />

      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line
          key={p}
          x1={left + p * plotW}
          x2={left + p * plotW}
          y1={top}
          y2={top + plotH}
          stroke={hexToRgba(C.muted, p === 0 || p === 1 ? 0.2 : 0.12)}
        />
      ))}

      {seizureEvents.map((ev, i) => {
        const start = Number(ev.start ?? ev.start_time ?? 0);
        const end = Number(ev.end ?? ev.end_time ?? 0);
        const x = left + (start / duration) * plotW;
        const w = Math.max(3, ((end - start) / duration) * plotW);

        return (
          <rect
            key={`sz-${i}`}
            x={x}
            y={top}
            width={w}
            height={plotH}
            fill={hexToRgba(C.red, 0.22)}
            stroke={hexToRgba(C.red, 0.38)}
          />
        );
      })}

      {selected && (
        <rect
          x={left + (Number(selected.start ?? selected.start_time ?? 0) / duration) * plotW}
          y={top}
          width={Math.max(
            4,
            ((Number(selected.end ?? selected.end_time ?? 0) -
              Number(selected.start ?? selected.start_time ?? 0)) /
              duration) *
              plotW
          )}
          height={plotH}
          fill={hexToRgba(C.purple, 0.13)}
          stroke={hexToRgba(C.purple, 0.78)}
        />
      )}

      {channels.map((ch, row) => (
        <g key={ch}>
          <text
            x="14"
            y={top + row * rowH + rowH / 2 + 3.5}
            fill={C.text}
            fontSize="10"
            fontWeight="800"
          >
            {cleanCh(ch)}
          </text>

          <path
            d={linePath(data[row], row)}
            fill="none"
            stroke={row === channels.length - 1 ? C.green : C.trace || C.text}
            strokeWidth={row === channels.length - 1 ? 1.15 : 0.85}
            opacity="0.96"
          />
        </g>
      ))}

      {[0.25, 0.5, 0.75].map((p) => (
        <text
          key={`time-${p}`}
          x={left + p * plotW}
          y={height - 3}
          fill={C.text}
          fontSize="9"
          textAnchor="middle"
        >
          {fmtT(p * duration)}
        </text>
      ))}

      {firstSeizure && (
        <text
          x={left + plotW / 2}
          y={height - 3}
          fill={C.red}
          fontSize="9.5"
          textAnchor="middle"
          fontWeight="900"
        >
          Seizure Detected ({fmtT(firstSeizure.start ?? firstSeizure.start_time)} -{" "}
          {fmtT(firstSeizure.end ?? firstSeizure.end_time)})
        </text>
      )}
    </svg>
  );
}
// function LineChart({ C, rows, heightPx = 190 }) {
//   const width = 420;
//   const height = 172;
//   const padL = 36;
//   const padR = 10;
//   const padT = 26;
//   const padB = 28;
//   const list = safeArr(rows);
//   const maxT = Math.max(1, ...list.map((r, i) => Number(r.time ?? r.start ?? i)));
//   const series = [
//     ["aiConfidence", C.red, "AI Confidence"],
//     ["ruleConfidence", C.orange, "Rule Confidence"],
//     ["hybridConfidence", C.green, "Hybrid Confidence"],
//   ];

//   const pathFor = (key) =>
//     list
//       .map((r, i) => {
//         const x = padL + (Number(r.time ?? r.start ?? i) / maxT) * (width - padL - padR);
//         const y = height - padB - clamp01(r[key]) * (height - padT - padB);
//         return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
//       })
//       .join(" ");

//   const onset = list.find((r) => isSeizure(r.event_marker || r.label || r.hybridLabel));
//   const onsetX = onset ? padL + (Number(onset.time ?? onset.start ?? 0) / maxT) * (width - padL - padR) : null;

//   return (
//     <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: heightPx, display: "block" }}>
//       <rect width={width} height={height} fill="transparent" />
//       {[0, 0.25, 0.5, 0.75, 1].map((p) => {
//         const y = height - padB - p * (height - padT - padB);
//         return (
//           <g key={p}>
//             <line x1={padL} x2={width - padR} y1={y} y2={y} stroke={hexToRgba(C.muted, 0.14)} />
//             <text x="6" y={y + 3} fill={C.muted} fontSize="8">
//               {Math.round(p * 100)}
//             </text>
//           </g>
//         );
//       })}

//       {series.map(([k, c]) => (
//         <path key={k} d={pathFor(k)} fill="none" stroke={c} strokeWidth="2" />
//       ))}

//       {onsetX != null && (
//         <g>
//           <line x1={onsetX} x2={onsetX} y1={padT} y2={height - padB} stroke={C.red} strokeDasharray="3 3" />
//           <text x={onsetX + 5} y={height - padB - 18} fill={C.red} fontSize="8" fontWeight="800">
//             Seizure Onset
//           </text>
//         </g>
//       )}

//       <g transform="translate(42,10)">
//         {series.map(([k, c, label], i) => (
//           <g key={k} transform={`translate(${i * 112},0)`}>
//             <rect width="8" height="8" fill={c} />
//             <text x="12" y="8" fill={C.text} fontSize="8.2">
//               {label}
//             </text>
//           </g>
//         ))}
//       </g>
//     </svg>
//   );
// }

export default Gauge;
export { Gauge, EegAttentionViewer };
