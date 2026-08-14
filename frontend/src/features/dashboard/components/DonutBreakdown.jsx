import { subPanelSurface } from "../../../theme/ndThemeTokens.js";

const pct = (value, total) => total > 0 ? `${Math.round((Number(value || 0) / total) * 100)}%` : "0%";

export default function DonutBreakdown({ C, title, center, items }) {
  const total = items.reduce((sum, x) => sum + Number(x.value || 0), 0);
  let acc = 0;
  return (
    <div style={{ ...subPanelSurface(C), padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 850, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 12, alignItems: "center" }}>
        <svg width="94" height="94" viewBox="0 0 42 42">
          <circle cx="21" cy="21" r="15.9" fill="none" stroke={C.dark ? "#1E4773" : "#DBEAFE"} strokeWidth="6" />
          {items.map(item => {
            const v = total > 0 ? Number(item.value || 0) / total : 0;
            const dash = `${v * 100} ${100 - v * 100}`;
            const rot = acc * 360 - 90;
            acc += v;
            return <circle key={item.label} cx="21" cy="21" r="15.9" fill="none" stroke={item.color} strokeWidth="6" strokeDasharray={dash} transform={`rotate(${rot} 21 21)`} strokeLinecap="round" />;
          })}
          <text x="21" y="20" textAnchor="middle" fill={C.text} fontSize="4" fontWeight="800">{center}</text>
          <text x="21" y="25" textAnchor="middle" fill={C.muted} fontSize="2.6">total</text>
        </svg>
        <div style={{ display: "grid", gap: 7 }}>
          {items.map(item => <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10.5 }}><span style={{ display: "flex", gap: 7, alignItems: "center", color: C.muted }}><span style={{ width: 8, height: 8, borderRadius: 2, background: item.color }} />{item.label}</span><strong style={{ color: C.text }}>{item.value} · {pct(item.value, total)}</strong></div>)}
        </div>
      </div>
    </div>
  );
}
