// Report design tokens
const R = {
  mono:   "'Roboto', Arial, sans-serif",
  sans:   "'Roboto', Arial, sans-serif",
  page:   "#F8FAFC",
  card:   "#FFFFFF",
  muted:  "#F1F5F9",
  border: "#E2E8F0",
  ink:    "#0F172A",
  sub:    "#475569",
  dim:    "#94A3B8" };

function ReportSectionHead({ num, title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, paddingBottom: 10, borderBottom: `1px solid ${R.border}` }}>
        <span style={{ fontFamily: R.mono, fontSize: 8, fontWeight: 700, color: R.dim, letterSpacing: "0.12em", border: `1px solid ${R.border}`, padding: "2px 6px", borderRadius: 3 }}>{num}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: R.ink, letterSpacing: "-0.02em" }}>{title}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: R.sub, marginBottom: 8 }}>{sub}</div>}
    </div>
  );
}

function ReportCard({ children, style = {} }) {
  return (
    <div style={{ background: R.card, border: `1px solid ${R.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24, ...style }}>
      {children}
    </div>
  );
}


export { R, ReportSectionHead, ReportCard };
