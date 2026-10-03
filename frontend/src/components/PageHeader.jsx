export function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 24 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", maxWidth: 640, lineHeight: 1.5, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}
