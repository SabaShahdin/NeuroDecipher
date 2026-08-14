import { subPanelSurface } from "../../../theme/ndThemeTokens.js";

export default function TypeDistributionList({ C, seizureTypes = [] }) {
  const max = Math.max(1, ...seizureTypes.map(x => Number(x.count || 0)));
  return (
    <div style={{ ...subPanelSurface(C), padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 850, marginBottom: 10 }}>Seizure Types</div>
      <div style={{ display: "grid", gap: 8 }}>
        {seizureTypes.map((x, i) => <div key={`${x.label}-${i}`}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.muted, marginBottom: 4 }}><span>{x.label}</span><strong style={{ color: C.text }}>{x.count}</strong></div>
          <div style={{ height: 6, borderRadius: 99, background: C.dark ? "#1E4773" : "#DBEAFE", overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.max(4, (Number(x.count || 0) / max) * 100)}%`, background: [C.red, C.orange, C.purple, C.blue, C.accent][i % 5] }} /></div>
        </div>)}
        {seizureTypes.length === 0 && <div style={{ color: C.dim, fontSize: 11 }}>No subtype counts available yet.</div>}
      </div>
    </div>
  );
}
