import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API, T, CH_COLORS, GLOBAL_STYLE, apiHeaders, fmtT } from "../../constants.js";
import { useNdThemeTokens } from "../../hooks/useNdTheme.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "../../components/utils.js";
import StatusDot from "../../components/StatusDot.jsx";
import ChannelPanel from "../../components/ChannelPanel.jsx";
import Toolbar from "../../components/Toolbar.jsx";
import EegViewer from "../../components/EegViewer.jsx";
import TimelineStrip from "../../components/TimelineStrip.jsx";
import RawSignalPanel from "../../components/RawSignalPanel.jsx";
import StatusBar from "../../components/StatusBar.jsx";
import RightPanel from "../../components/RightPanel.jsx";
import QuickInterpretabilityPanel from "../../components/QuickInterpretabilityPanel.jsx";
import InterpretabilityOverlay from "../../components/InterpretabilityOverlay.jsx";
import ReviewEditModal from "../../components/ReviewEditModal.jsx";
import { StatusBadge, SubtypeBadge, HybridBadge } from "../../components/badges.jsx";
import { ReferenceDetailWorkbench } from "../../components/reference/AnalysisScreens.jsx";
// ─────────────────────────────────────────────────────────────────────────────
//  PAGE: ReportPage (full, with Hybrid section)
// ─────────────────────────────────────────────────────────────────────────────

import { R, ReportSectionHead, ReportCard } from "./components/ReportLayout.jsx";
export default function ReportPage({
  fileName, clinician, events, edits, audit,
  eegData, jobId, ruleEvents, onBackToReview, onNewFile }) {
  const [showInterp, setShowInterp] = useState(false);
  const [notice, setNotice] = useState(null);

  const channels  = eegData?.channels ?? [];
  const times     = eegData?.times    ?? [];
  const totalDur  = times.length > 0 ? times[times.length - 1] : 0;
  const sr        = eegData?.samplingRate ?? 256;
  const safeRule  = ruleEvents ?? [];

  const now      = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const reportId = `ND-${Date.now().toString(36).toUpperCase()}`;

  const alpha = safeRule.find(e => e.alpha != null)?.alpha ?? 0.5;

  const downloadPdfReport = async () => {
    if (!jobId) { setNotice({ title: "Report unavailable", message: "No report job is available yet." }); return; }
    try {
      const response = await fetch(`${API}/report/${jobId}`, { method: "GET", headers: apiHeaders() });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok) {
        const txt = await response.text();
        setNotice({ title: `Failed to generate PDF (HTTP ${response.status})`, message: txt });
        return;
      }
      if (contentType.includes("application/json")) {
        const json = await response.json();
        setNotice({ title: "Server returned JSON instead of PDF", message: "ReportLab may not be installed on the server. Check server logs." });
        return;
      }
      const blob = await response.blob();
      if (blob.size === 0) { setNotice({ title: "Empty PDF", message: "PDF blob is empty — check server logs." }); return; }
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      a.download = match ? match[1] : `neurodecipher_${(fileName ?? "eeg").replace(/\.[^/.]+$/,"")}_report.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch(err) {
      setNotice({ title: "Network error", message: err.message });
    }
  };

  // Build combined per-segment map
  const combined = useMemo(() => {
    const map = {};
    events.forEach(ev => { map[ev.index] = { ai: ev, rule: null }; });
    safeRule.forEach(ev => {
      if (map[ev.index]) map[ev.index].rule = ev;
      else map[ev.index] = { ai: null, rule: ev };
    });
    return Object.values(map).sort((a, b) =>
      (a.ai ?? a.rule).start - (b.ai ?? b.rule).start
    );
  }, [events, safeRule]);

  // Stats
  const stats = useMemo(() => {
    let aiSz = 0, ruleSz = 0, hybSz = 0, bothSz = 0, bothBg = 0, aiOnly = 0, ruleOnly = 0;
    combined.forEach(({ ai, rule }) => {
      const a = ai?.label === "seizure", r = rule?.label === "seizure";
      const h = rule?.hybrid_label === "seizure";
      if (a) aiSz++; if (r) ruleSz++; if (h) hybSz++;
      if (a && r) bothSz++; else if (!a && !r) bothBg++;
      else if (a) aiOnly++; else ruleOnly++;
    });
    const total = combined.length || 1;
    const agreePct = Math.round((bothSz + bothBg) / total * 100);
    const szSegs   = combined.filter(({ ai, rule }) => ai?.label === "seizure" || rule?.label === "seizure");
    const burden   = szSegs.reduce((acc, { ai, rule }) => acc + (ai ?? rule).end - (ai ?? rule).start, 0);
    const longest  = szSegs.length > 0 ? Math.max(...szSegs.map(({ ai, rule }) => (ai ?? rule).end - (ai ?? rule).start)) : 0;
    const accepted = Object.values(edits).filter(e => e.status === "accepted").length;
    const rejected = Object.values(edits).filter(e => e.status === "rejected").length;
    const subtypeCounts = {};
    szSegs.forEach(({ ai, rule }) => {
      const code = ai?.ai_subtype || rule?.rule_subtype;
      if (code && code !== "unavailable" && code !== "error") {
        subtypeCounts[code] = (subtypeCounts[code] || 0) + 1;
      }
    });
    const hybridSegs = combined.filter(({ rule }) => rule?.hybrid_confidence != null);
    const avgHybrid  = hybridSegs.length > 0
      ? Math.round(hybridSegs.reduce((s, { rule }) => s + rule.hybrid_confidence, 0) / hybridSegs.length * 100)
      : null;
    return {
      total, aiSz, ruleSz, hybSz, bothSz, bothBg, aiOnly, ruleOnly,
      agreePct, allSzCount: szSegs.length, szSegs,
      burdenS: Math.round(burden * 10) / 10,
      longest: Math.round(longest * 10) / 10,
      accepted, rejected,
      subtypeCounts, avgHybrid };
  }, [combined, edits]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: R.sans, background: R.page, color: R.ink, overflow: "hidden" }}>

      <NoticeModal notice={notice} onClose={() => setNotice(null)} />
      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 48, flexShrink: 0, background: R.card, borderBottom: `1px solid ${R.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onBackToReview} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", fontSize: 11, background: "none", border: `1px solid ${R.border}`, borderRadius: 5, color: R.sub, cursor: "pointer", fontFamily: R.sans }}>
            ← Back to Review
          </button>
          <div style={{ width: 1, height: 16, background: R.border }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: R.ink, letterSpacing: "-0.03em" }}>
            Neuro<span style={{ color: "#2563EB" }}>Decipher</span>
          </span>
          <span style={{ fontFamily: R.mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: "#2563EB", background: "#EFF6FF", border: "1px solid #BFDBFE", padding: "2px 7px", borderRadius: 3 }}>CLINICAL REPORT</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: R.mono, fontSize: 9, color: R.dim }}>{reportId}</span>
          <button onClick={() => setShowInterp(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", fontSize: 11, background: "none", border: `1px solid ${R.border}`, borderRadius: 5, color: R.sub, cursor: "pointer", fontFamily: R.sans }}>
            ⓘ Interpretability
          </button>
          <button onClick={onNewFile} style={{ padding: "5px 11px", fontSize: 11, background: "none", border: `1px solid ${R.border}`, borderRadius: 5, color: R.sub, cursor: "pointer", fontFamily: R.sans }}>New File</button>
          <button onClick={downloadPdfReport} disabled={!jobId} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 14px", fontSize: 11, fontWeight: 600, background: jobId ? "#2563EB" : R.muted, color: jobId ? "#fff" : R.dim, border: `1px solid ${jobId ? "#2563EB" : R.border}`, borderRadius: 5, cursor: jobId ? "pointer" : "not-allowed", fontFamily: R.sans }}>
            ↓ Export PDF
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="nd-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "28px 36px", background: R.page }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>

          {/* Header block */}
          <ReportCard>
            <div style={{ padding: "20px 24px" }}>
              <div style={{ fontFamily: R.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: R.dim, marginBottom: 8, textTransform: "uppercase" }}>
                EEG Seizure Detection Report · NeuroDecipher
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: R.ink, letterSpacing: "-0.03em", marginBottom: 16, lineHeight: 1.2 }}>
                {fileName || "EEG Analysis"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 0" }}>
                {[
                  ["Clinician",   clinician || "—"],
                  ["Duration",    `${totalDur.toFixed(1)} s (${(totalDur / 60).toFixed(1)} min)`],
                  ["Channels",    `${channels.length} ch · ${sr} Hz`],
                  ["Hybrid α",    `${alpha}  (C = ${alpha}·AI + ${(1-alpha).toFixed(1)}·Rule)`],
                  ["Generated",   now],
                  ["Report ID",   reportId],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontFamily: R.mono, fontSize: 9, color: R.dim, textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 72 }}>{k}</span>
                    <span style={{ fontSize: 11, color: R.ink }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </ReportCard>

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 26 }}>
            {[
              { label: "AI Seizures",     value: stats.aiSz,        color: "#DC2626", sub: "Model detections" },
              { label: "Rule Seizures",   value: stats.ruleSz,       color: "#D97706", sub: "Rule-based detections" },
              { label: "Hybrid Seizures", value: stats.hybSz,        color: "#7C3AED", sub: `α=${alpha} consensus` },
              { label: "Detector Agree",  value: `${stats.agreePct}%`, color: stats.agreePct >= 80 ? "#059669" : "#D97706", sub: "AI · Rule consistency" },
            ].map(item => (
              <div key={item.label} style={{ background: R.card, border: `1px solid ${R.border}`, borderRadius: 10, padding: "18px 18px", borderTop: `3px solid ${item.color}` }}>
                <div style={{ fontSize: 11, color: R.sub, marginBottom: 10, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: item.color, lineHeight: 1, marginBottom: 8, letterSpacing: "-0.03em" }}>{item.value}</div>
                <div style={{ fontSize: 11, color: R.dim, lineHeight: 1.4 }}>{item.sub}</div>
              </div>
            ))}
          </div>

          {/* Additional stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 26 }}>
            {[
              { label: "Total Burden",   value: `${stats.burdenS}s`,    color: R.ink },
              { label: "Longest Event",  value: `${stats.longest}s`,    color: R.ink },
              { label: "Both Seizure",   value: stats.bothSz,           color: "#DC2626" },
              { label: "Both Clear",     value: stats.bothBg,           color: "#059669" },
            ].map(item => (
              <div key={item.label} style={{ background: R.card, border: `1px solid ${R.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, color: R.dim, marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* 02 Detection Review Table */}
          <ReportSectionHead num="02" title="Seizure Detection Review"
            sub="AI, Rule, and Hybrid label comparison — per-segment with subtype and agreement" />

          {combined.length === 0 ? (
            <ReportCard style={{ marginBottom: 24 }}>
              <div style={{ padding: 32, textAlign: "center", color: R.dim, fontSize: 13, fontStyle: "italic" }}>
                No events detected.
              </div>
            </ReportCard>
          ) : (
            <ReportCard>
              <div style={{ padding: "12px 18px", borderBottom: `1px solid ${R.border}`, background: R.muted, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: R.ink }}>Detection Review Table</div>
                  <div style={{ fontSize: 11, color: R.sub, marginTop: 2 }}>All segments with AI · Rule · Hybrid labels</div>
                </div>
                <span style={{ fontFamily: R.mono, fontSize: 10, color: R.sub }}>{combined.length} segments</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: R.muted, borderBottom: `1px solid ${R.border}` }}>
                      {["#","Start","Duration","Subtype","AI","Rule","Hybrid·C","Hybrid","Agree"].map(h => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: R.sub, fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {combined.map(({ ai, rule }, idx) => {
                      const ev       = ai ?? rule;
                      const aiSz     = ai?.label === "seizure";
                      const ruleSz   = rule?.label === "seizure";
                      const hybSz    = rule?.hybrid_label === "seizure";
                      const agree    = aiSz === ruleSz;
                      const hybC     = rule?.hybrid_confidence;
                      const subtype  = ai?.ai_subtype || rule?.rule_subtype;
                      const subColor = subtype ? (SUBTYPE_COLORS[subtype.toLowerCase()] ?? R.sub) : R.dim;
                      return (
                        <tr key={idx} style={{ borderBottom: `1px solid ${R.border}`, background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                          <td style={{ padding: "9px 12px", fontFamily: R.mono, fontSize: 10, color: R.dim }}>{idx + 1}</td>
                          <td style={{ padding: "9px 12px", fontFamily: R.mono, fontSize: 10 }}>{fmtT(ev.start)}</td>
                          <td style={{ padding: "9px 12px", fontFamily: R.mono, fontSize: 10 }}>{(ev.end - ev.start).toFixed(1)}s</td>
                          <td style={{ padding: "9px 12px" }}>
                            {subtype && subtype !== "—" ? (
                              <span style={{ fontFamily: R.mono, fontSize: 10, fontWeight: 700, color: subColor }}>{subtype.toUpperCase()}</span>
                            ) : <span style={{ color: R.dim }}>—</span>}
                          </td>
                          <td style={{ padding: "9px 12px", color: aiSz ? "#B91C1C" : R.sub, fontWeight: aiSz ? 700 : 500 }}>
                            {aiSz ? "Seizure" : "Background"}
                          </td>
                          <td style={{ padding: "9px 12px", color: ruleSz ? "#0369A1" : R.sub, fontWeight: ruleSz ? 700 : 500 }}>
                            {ruleSz ? "Seizure" : "Background"}
                          </td>
                          <td style={{ padding: "9px 12px", fontFamily: R.mono, fontSize: 10, color: hybSz ? "#7C3AED" : R.dim }}>
                            {hybC != null ? `${(hybC * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td style={{ padding: "9px 12px", color: rule?.hybrid_label == null ? R.dim : hybSz ? "#7C3AED" : "#059669", fontWeight: 700 }}>
                            {rule?.hybrid_label == null ? "—" : hybSz ? "Seizure" : "Clear"}
                          </td>
                          <td style={{ padding: "9px 12px", color: agree ? "#047857" : "#B45309", fontWeight: 700 }}>
                            {agree ? "Agree" : "Disagree"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ReportCard>
          )}

          {/* 03 Hybrid Analysis */}
          <ReportSectionHead num="03" title="Hybrid Confidence Analysis"
            sub={`C_hybrid = ${alpha}×P_AI + ${(1-alpha).toFixed(1)}×R_rule  ·  seizure when both agree OR C_hybrid ≥ 0.65`} />

          <ReportCard>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${R.border}`, background: "#FAF7FF" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>Hybrid Score Distribution</div>
              <div style={{ fontSize: 11, color: "#6D28D9", marginTop: 2 }}>
                {stats.hybSz} hybrid seizures / {combined.length} total windows
              </div>
            </div>
            <div style={{ padding: "18px 18px" }}>
              {/* Agreement breakdown */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 18 }}>
                {[
                  { label: "Both Seizure",  count: stats.bothSz,  color: "#DC2626", bg: "#FEF2F2", bdr: "#FECACA" },
                  { label: "AI Only",       count: stats.aiOnly,  color: "#2563EB", bg: "#EFF6FF", bdr: "#BFDBFE" },
                  { label: "Rule Only",     count: stats.ruleOnly,color: "#D97706", bg: "#FFFBEB", bdr: "#FCD34D" },
                  { label: "Hybrid Clear",  count: combined.length - stats.hybSz, color: "#059669", bg: "#ECFDF5", bdr: "#6EE7B7" },
                  { label: "Both Clear",    count: stats.bothBg,  color: "#64748B", bg: R.muted,   bdr: R.border  },
                ].map(item => {
                  const pct = Math.round(item.count / (combined.length || 1) * 100);
                  return (
                    <div key={item.label} style={{ padding: "12px 14px", borderRadius: 8, background: item.bg, border: `1px solid ${item.bdr}` }}>
                      <div style={{ fontSize: 10, color: item.color, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.count}</div>
                      <div style={{ marginTop: 6, height: 3, background: `${item.color}25`, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: item.color, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 10, color: item.color, marginTop: 3, opacity: 0.7 }}>{pct}%</div>
                    </div>
                  );
                })}
              </div>

              {/* Hybrid seizure detail */}
              {stats.hybSz > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: R.ink, marginBottom: 10 }}>Hybrid Seizure Segments</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "#F5F3FF", borderBottom: `1px solid #DDD6FE` }}>
                        {["#","Time","AI·Conf","Rule·Conf","Hybrid·C","Verdict"].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#5B21B6", fontSize: 10 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {safeRule.filter(ev => ev.hybrid_label === "seizure").map((ev, idx) => (
                        <tr key={idx} style={{ borderBottom: `1px solid ${R.border}` }}>
                          <td style={{ padding: "8px 12px", fontFamily: R.mono, fontSize: 10, color: R.dim }}>{idx + 1}</td>
                          <td style={{ padding: "8px 12px", fontFamily: R.mono, fontSize: 10 }}>{fmtT(ev.start)} → {fmtT(ev.end)}</td>
                          <td style={{ padding: "8px 12px", color: "#DC2626", fontWeight: 600, fontFamily: R.mono, fontSize: 10 }}>
                            {ev.ai_prob_used != null ? `${(ev.ai_prob_used * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td style={{ padding: "8px 12px", color: "#D97706", fontWeight: 600, fontFamily: R.mono, fontSize: 10 }}>
                            {ev.rule_conf_used != null ? `${(ev.rule_conf_used * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td style={{ padding: "8px 12px", color: "#7C3AED", fontWeight: 700, fontFamily: R.mono, fontSize: 10 }}>
                            {ev.hybrid_confidence != null ? `${(ev.hybrid_confidence * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: "#F5F3FF", border: "1px solid #C4B5FD", color: "#7C3AED", fontWeight: 700 }}>
                              Seizure
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </ReportCard>

          {/* 04 Subtype Distribution */}
          {Object.keys(stats.subtypeCounts).length > 0 && (
            <>
              <ReportSectionHead num="04" title="Seizure Subtype Distribution"
                sub="Detected from AI model output and rule-based classification" />
              <ReportCard>
                <div style={{ padding: "18px 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                  {Object.entries(stats.subtypeCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
                    const color = SUBTYPE_COLORS[k.toLowerCase()] ?? R.sub;
                    return (
                      <div key={k} style={{ border: `1px solid ${color}30`, borderRadius: 8, padding: 14, background: `${color}08` }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color, marginBottom: 6 }}>{n}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color, textTransform: "uppercase", fontFamily: R.mono }}>{k}</div>
                        <div style={{ fontSize: 10, color: R.dim, marginTop: 4, lineHeight: 1.4 }}>{SUBTYPE_FULL[k]}</div>
                      </div>
                    );
                  })}
                </div>
              </ReportCard>
            </>
          )}

          {/* 05 Detector Agreement */}
          <ReportSectionHead num={Object.keys(stats.subtypeCounts).length > 0 ? "05" : "04"} title="Detector Agreement"
            sub={`Agreement rate: ${stats.agreePct}%  ·  Both seizure: ${stats.bothSz}  ·  Both background: ${stats.bothBg}`} />
          <ReportCard>
            <div style={{ padding: "18px 18px" }}>
              {[
                { label: "Both Seizure",    value: stats.bothSz,   color: "#DC2626" },
                { label: "AI Only",         value: stats.aiOnly,   color: "#2563EB" },
                { label: "Rule Only",       value: stats.ruleOnly, color: "#D97706" },
                { label: "Hybrid Seizure",  value: stats.hybSz,    color: "#7C3AED" },
                { label: "Both Background", value: stats.bothBg,   color: "#64748B" },
              ].map(x => {
                const pct = Math.round(x.value / (combined.length || 1) * 100);
                return (
                  <div key={x.label} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11 }}>
                      <span style={{ color: R.sub }}>{x.label}</span>
                      <span style={{ color: x.color, fontWeight: 600 }}>{x.value} ({pct}%)</span>
                    </div>
                    <div style={{ height: 8, background: R.border, borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: x.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </ReportCard>

          {/* Audit trail */}
          {audit.length > 0 && (
            <>
              <ReportSectionHead num="06" title="Audit Trail" sub={`${audit.length} clinician action(s)`} />
              <ReportCard>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: R.muted, borderBottom: `1px solid ${R.border}` }}>
                      {["Timestamp","Action","Clinician","Note"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: R.sub, fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((a, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${R.border}` }}>
                        <td style={{ padding: "8px 12px", fontFamily: R.mono, fontSize: 10 }}>{(a.ts ?? "").slice(0, 19).replace("T", "  ")}</td>
                        <td style={{ padding: "8px 12px" }}>{a.action}</td>
                        <td style={{ padding: "8px 12px", color: R.sub }}>{a.clinician}</td>
                        <td style={{ padding: "8px 12px", color: R.dim, fontSize: 10 }}>{a.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ReportCard>
            </>
          )}

          {/* Disclaimer */}
          <div style={{ padding: "16px 20px", background: R.muted, border: `1px solid ${R.border}`, borderRadius: 8, fontSize: 11, color: R.sub, lineHeight: 1.6 }}>
            <strong>Clinical Disclaimer:</strong> This report was generated by NeuroDecipher, an AI-assisted EEG analysis system. Results are intended solely as a decision support tool. All findings must be reviewed and validated by a qualified clinician. The hybrid confidence score (C = {alpha}·P_AI + {(1-alpha).toFixed(1)}·R_rule) combines model probability and rule-based confidence and does not replace professional judgment.
          </div>
        </div>
      </div>

      {/* Interpretability overlay */}
      {showInterp && (
        <InterpretabilityOverlay
          combined={combined} stats={stats} safeRule={safeRule} events={events} edits={edits}
          onClose={() => setShowInterp(false)}
        />
      )}
    </div>
  );
}

