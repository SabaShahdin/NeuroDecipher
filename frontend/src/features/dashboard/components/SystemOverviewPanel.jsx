import { panelSurface } from "../../../theme/ndThemeTokens.js";
import DonutBreakdown from "./DonutBreakdown.jsx";
import TypeDistributionList from "./TypeDistributionList.jsx";

export default function SystemOverviewPanel({ C, totals = {}, distribution = {}, seizureTypes = [] }) {
  return (
    <div style={{ ...panelSurface(C), padding: 14, display: "grid", gap: 12, height: "100%", minHeight: 0, alignContent: "start", overflowY: "auto" }}>
      <div><div style={{ fontSize: 14, fontWeight: 850 }}>System Overview</div><div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>Seizure/non-seizure and subtype breakdowns</div></div>
      <DonutBreakdown C={C} title="Seizure vs Non-Seizure" center={totals.totalRecordings || 0} items={[{ label: "Seizure", value: distribution.seizure || 0, color: C.red }, { label: "Non-Seizure", value: distribution.nonSeizure || 0, color: C.accent }]} />
      <TypeDistributionList C={C} seizureTypes={seizureTypes} />
    </div>
  );
}
