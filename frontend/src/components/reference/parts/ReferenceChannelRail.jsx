import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { API, apiHeaders, fmtT, WIN_OPTS, CH_H, PLOTLY_MARGIN } from "../../../constants.js";
import { pct, asPctNumber, displayLabel, buildSegmentBundles, pickBundleForTime, hexToRgba } from "../../utils.js";

function ReferenceChannelRail({
  C,
  channels = [],
  colorMap = {},
  selectedCh,
  setSelectedCh }) {
  const CH_REGIONS = {
    Frontal: ["FP1", "FP2", "F3", "F4", "F7", "F8", "FZ"],
    Central: ["C3", "C4", "CZ"],
    Temporal: ["T3", "T4", "T5", "T6"],
    Parietal: ["P3", "P4", "PZ"],
    Occipital: ["O1", "O2"] };

  const REGION_ACCENT = {
    Frontal: "#60A5FA",
    Central: "#34D399",
    Temporal: "#F59E0B",
    Parietal: "#A78BFA",
    Occipital: "#F472B6",
    Other: "#94A3B8" };

  const REGION_ORDER = [
    "Frontal",
    "Central",
    "Temporal",
    "Parietal",
    "Occipital",
    "Other",
  ];

  const [collapsed, setCollapsed] = useState({});

  function cleanCh(ch) {
    return String(ch || "")
      .replace(/^EEG\s+/i, "")
      .replace(/-LE$/i, "")
      .replace(/-REF$/i, "")
      .replace(/-AVG$/i, "")
      .trim();
  }

  function getRegion(ch) {
    const upper = cleanCh(ch).toUpperCase();

    for (const [region, list] of Object.entries(CH_REGIONS)) {
      if (list.some((r) => upper === cleanCh(r).toUpperCase())) {
        return region;
      }
    }

    return "Other";
  }

  const grouped = channels.reduce((acc, ch) => {
    const r = getRegion(ch);
    if (!acc[r]) acc[r] = [];
    acc[r].push(ch);
    return acc;
  }, {});

  const sortedRegions = REGION_ORDER.filter((r) => grouped[r]);

  return (
    <div
      style={{
        width: 112,
        minWidth: 112,
        maxWidth: 112,
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid ${C.border}`,
        background: C.panel,
        overflow: "hidden" }}
    >
      <div
        style={{
          height: 30,
          minHeight: 30,
          padding: "0 8px",
          borderBottom: `1px solid ${C.border}`,
          color: C.text,
          fontSize: 8.5,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: ".07em",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "'Roboto', Arial, sans-serif" }}
      >
        <span>Channels</span>
        <span style={{ color: C.muted }}>{channels.length}</span>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden" }}
      >
        <div className="nd-channel-rail">
          {sortedRegions.map((region) => {
            const chs = grouped[region];
            const open = !collapsed[region];
            const color = REGION_ACCENT[region] || REGION_ACCENT.Other;

            return (
              <div key={region}>
                <button
                  onClick={() =>
                    setCollapsed((prev) => ({
                      ...prev,
                      [region]: !prev[region] }))
                  }
                  style={{
                    width: "100%",
                    height: 24,
                    border: "none",
                    borderBottom: `1px solid ${hexToRgba(color, 0.2)}`,
                    background: open ? hexToRgba(color, 0.08) : "transparent",
                    color,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 7px",
                    fontSize: 7.5,
                    fontWeight: 900,
                    letterSpacing: ".05em",
                    fontFamily: "'Roboto', Arial, sans-serif" }}
                >
                  <span>{region.slice(0, 4)}</span>
                  <span>{chs.length}</span>
                </button>

                {open &&
                  chs.map((ch) => {
                    const selected = selectedCh === ch;
                    const chColor = colorMap[ch] || C.trace;
                    const label = cleanCh(ch);

                    return (
                      <button
                        key={ch}
                        onClick={() => setSelectedCh(selected ? null : ch)}
                        title={label}
                        style={{
                          width: "100%",
                          minHeight: 23,
                          border: "none",
                          borderLeft: `3px solid ${
                            selected ? chColor : "transparent"
                          }`,
                          borderBottom: `1px solid ${hexToRgba(C.border, 0.65)}`,
                          background: selected
                            ? hexToRgba(chColor, 0.14)
                            : "transparent",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "3px 6px 3px 5px",
                          textAlign: "left" }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            minWidth: 6,
                            borderRadius: "50%",
                            background: chColor }}
                        />

                        <span
                          style={{
                            color: selected ? chColor : C.text,
                            fontSize: 8.5,
                            fontWeight: selected ? 900 : 650,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontFamily: "'Roboto', Arial, sans-serif" }}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ReferenceChannelRail;
export { ReferenceChannelRail };
