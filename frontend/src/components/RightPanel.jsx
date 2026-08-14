import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Zap, Ruler, FlaskConical } from "lucide-react";
import { T, CH_COLORS, CH_REGIONS, REGION_ACCENT, STATUS_CFG, SUBTYPE_FULL, SUBTYPE_SHORT, SUBTYPE_COLORS, REGION_ORDER, WIN_OPTS, PLOTLY_MARGIN, fmtT, isoNow, uid, annColor, getRegion } from "../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "./utils.js";
import { StatusBadge, SubtypeBadge, HybridBadge } from "./badges.jsx";
// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENT: RightPanel
// ─────────────────────────────────────────────────────────────────────────────
export default function RightPanel({
  events, edits, audit,
  currentTime, jobId, clinician, phase,
  ruleEvents = [], rulePhase = "idle",
  onJump, onEdit, onGoToReport }) {
  const [tab, setTab] = useState("ai");
  const [reviewModal, setReviewModal] = useState(null);

  const seizures = events.filter(ev => {
    const edit   = edits[ev.index];
    const status = edit?.status ?? "ai_predicted";
    if (status === "rejected") return false;
    if (status === "modified") return true;
    return (edit?.label ?? ev.label) === "seizure";
  });

  const pendingReview = seizures.filter(ev =>
    (edits[ev.index]?.status ?? "ai_predicted") === "ai_predicted"
  ).length;

  const rbSeizures  = ruleEvents.filter(ev => ev.label === "seizure");
  const hybSeizures = ruleEvents.filter(ev => ev.hybrid_label === "seizure");

  const canGenerateReport = phase === "ready";
  const isRuleRunning = rulePhase === "running";
  const isRuleReady   = rulePhase === "ready";

  const saveReview = async (...args) => {
    await onEdit(...args);
    setReviewModal(null);
  };

  const tabs = [
    { id: "ai",     label: "AI",     count: seizures.length },
    { id: "rules",  label: "Rule",   count: isRuleRunning ? "…" : rbSeizures.length },
    { id: "hybrid", label: "Hybrid", count: isRuleRunning ? "…" : hybSeizures.length },
  ];

  return (
    <>
      <ReviewEditModal
        state={reviewModal}
        clinician={clinician}
        onClose={() => setReviewModal(null)}
        onSave={saveReview}
      />
      <div style={{
        width: 300, minWidth: 300, display: "flex", flexDirection: "column",
      borderLeft: `1px solid ${T.shellBorder}`, background: T.shell,
      fontFamily: "'Roboto', Arial, sans-serif" }}>
      {/* Header */}
      <div style={{
        padding: "9px 12px", borderBottom: `1px solid ${T.shellBorder}`,
        background: T.shell1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, color: T.shellText, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
          Review Panel
        </span>
        {pendingReview > 0 && (
          <span style={{ fontSize: 9, color: "#b45309", background: "#fffbeb", border: "1px solid #fcd34d", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>
            {pendingReview} pending
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `2px solid ${T.shellBorder}`, flexShrink: 0, background: T.shell1 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "8px 4px 7px", border: "none", background: "transparent", cursor: "pointer",
            borderBottom: `2px solid ${tab === t.id ? T.shellAccent : "transparent"}`,
            marginBottom: -2,
            color: tab === t.id ? T.shellAccent : T.shellMuted }}>
            <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 2 }}>
              {t.label}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: tab === t.id ? T.shellText : T.shellMuted }}>
              {t.count}
            </div>
          </button>
        ))}
      </div>

      {/* AI Tab */}
      {tab === "ai" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {seizures.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, opacity: 0.25 }}><Zap size={28} strokeWidth={1.5} /></div>
              <div style={{ fontSize: 11, color: T.shellText, fontWeight: 600, marginBottom: 6 }}>No AI seizures</div>
              <div style={{ fontSize: 9, color: T.shellMuted, lineHeight: 1.7 }}>Run analysis to detect events</div>
            </div>
          ) : (
            <div style={{ borderTop: `1px solid ${T.shellBorder}` }}>
              <div style={{ padding: "5px 12px", fontSize: 9, color: T.shellMuted, borderBottom: `1px solid ${T.shellBorder}`, display: "flex", justifyContent: "space-between" }}>
                <span>AI EVENTS</span>
                <span style={{ color: T.shellAccent }}>{seizures.length} found</span>
              </div>
              {seizures.map((ev, i) => {
                const edit     = edits[ev.index];
                const label    = edit?.label  ?? ev.label;
                const status   = edit?.status ?? "ai_predicted";
                const isActive = currentTime >= ev.start && currentTime <= ev.end;
                const dur      = (ev.end - ev.start).toFixed(1);
                const isSz     = label === "seizure";
                return (
                  <div key={ev.index} style={{
                    borderLeft: `3px solid ${isActive ? T.shellAccent : isSz ? T.seizureLine : T.shellBorder}`,
                    borderBottom: `1px solid ${T.shellBorder}`,
                    background: isActive ? `${T.shellAccent}08` : "transparent" }}>
                    <div onClick={() => onJump(ev.start)} style={{ padding: "9px 12px", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {isSz ? (
                            <span style={{ fontSize: 9, color: T.seizureText, background: T.seizureSoft, border: `1px solid ${T.seizureLine}30`, padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                              SZ #{i + 1}
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: T.shellMuted }}>· Background</span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <StatusBadge status={status} />
                          <span style={{ fontSize: 9, color: T.shellMuted }}>{dur}s</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: T.shellText, fontFamily: "'Roboto', Arial, sans-serif" }}>
                        {ev.start.toFixed(1)}s → {ev.end.toFixed(1)}s
                      </div>
                      {isSz && ev.ai_subtype && (
                        <SubtypeBadge code={ev.ai_subtype} full={ev.ai_subtype_full} confidence={ev.ai_subtype_confidence} prefix="AI·" />
                      )}
                      {isSz && ev.prob != null && (
                        <div style={{ marginTop: 3, fontSize: 9, color: T.shellMuted }}>
                          prob={ev.prob.toFixed(3)} conf={ev.confidence?.toFixed(3) ?? "—"}
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginTop: 8 }}>
                        {[
                          ["accepted", "Accept", "#059669"],
                          ["rejected", "Reject", "#64748B"],
                          ["modified", "Modify", "#D97706"],
                        ].map(([statusName, text, color]) => (
                          <button key={statusName} className="nd-action-btn" onClick={(e) => {
                            e.stopPropagation();
                            setReviewModal({ ev, statusName, label, note: edit?.note ?? "" });
                          }} style={{
                            border: `1px solid ${color}35`, background: `${color}12`, color,
                            borderRadius: 6, padding: "5px 0", fontSize: 8, fontWeight: 800,
                            cursor: "pointer", transition: "all .12s", fontFamily: "'Roboto', Arial, sans-serif" }}>{text}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Rule Tab */}
      {tab === "rules" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{
            padding: "7px 12px",
            background: isRuleRunning ? "#fffbeb" : isRuleReady ? "#F0FDF4" : T.shell2,
            borderBottom: `1px solid ${T.shellBorder}`,
            display: "flex", alignItems: "center", gap: 6 }}>
            {isRuleRunning && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#F59E0B", animation: "ndPulse 1s ease-in-out infinite" }} />}
            <span style={{ fontSize: 9, color: isRuleRunning ? "#F59E0B" : isRuleReady ? "#059669" : T.shellMuted, fontWeight: 700 }}>
              {isRuleRunning ? "Rule engine running…" : isRuleReady ? `${rbSeizures.length} seizure(s) flagged` : "Awaiting file load"}
            </span>
          </div>
          {ruleEvents.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, opacity: 0.25 }}><Ruler size={28} strokeWidth={1.5} /></div>
              <div style={{ fontSize: 11, color: T.shellText, fontWeight: 600, marginBottom: 6 }}>
                {isRuleRunning ? "Analysing…" : "No rule events"}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ padding: "5px 12px", fontSize: 9, color: T.shellMuted, borderBottom: `1px solid ${T.shellBorder}`, display: "flex", justifyContent: "space-between" }}>
                <span>RULE EVENTS</span>
                <span style={{ color: "#F59E0B" }}>{rbSeizures.length}sz / {ruleEvents.length - rbSeizures.length}bg</span>
              </div>
              {ruleEvents.map((ev, i) => {
                const isSz     = ev.label === "seizure";
                const dur      = (ev.end - ev.start).toFixed(1);
                const isActive = currentTime >= ev.start && currentTime <= ev.end;
                return (
                  <div key={i} style={{
                    borderLeft: `3px solid ${isActive ? T.shellAccent : isSz ? "#F59E0B" : "#14B8A6"}`,
                    borderBottom: `1px solid ${T.shellBorder}`,
                    background: isActive ? `${T.shellAccent}08` : "transparent" }}>
                    <div onClick={() => onJump(ev.start)} style={{ padding: "8px 12px", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        {isSz ? (
                          <span style={{ fontSize: 9, color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                            RB-SZ #{i + 1}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: T.shellMuted }}>· Bckg</span>
                        )}
                        <span style={{ fontSize: 9, color: T.shellMuted }}>{dur}s</span>
                      </div>
                      <div style={{ fontSize: 10, fontFamily: "'Roboto', Arial, sans-serif" }}>
                        {ev.start.toFixed(1)}s → {ev.end.toFixed(1)}s
                      </div>
                      {isSz && ev.rule_subtype && (
                        <SubtypeBadge code={ev.rule_subtype} full={ev.rule_subtype_full} confidence={ev.rule_subtype_confidence} prefix="RB·" />
                      )}
                      {ev.rules?.length > 0 && (
                        <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", gap: 2 }}>
                          {ev.rules.slice(0, 4).map((r, ri) => (
                            <span key={ri} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e", fontWeight: 700 }}>
                              [{r.id}]
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Hybrid Tab */}
      {tab === "hybrid" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Hybrid formula explanation */}
          <div style={{
            padding: "8px 12px", background: "#F5F3FF",
            borderBottom: `1px solid #C4B5FD`,
            fontSize: 9, color: "#5B21B6", fontFamily: "'Roboto', Arial, sans-serif", lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700 }}>C_hybrid = α×P_AI + (1−α)×R_rule</span>
            <br/>
            <span style={{ opacity: 0.7 }}>
              α={ruleEvents.find(e => e.alpha != null)?.alpha ?? 0.5} · threshold≥0.50 → seizure
            </span>
          </div>

          {hybSeizures.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, opacity: 0.25 }}><FlaskConical size={28} strokeWidth={1.5} /></div>
              <div style={{ fontSize: 11, color: T.shellText, fontWeight: 600, marginBottom: 6 }}>No hybrid seizures</div>
              <div style={{ fontSize: 9, color: T.shellMuted, lineHeight: 1.7 }}>Hybrid score combines AI + Rule confidence</div>
            </div>
          ) : (
            <div>
              <div style={{ padding: "5px 12px", fontSize: 9, color: T.shellMuted, borderBottom: `1px solid ${T.shellBorder}`, display: "flex", justifyContent: "space-between" }}>
                <span>HYBRID SEIZURES</span>
                <span style={{ color: "#7C3AED" }}>{hybSeizures.length} flagged</span>
              </div>
              {ruleEvents.map((ev, i) => {
                if (!ev.hybrid_label) return null;
                const isHySz   = ev.hybrid_label === "seizure";
                if (!isHySz) return null;
                const dur      = (ev.end - ev.start).toFixed(1);
                const isActive = currentTime >= ev.start && currentTime <= ev.end;
                const alpha    = ev.alpha ?? 0.5;
                const aiC      = ev.ai_prob_used;
                const ruleC    = ev.rule_conf_used;
                const hybC     = ev.hybrid_confidence;
                return (
                  <div key={i} style={{
                    borderLeft: `3px solid ${isActive ? T.shellAccent : "#7C3AED"}`,
                    borderBottom: `1px solid ${T.shellBorder}`,
                    background: isActive ? `${T.shellAccent}08` : "transparent" }}>
                    <div onClick={() => onJump(ev.start)} style={{ padding: "8px 12px", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 9, color: "#5B21B6", background: "#F5F3FF", border: "1px solid #C4B5FD", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                          HY-SZ #{i + 1}
                        </span>
                        <span style={{ fontSize: 9, color: T.shellMuted }}>{dur}s</span>
                      </div>
                      <div style={{ fontSize: 10, fontFamily: "'Roboto', Arial, sans-serif", marginBottom: 4 }}>
                        {ev.start.toFixed(1)}s → {ev.end.toFixed(1)}s
                      </div>
                      {/* Confidence breakdown */}
                      <div style={{ fontSize: 9, color: T.shellMuted, lineHeight: 1.7 }}>
                        {aiC != null   && <div>AI·Psz = <span style={{ color: "#DC2626", fontWeight: 600 }}>{(aiC * 100).toFixed(0)}%</span></div>}
                        {ruleC != null && <div>Rule·conf = <span style={{ color: "#D97706", fontWeight: 600 }}>{(ruleC * 100).toFixed(0)}%</span></div>}
                        {hybC != null  && <div>Hybrid·C = <span style={{ color: "#7C3AED", fontWeight: 700 }}>{(hybC * 100).toFixed(0)}%</span></div>}
                      </div>
                      {/* Combined subtype */}
                      {(ev.rule_subtype || null) && (
                        <SubtypeBadge code={ev.rule_subtype} full={ev.rule_subtype_full} confidence={ev.rule_subtype_confidence} prefix="RB·" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Footer — Generate Report */}
      <div style={{ padding: "10px 12px", borderTop: `1px solid ${T.shellBorder}`, flexShrink: 0, background: T.shell1 }}>
        <button onClick={onGoToReport} disabled={!canGenerateReport} style={{
          width: "100%", padding: "9px 0", fontSize: 11,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          background: canGenerateReport ? T.shellAccent : T.shell2,
          color: canGenerateReport ? "#fff" : T.shellMuted,
          border: `1.5px solid ${canGenerateReport ? T.shellAccent : T.shellBorder}`,
          borderRadius: 6, cursor: canGenerateReport ? "pointer" : "not-allowed",
          fontFamily: "'Roboto', Arial, sans-serif", fontWeight: 700, letterSpacing: "0.04em",
          opacity: canGenerateReport ? 1 : 0.5 }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2 2h4l1.5 1.5H9a1 1 0 011 1V9a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
            <path d="M3.5 6.5h4M3.5 8h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
          Generate Report
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1.5 4.5h6M5.5 2L8 4.5 5.5 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
    </>
  );
}


export { RightPanel };
