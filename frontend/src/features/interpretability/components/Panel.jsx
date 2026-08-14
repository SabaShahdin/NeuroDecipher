function Panel({
  C,
  n,
  title,
  subtitle,
  actions,
  children,
  style = {},
  bodyStyle = {},
  compact = false }) {
  return (
    <section
      style={{
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        background: C.panel,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "none",
        ...style }}
    >
      <div
        style={{
          height: compact ? 32 : 36,
          minHeight: compact ? 32 : 36,
          padding: compact ? "0 8px" : "0 10px",
          borderBottom: `1px solid ${C.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          minWidth: 0,
          background: C.dark ? "rgba(7, 17, 29, .72)" : "rgba(248, 250, 252, .92)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              width: 4,
              height: compact ? 20 : 24,
              borderRadius: 99,
              background: C.purple,
              boxShadow: "none",
              flex: "0 0 auto" }}
          />

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: C.text,
                fontWeight: 950,
                fontSize: compact ? 11 : 12,
                letterSpacing: ".01em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textTransform: "uppercase",
                lineHeight: 1.15 }}
              title={`${title}${subtitle ? ` ${subtitle}` : ""}`}
            >
              {title}
              {subtitle && (
                <span style={{ color: C.muted, fontWeight: 800, marginLeft: 5 }}>
                  {subtitle}
                </span>
              )}
            </div>
          </div>
        </div>

        {actions && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 6,
              flexShrink: 0,
              minWidth: 0 }}
          >
            {actions}
          </div>
        )}
      </div>

      <div
        style={{
          padding: compact ? 8 : 10,
          minWidth: 0,
          minHeight: 0,
          flex: 1,
          overflow: "hidden",
          ...bodyStyle }}
      >
        {children}
      </div>
    </section>
  );
}

export default Panel;
export { Panel };
