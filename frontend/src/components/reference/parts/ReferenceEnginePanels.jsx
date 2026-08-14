import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { API, apiHeaders, fmtT, WIN_OPTS, CH_H, PLOTLY_MARGIN } from "../../../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "../../utils.js";

function ReferenceEngineCard({ C, title, borderColor, children }) {
  return <section style={{ border: `1px solid ${hexToRgba(borderColor,.75)}`, background: C.panel, borderRadius: 10, overflow: "visible", boxShadow: C.dark ? "0 10px 28px rgba(0,0,0,.18)" : "0 10px 26px rgba(15,23,42,.08)", minWidth: 0 }}>
    <div style={{ minHeight: 36, display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${hexToRgba(borderColor,.25)}`, color: C.text, fontSize: 12, fontWeight: 950, lineHeight: 1.25, overflowWrap: "anywhere" }}>{title}</div>
    <div style={{ padding: 12, minWidth: 0 }}>{children}</div>
  </section>;
}

function ReferenceConfidenceRing({ C, value, color }) {
  const p = asPctNumber(value);
  return <div style={{ width: 62, height: 62, borderRadius: "50%", display: "grid", placeItems: "center", background: `conic-gradient(${color} ${p}%, ${C.dark ? "#13263A" : "#E2E8F0"} 0)`, padding: 4 }}>
    <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: C.panel3, display: "grid", placeItems: "center", color, fontWeight: 900, fontSize: 15 }}>{Math.round(p)}%</div>
  </div>;
}

function ReferenceInfoRow({ C, label, value, color }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr)", gap: 8, alignItems: "start", padding: "5px 0", borderTop: `1px solid ${C.line}` }}>
      <div style={{ color: C.dim, fontSize: 9, fontWeight: 800, fontFamily: "'Roboto', Arial, sans-serif" }}>{label}</div>
      <div style={{ color: color || C.text, fontSize: 10.5, lineHeight: 1.45, overflowWrap: "anywhere", wordBreak: "normal" }}>{value}</div>
    </div>
  );
}

function ReferenceProgress({ C, value, color }) {
  const n = asPctNumber(value);
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <div style={{ height: 8, borderRadius: 99, background: C.dark ? "#13263A" : "#E2E8F0", overflow: "hidden" }}>
        <div style={{ width: `${n}%`, minWidth: n > 0 ? 4 : 0, height: "100%", background: color, borderRadius: 99 }} />
      </div>
      <div style={{ color, fontWeight: 950, fontSize: 12, fontFamily: "'Roboto', Arial, sans-serif" }}>{Math.round(n)}%</div>
    </div>
  );
}
function ReferenceEnginePanels({
  C,
  events = [],
  ruleEvents = [],
  edits = {},
  currentTime,
  windowSize,
  selectedSegmentIndex,
  onJump,
  onSelectSegment,
  phase }) {
  const bundles = useMemo(
    () => buildSegmentBundles(events, ruleEvents, edits),
    [events, ruleEvents, edits]
  );

  const bundle = pickBundleForTime(
    bundles,
    currentTime + (windowSize || 0) / 2,
    selectedSegmentIndex
  );

  const ai = bundle?.ai || null;
  const rule = bundle?.rule || null;

  const normalizeLabel = (label) => {
    if (!label) return "pending";
    const value = String(label).toLowerCase();
    if (value.includes("seizure")) return "seizure";
    if (
      value.includes("bckg") ||
      value.includes("background") ||
      value.includes("normal") ||
      value.includes("non-seizure")
    ) {
      return "background";
    }
    if (value.includes("pending")) return "pending";
    return value;
  };

  const predictionText = (label) => {
    const normalized = normalizeLabel(label);
    if (normalized === "seizure") return "Seizure";
    if (normalized === "background") return "Non-seizure";
    return "Pending";
  };

  const aiLabel = normalizeLabel(bundle?.aiLabel || ai?.label);
  const ruleLabel = normalizeLabel(rule?.label);
  const hybridRawLabel = normalizeLabel(rule?.hybrid_label);

  const aiSubtype =
    ai?.ai_subtype_full ||
    ai?.ai_subtype ||
    ai?.subtype_full ||
    ai?.subtype ||
    "";

  const ruleSubtype =
    rule?.rule_subtype_full ||
    rule?.rule_subtype ||
    rule?.subtype_full ||
    rule?.subtype ||
    "";

  const aiConf = Number(ai?.confidence ?? ai?.prob ?? 0);
  const ruleConf = Number(rule?.confidence ?? rule?.rule_subtype_confidence ?? 0);
  const hyConf = Number(rule?.hybrid_confidence ?? 0);

  const finalHybridLabel =
    hybridRawLabel !== "pending"
      ? hybridRawLabel
      : ai && rule && aiLabel === ruleLabel
      ? aiLabel
      : hyConf > 0.75
      ? "seizure"
      : ai || rule
      ? "background"
      : "pending";

  const finalSubtype =
    finalHybridLabel === "seizure"
      ? aiSubtype || ruleSubtype || "Subtype pending"
      : "No seizure subtype";

  const finalColor =
    finalHybridLabel === "seizure"
      ? C.red
      : finalHybridLabel === "background"
      ? C.green
      : C.dim;

  const agreement =
    ai && rule
      ? aiLabel === ruleLabel
        ? "Strong agreement"
        : aiLabel === finalHybridLabel || ruleLabel === finalHybridLabel
        ? "Partial agreement"
        : "Disagreement"
      : "Awaiting pair";

  const reviewPriority =
    finalHybridLabel === "seizure"
      ? "High priority"
      : agreement === "Disagreement"
      ? "Review advised"
      : "Routine";

  const certainty =
    hyConf >= 0.9
      ? "Highly certain"
      : hyConf >= 0.75
      ? "Probable"
      : hyConf >= 0.55
      ? "Uncertain"
      : "Low confidence";

  const segText = bundle ? `Segment ${Number(bundle.index) + 1}` : "No segment";

  const segDuration = bundle
    ? Number(bundle.end ?? 0) - Number(bundle.start ?? 0)
    : 0;

  const segRange = bundle
    ? `${fmtT(bundle.start)}–${fmtT(bundle.end)} · ${segDuration.toFixed(1)}s`
    : "Select a segment";

  const jump = () => {
    if (!bundle) return;
    onSelectSegment?.(bundle.index, bundle.start);
    onJump?.(bundle.start);
  };

  const safeRules = Array.isArray(rule?.rules) ? rule.rules : [];
  const subtypeRules = Array.isArray(rule?.rule_subtype_rules) ? rule.rule_subtype_rules : [];

  const RULE_NAME_MAP = {
    S1: "Spike amplitude",
    S2: "Rhythmic discharge",
    S5: "Evolution pattern",
    B1: "Normal alpha/background",
    B2: "Borderline background",
    B3: "Low seizure evidence",
    FN1: "Focal spike-slow evidence",
    FN2: "Focal rhythmic pattern",
    FN3: "Focal ictal band ratio",
    FN4: "Amplitude evolution",
    FN5: "Frequency evolution",
    FN6: "Focal spatial spread",
    FN7: "Moderate synchrony",
    GN1: "Generalized spike-slow",
    GN2: "Generalized rhythmicity",
    GN5: "Generalized spatial spread",
    GN6: "High synchrony",
    CP1: "Complex partial focal evidence",
    CP2: "Complex partial rhythmicity",
    CP6: "Complex partial focal spread" };

  const getRuleCode = (r, fallback = "") => String(r?.id || r?.rule_id || r?.code || r?.rule || fallback || "").toUpperCase();
  const getReadableRuleName = (r, i) => {
    const code = getRuleCode(r, `R${i + 1}`);
    return r?.display_name || r?.displayName || r?.name || r?.rule_name || RULE_NAME_MAP[code] || code || `Rule ${i + 1}`;
  };

  const getRuleValue = (r) => {
    const value = r?.value ?? r?.score ?? r?.confidence ?? r?.metric ?? r?.actual;
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") {
      if (Math.abs(value) <= 1) return `${Math.round(value * 100)}%`;
      return value.toFixed(2);
    }
    return String(value);
  };

  const getRuleThreshold = (r) => {
    const threshold = r?.threshold ?? r?.limit ?? r?.cutoff;
    if (threshold === null || threshold === undefined || threshold === "") return null;
    if (typeof threshold === "number") {
      if (Math.abs(threshold) <= 1) return `${Math.round(threshold * 100)}%`;
      return threshold.toFixed(2);
    }
    return String(threshold);
  };

  const getRuleChannels = (r) => {
    const channels =
      r?.channels ||
      r?.channel_names ||
      r?.affected_channels ||
      r?.affectedChannels ||
      [];
    if (!Array.isArray(channels) || channels.length === 0) return "";
    return channels.slice(0, 3).join(", ");
  };

  const isTriggeredRule = (r) => {
    const status = r?.status ?? r?.triggered ?? r?.passed ?? r?.active ?? r?.is_active ?? r?.fired ?? true;
    const txt = String(status).toLowerCase();
    return status === true || status === 1 || txt === "true" || txt === "triggered" || txt === "passed";
  };

  const detectionRuleChips = safeRules
    .filter((r) => /^(S|B)/.test(getRuleCode(r)) && isTriggeredRule(r))
    .slice(0, 4);

  const subtypeRuleChips = subtypeRules
    .filter((r) => isTriggeredRule(r))
    .slice(0, 4);

  const triggeredRules = detectionRuleChips;
  const ruleChips = [...detectionRuleChips, ...subtypeRuleChips];

  const detectionEvidence = [];

  if (ai) {
    detectionEvidence.push({
      source: "AI",
      color: C.red,
      title:
        aiLabel === "seizure"
          ? "AI predicted seizure"
          : aiLabel === "background"
          ? "AI predicted non-seizure"
          : "AI prediction pending",
      detail: [
        aiSubtype ? `Subtype: ${aiSubtype}` : null,
        ai?.confidence != null ? `Confidence: ${pct(ai.confidence)}` : null,
        ai?.prob != null ? `Probability: ${pct(ai.prob)}` : null,
      ]
        .filter(Boolean)
        .join(" · ") });
  }

  if (triggeredRules.length > 0) {
    triggeredRules.slice(0, 2).forEach((r, i) => {
      const value = getRuleValue(r);
      const threshold = getRuleThreshold(r);
      const channels = getRuleChannels(r);

      detectionEvidence.push({
        source: "Rule",
        color: C.orange,
        title: getReadableRuleName(r, i),
        detail: [
          value ? `Value ${value}` : null,
          threshold ? `Threshold ${threshold}` : null,
          channels ? `Ch ${channels}` : null,
        ]
          .filter(Boolean)
          .join(" · ") });
    });
  } else if (rule) {
    detectionEvidence.push({
      source: "Rule",
      color: C.orange,
      title:
        ruleLabel === "seizure"
          ? "Rule engine detected seizure pattern"
          : "No strong rule activation",
      detail: ruleSubtype || "Evidence below seizure threshold" });
  }

  if (ai && rule) {
    detectionEvidence.push({
      source: "Hybrid",
      color: C.purple,
      title:
        agreement === "Strong agreement"
          ? "AI and rule are concordant"
          : agreement === "Partial agreement"
          ? "Hybrid follows stronger evidence"
          : "AI and rule disagree",
      detail: `Final decision: ${predictionText(finalHybridLabel)}` });
  }

  const PredictionRow = ({ name, label, confidence, color, subtype, note }) => {
    const n = asPctNumber(confidence);
    const normalized = normalizeLabel(label);
    const resultColor =
      normalized === "seizure"
        ? C.red
        : normalized === "background"
        ? C.green
        : C.dim;

    return (
      <div
        style={{
          border: `1px solid ${C.line}`,
          background: C.dark ? "rgba(7,17,31,.55)" : "rgba(248,250,252,.92)",
          borderRadius: 8,
          padding: "7px 8px",
          display: "grid",
          gap: 5,
          minWidth: 0 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color,
                fontSize: 8.5,
                fontWeight: 950,
                fontFamily: "'Roboto', Arial, sans-serif",
                textTransform: "uppercase",
                letterSpacing: ".05em" }}
            >
              {name}
            </div>

            <div
              style={{
                marginTop: 2,
                color: resultColor,
                fontSize: 11.5,
                fontWeight: 900,
                lineHeight: 1.2,
                overflowWrap: "anywhere" }}
            >
              {predictionText(normalized)}
            </div>
          </div>

          <div
            style={{
              color,
              fontSize: 12.5,
              fontWeight: 950,
              fontFamily: "'Roboto', Arial, sans-serif",
              whiteSpace: "nowrap" }}
          >
            {Math.round(n)}%
          </div>
        </div>

        <div
          style={{
            height: 4,
            background: C.dark ? "#13263A" : "#E2E8F0",
            borderRadius: 99,
            overflow: "hidden" }}
        >
          <div
            style={{
              width: `${n}%`,
              minWidth: n > 0 ? 3 : 0,
              height: "100%",
              background: color }}
          />
        </div>

        <div
          style={{
            color: C.muted,
            fontSize: 8.8,
            lineHeight: 1.3,
            overflowWrap: "anywhere" }}
        >
          <b style={{ color: C.dim }}>Subtype:</b>{" "}
          {normalized === "seizure" ? subtype || "Subtype pending" : "Not applicable"}
        </div>

        {note && (
          <div
            style={{
              color: C.dim,
              fontSize: 8.4,
              lineHeight: 1.25,
              overflowWrap: "anywhere" }}
          >
            {note}
          </div>
        )}
      </div>
    );
  };

  return (
   <aside
  style={{
    flex: "0 0 clamp(205px, 13.5vw, 232px)",
    minWidth: 205,
    maxWidth: 232,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 6,
    borderLeft: `1px solid ${C.border}`,
    background: C.panel3,
    overflowY: "auto",
    overflowX: "hidden",
    fontFamily: "'Roboto', Arial, sans-serif" }}
>
      

      <section
        style={{
          border: `1px solid ${hexToRgba(finalColor, 0.58)}`,
          background: C.panel,
          borderRadius: 11,
          padding: 9,
          display: "grid",
          gap: 8 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "54px minmax(0,1fr)",
            gap: 9,
            alignItems: "center" }}
        >
          <ReferenceConfidenceRing C={C} value={hyConf} color={finalColor} />

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: C.muted,
                fontSize: 8,
                fontWeight: 850,
                fontFamily: "'Roboto', Arial, sans-serif",
                textTransform: "uppercase",
                letterSpacing: ".05em" }}
            >
              Hybrid Decision
            </div>

            <div
              style={{
                color: finalColor,
                fontSize: 14,
                fontWeight: 950,
                marginTop: 2,
                lineHeight: 1.15,
                overflowWrap: "anywhere" }}
            >
              {predictionText(finalHybridLabel)}
            </div>

            <div style={{ color: C.muted, fontSize: 8.7, marginTop: 2, lineHeight: 1.3 }}>
              <b style={{ color: C.dim }}>Subtype:</b>{" "}
              {finalHybridLabel === "seizure" ? finalSubtype : "Not applicable"}
            </div>

            <div style={{ color: C.muted, fontSize: 8.5, marginTop: 2 }}>
              {certainty}
            </div>
          </div>
        </div>
      </section>

      

      <PredictionRow
        name="AI"
        label={aiLabel}
        confidence={aiConf}
        color={C.red}
        subtype={aiSubtype}
        note="Model output"
      />

      <PredictionRow
        name="Rule"
        label={ruleLabel}
        confidence={ruleConf}
        color={C.orange}
        subtype={ruleSubtype}
        note="Rule engine output"
      />

      <PredictionRow
        name="Hybrid"
        label={finalHybridLabel}
        confidence={hyConf}
        color={C.purple}
        subtype={finalSubtype}
        note={`α=${rule?.alpha ?? 0.5} · ${
          agreement === "Strong agreement" ? "consistent evidence" : "clinician review advised"
        }`}
      />

      {!!ruleChips.length && (
        <section
          style={{
            border: `1px solid ${C.line}`,
            background: C.panel,
            borderRadius: 9,
            padding: 8,
            display: "grid",
            gap: 7 }}
        >
          <div style={{ color: C.text, fontSize: 10.2, fontWeight: 950 }}>
            Rule Conditions
          </div>

          {!!detectionRuleChips.length && (
            <div>
              <div style={{ color: C.dim, fontSize: 8, fontWeight: 900, marginBottom: 4, textTransform: "uppercase", fontFamily: "'Roboto', Arial, sans-serif" }}>Seizure evidence</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {detectionRuleChips.map((r, i) => (
                  <span key={`det-${getReadableRuleName(r, i)}-${i}`} title={`${getRuleCode(r)} · ${getReadableRuleName(r, i)}`} style={{ border: `1px solid ${hexToRgba(C.orange, 0.24)}`, background: hexToRgba(C.orange, 0.08), color: C.orange, borderRadius: 99, padding: "3px 6px", fontSize: 8, fontWeight: 820, maxWidth: "100%", overflowWrap: "anywhere" }}>
                    {getRuleCode(r)} · {getReadableRuleName(r, i)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!!subtypeRuleChips.length && finalHybridLabel === "seizure" && (
            <div>
              <div style={{ color: C.dim, fontSize: 8, fontWeight: 900, marginBottom: 4, textTransform: "uppercase", fontFamily: "'Roboto', Arial, sans-serif" }}>Subtype evidence</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {subtypeRuleChips.map((r, i) => (
                  <span key={`sub-${getReadableRuleName(r, i)}-${i}`} title={`${getRuleCode(r)} · ${getReadableRuleName(r, i)}`} style={{ border: `1px solid ${hexToRgba(C.purple, 0.26)}`, background: hexToRgba(C.purple, 0.08), color: C.purple, borderRadius: 99, padding: "3px 6px", fontSize: 8, fontWeight: 820, maxWidth: "100%", overflowWrap: "anywhere" }}>
                    {getRuleCode(r)} · {getReadableRuleName(r, i)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <button
        onClick={jump}
        disabled={!bundle}
        style={{
          minHeight: 28,
          borderRadius: 8,
          border: `1px solid ${hexToRgba(C.purple, 0.45)}`,
          background: bundle ? hexToRgba(C.purple, 0.12) : "transparent",
          color: bundle ? C.purple : C.dim,
          cursor: bundle ? "pointer" : "not-allowed",
          width: "100%",
          fontSize: 9.5,
          fontWeight: 900 }}
      >
        Center on segment
      </button>
    </aside>
  );
}

export { ReferenceEngineCard, ReferenceConfidenceRing, ReferenceInfoRow, ReferenceProgress, ReferenceEnginePanels };
export default ReferenceEnginePanels;
