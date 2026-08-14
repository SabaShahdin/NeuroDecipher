import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { API, apiHeaders, fmtT, WIN_OPTS, CH_H, PLOTLY_MARGIN } from "../../../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "../../utils.js";

function ReferenceLegendBadge({ color, label, dash = "solid" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "transparent",
        borderRadius: 4,
        padding: "2px 6px" }}
    >
      <svg width="18" height="8" style={{ flexShrink: 0 }}>
        <line
          x1="1"
          y1="4"
          x2="17"
          y2="4"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dash === "dash" ? "4 2" : dash === "dot" ? "2 2" : "none"}
        />
      </svg>
      <span
        style={{
          fontSize: 9,
          fontFamily: "'Roboto', Arial, sans-serif",
          fontWeight: 750,
          color,
          letterSpacing: ".03em" }}
      >
        {label}
      </span>
    </div>
  );
}

function ReferenceTimelineStack({
  C,
  eegData,
  colorMap = {},
  selectedCh,
  events = [],
  ruleEvents = [],
  edits = {},
  totalDur,
  timeOffset,
  windowSize,
  selectedSegmentIndex,
  onSelectSegment,
  onSeek }) {
  const bundles = useMemo(
    () => buildSegmentBundles(events, ruleEvents, edits),
    [events, ruleEvents, edits]
  );

  if (!totalDur) {
    return (
      <div
        style={{
          height: 176,
          minHeight: 176,
          background: C.panel3 }}
      />
    );
  }

  const channels = eegData?.channels || [];
  const rawChannel =
    selectedCh && channels.includes(selectedCh)
      ? selectedCh
      : channels[0] || selectedCh;

  const selectedRawColor =
    rawChannel && colorMap?.[rawChannel]
      ? colorMap[rawChannel]
      : C.trace || C.raw || C.green || "#22C55E";

  const selectedBundle = bundles.find((b) => b.index === selectedSegmentIndex);

  const isSeizureLabel = (label) => {
    const v = String(label || "").toLowerCase();
    if (["gnsz", "fnsz", "cpsz", "seiz", "sz"].includes(v)) return true;
    return v.includes("seizure") && !v.includes("non-seizure");
  };

  const isNormalLabel = (label) => {
    const v = String(label || "").toLowerCase();
    return (
      v.includes("bckg") ||
      v.includes("background") ||
      v.includes("normal") ||
      v.includes("non-seizure")
    );
  };

  const cleanText = (value) =>
    String(value || "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const annotationShortLabel = (value) => {
    const text = cleanText(value).toLowerCase();

    if (!text) return "SZ";
    if (text.includes("complex partial") || text.includes("cpsz")) return "CPSZ";
    if (text.includes("focal non") || text.includes("fnsz")) return "FNSZ";
    if (
      text.includes("generalized non") ||
      text.includes("generalised non") ||
      text.includes("gnsz")
    ) {
      return "GNSZ";
    }
    if (text.includes("focal")) return "FSZ";
    if (text.includes("general") || text.includes("generalised")) return "GSZ";
    if (text.includes("seizure")) return "SZ";

    return (
      text
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0]?.toUpperCase())
        .join("")
        .slice(0, 5) || "SZ"
    );
  };

  const getSubtype = (ev, source) => {
    if (!ev) return "";

    if (source === "ai") {
      return cleanText(
        ev.ai_subtype_full ||
          ev.ai_subtype ||
          ev.subtype_full ||
          ev.subtype ||
          ev.type
      );
    }

    if (source === "rule") {
      return cleanText(
        ev.rule_subtype_full ||
          ev.rule_subtype ||
          ev.subtype_full ||
          ev.subtype ||
          ev.type
      );
    }

    return cleanText(
      ev.hybrid_subtype_full ||
        ev.hybrid_subtype ||
        ev.ai_subtype_full ||
        ev.rule_subtype_full ||
        ev.subtype_full ||
        ev.subtype ||
        ev.type
    );
  };

  const pctLeft = (t) => `${(Number(t || 0) / totalDur) * 100}%`;

  const pctWidth = (start, end, min = 0.8) =>
    `${Math.max(
      ((Number(end || 0) - Number(start || 0)) / totalDur) * 100,
      min
    )}%`;

  const seekFromClick = (e) => {
    const b = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width));
    onSeek?.(x * totalDur);
  };

  const aiItems = events.map((ev) => {
    const label = edits?.[ev.index]?.label ?? ev.label;
    return {
      ...ev,
      label,
      positive: isSeizureLabel(label),
      normal: isNormalLabel(label) };
  });

  const ruleItems = ruleEvents.map((ev) => ({
    ...ev,
    label: ev.label,
    positive: isSeizureLabel(ev.label),
    normal: isNormalLabel(ev.label) }));

  const hybridItems = ruleEvents.map((ev) => ({
    ...ev,
    label: ev.hybrid_label,
    positive: isSeizureLabel(ev.hybrid_label),
    normal: isNormalLabel(ev.hybrid_label) }));

  const annotationItems = bundles.map((b) => {
    const edit = edits?.[b.index] || {};
    const finalLabel =
      edit.label ??
      b.rule?.hybrid_label ??
      b.aiLabel ??
      b.ai?.label ??
      b.rule?.label ??
      "segment";

    const text =
      cleanText(edit.note) ||
      cleanText(
        b.rule?.hybrid_subtype_full ||
          b.rule?.hybrid_subtype ||
          b.ai?.ai_subtype_full ||
          b.ai?.ai_subtype ||
          b.ai?.subtype_full ||
          b.ai?.subtype ||
          b.rule?.rule_subtype_full ||
          b.rule?.rule_subtype ||
          b.rule?.subtype_full ||
          b.rule?.subtype
      ) ||
      finalLabel ||
      "Segment";

    return {
      index: b.index,
      start: b.start,
      end: b.end,
      label: finalLabel,
      text,
      positive: isSeizureLabel(finalLabel) || isSeizureLabel(text),
      normal: isNormalLabel(finalLabel) || isNormalLabel(text),
    };
  });

  const rawPoints = (() => {
    const data = eegData?.data || [];
    const times = eegData?.times || [];

    if (!channels.length || !data.length || !times.length) return "";

    let idx = rawChannel ? channels.indexOf(rawChannel) : -1;
    if (idx < 0) idx = 0;

    const arr = data[idx] || [];
    if (!arr.length) return "";

    const n = 240;
    const step = Math.max(1, Math.floor(arr.length / n));
    const sampled = [];

    for (let i = 0; i < arr.length; i += step) {
      sampled.push(Number(arr[i] || 0));
    }

    if (sampled.length < 2) return "";

    const mn = Math.min(...sampled);
    const mx = Math.max(...sampled);
    const span = Math.max(1e-9, mx - mn);

    return sampled
      .slice(0, n)
      .map((v, i) => {
        const x = (i / Math.max(1, n - 1)) * 1000;
        const y = 82 - ((v - mn) / span) * 58;
        return `${x},${y}`;
      })
      .join(" ");
  })();

  const RowShell = ({ label, children, height = 25 }) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "116px 1fr",
        alignItems: "center",
        height }}
    >
      <div
        style={{
          color: C.text,
          fontSize: 10.5,
          fontWeight: 900,
          fontFamily: "'Roboto', Arial, sans-serif",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          opacity: 1 }}
      >
        {label}
      </div>

      <div
        onClick={seekFromClick}
        style={{
          position: "relative",
          height: height - 6,
          background: "transparent",
          border: "none",
          overflow: "visible",
          cursor: "pointer" }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            height: 1,
            transform: "translateY(-50%)",
            background: hexToRgba(C.muted, C.dark ? 0.36 : 0.24),
            pointerEvents: "none" }}
        />
        {children}
      </div>
    </div>
  );

  const SeizureRect = ({ ev, source, color, height = 7 }) => {
    const selected = ev.index === selectedSegmentIndex;

    if (!ev.positive && !selected) return null;

    const subtype = getSubtype(ev, source);

    return (
      <button
        key={`${source}-${ev.index}-${ev.start}-${ev.end}`}
        onClick={(click) => {
          click.stopPropagation();
          onSelectSegment?.(ev.index, ev.start);
        }}
        title={`${source.toUpperCase()} · ${
          ev.positive ? "Seizure" : "Selected segment"
        }${subtype ? ` · ${subtype}` : ""} · ${fmtT(ev.start)}–${fmtT(ev.end)}`}
        style={{
          position: "absolute",
          left: pctLeft(ev.start),
          width: pctWidth(ev.start, ev.end, 1),
          top: "50%",
          height: selected ? height + 3 : height,
          transform: "translateY(-50%)",
          border: selected ? `1.5px solid ${C.text}` : `1px solid ${color}`,
          background: ev.positive ? color : "transparent",
          borderRadius: 3,
          cursor: "pointer",
          padding: 0,
          opacity: ev.positive ? 1 : 0.18,
          boxShadow: "none",
          filter: "none" }}
      />
    );
  };

  const AnnotationSeizureBadge = ({ ev }) => {
    const selected = ev.index === selectedSegmentIndex;
    const label = annotationShortLabel(ev.text || ev.label || "Seizure");

    return (
      <button
        key={`ann-seizure-${ev.index}-${ev.start}`}
        onClick={(click) => {
          click.stopPropagation();
          onSelectSegment?.(ev.index, ev.start);
        }}
        title={`Annotation: ${cleanText(ev.text || ev.label || "Seizure")} · ${fmtT(ev.start)}–${fmtT(ev.end)}`}
        style={{
          position: "absolute",
          left: pctLeft(ev.start),
          width: pctWidth(ev.start, ev.end, 1),
          top: "50%",
          transform: "translateY(-50%)",
          height: selected ? 20 : 18,
          minWidth: 8,
          padding: 0,
          border: selected ? `1.5px solid ${C.text}` : `1px solid ${C.dark ? "#D9A908" : (C.yellow || "#FACC15")}`,
          background: C.dark ? "#D9A908" : (C.yellow || "#FACC15"),
          color: C.dark ? "#111827" : "#1F2937",
          borderRadius: 4,
          fontSize: 8,
          fontWeight: 900,
          fontFamily: "'Roboto', Arial, sans-serif",
          cursor: "pointer",
          overflow: "hidden",
          textOverflow: "clip",
          zIndex: 7,
          boxShadow: selected ? `0 0 0 1px ${hexToRgba(C.text, 0.24)}` : "none",
        }}
      >
        <span style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>{label}</span>
      </button>
    );
  };

  const AnnotationNormalRect = ({ ev }) => {
    const selected = ev.index === selectedSegmentIndex;

    return (
      <button
        key={`ann-normal-${ev.index}-${ev.start}`}
        onClick={(click) => {
          click.stopPropagation();
          onSelectSegment?.(ev.index, ev.start);
        }}
        title={`Annotation: Normal/background · ${fmtT(ev.start)}–${fmtT(ev.end)}`}
        style={{
          position: "absolute",
          left: pctLeft(ev.start),
          width: pctWidth(ev.start, ev.end, 1),
          top: "50%",
          height: selected ? 10 : 8,
          transform: "translateY(-50%)",
          border: selected ? `1.5px solid ${C.text}` : `1px solid ${C.green}`,
          background: C.green,
          borderRadius: 3,
          cursor: "pointer",
          padding: 0,
          opacity: 1,
          boxShadow: "none",
          filter: "none",
          zIndex: 2 }}
      />
    );
  };

  return (
    <div
      style={{
        height: 188,
        minHeight: 188,
        maxHeight: 188,
        border: "none",
        
        padding: "14px 12px 4px",
        fontFamily: "'Roboto', Arial, sans-serif",
        position: "relative",
        overflow: "hidden" }}
    >
      

      <div style={{ position: "relative", zIndex: 2 }}>
        <RowShell label="AI Detection" height={25}>
          {aiItems.map((ev) => (
            <SeizureRect
              key={`ai-${ev.index}-${ev.start}`}
              ev={ev}
              source="ai"
              color={C.red}
              height={7}
            />
          ))}
        </RowShell>

        <RowShell label="Rule Trigger" height={25}>
          {ruleItems.map((ev) => (
            <SeizureRect
              key={`rule-${ev.index}-${ev.start}`}
              ev={ev}
              source="rule"
              color={C.orange}
              height={7}
            />
          ))}
        </RowShell>

        <RowShell label="Hybrid Decision" height={25}>
          {hybridItems.map((ev) => (
            <SeizureRect
              key={`hybrid-${ev.index}-${ev.start}`}
              ev={ev}
              source="hybrid"
              color={C.purple}
              height={8}
            />
          ))}
        </RowShell>

        <RowShell label="Annotations" height={29}>
          {annotationItems.map((ev) => {
            if (ev.normal) {
              return <AnnotationNormalRect key={`ann-n-${ev.index}`} ev={ev} />;
            }

            if (ev.positive) {
              return <AnnotationSeizureBadge key={`ann-s-${ev.index}`} ev={ev} />;
            }

            return null;
          })}
        </RowShell>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "116px 1fr",
            alignItems: "center",
            height: 52,
            marginTop: 6 }}
        >
          <div
            style={{
              color: C.text,
              fontSize: 10.5,
              fontWeight: 900,
              fontFamily: "'Roboto', Arial, sans-serif",
              whiteSpace: "nowrap",
              opacity: 1 }}
          >
            Raw Signal
            {rawChannel && (
              <span
                style={{
                  marginLeft: 5,
                  color: C.dark ? "#B7DBFF" : selectedRawColor,
                  fontSize: 9,
                  fontWeight: 900 }}
              >
                {String(rawChannel)
                  .replace(/^EEG\s+/i, "")
                  .replace(/-LE$/i, "")
                  .replace(/-REF$/i, "")
                  .replace(/-AVG$/i, "")}
              </span>
            )}
          </div>

          <div
            onClick={seekFromClick}
            style={{
              position: "relative",
              height: 42,
              border: "none",
              borderRadius: 5,
              background: C.dark ? "rgba(4,15,28,.86)" : hexToRgba(selectedRawColor, 0.10),
              overflow: "hidden",
              cursor: "pointer" }}
          >
            <svg
              viewBox="0 0 1000 100"
              preserveAspectRatio="none"
              style={{
                width: "100%",
                height: "100%",
                display: "block" }}
            >
              <polyline
                fill="none"
                stroke={selectedRawColor}
                strokeWidth="2.6"
                points={
                  rawPoints ||
                  Array.from(
                    { length: 120 },
                    (_, i) =>
                      `${i * 8.45},${
                        52 + Math.sin(i * 0.7) * 15 + Math.sin(i * 2.9) * 6
                      }`
                  ).join(" ")
                }
              />
            </svg>

            {bundles
              .filter((b) => {
                const finalLabel =
                  edits?.[b.index]?.label ??
                  b.rule?.hybrid_label ??
                  b.aiLabel ??
                  b.ai?.label ??
                  b.rule?.label;
                return isSeizureLabel(finalLabel);
              })
              .map((b) => (
                <div
                  key={`raw-${b.index}`}
                  style={{
                    position: "absolute",
                    left: pctLeft(b.start),
                    width: pctWidth(b.start, b.end, 0.8),
                    top: 0,
                    bottom: 0,
                    background: hexToRgba(C.red, C.dark ? 0.22 : 0.12),
                    pointerEvents: "none" }}
                />
              ))}

            <div
              style={{
                position: "absolute",
                left: `${(timeOffset / totalDur) * 100}%`,
                width: 3,
                top: 0,
                bottom: 0,
                background: C.red,
                pointerEvents: "none" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export { ReferenceLegendBadge, ReferenceTimelineStack };
export default ReferenceTimelineStack;
