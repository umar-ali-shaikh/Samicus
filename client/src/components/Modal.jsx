export function ModalShell({ kicker, title, onClose, children, footer, width = 560 }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(16,26,44,.55)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%", maxWidth: width, maxHeight: "88vh", display: "flex", flexDirection: "column",
          background: "var(--color-surface)", borderRadius: "var(--radius-xl)", overflow: "hidden",
          boxShadow: "0 30px 70px -30px rgba(11,18,32,.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 22px", borderBottom: "1px solid var(--color-border)" }}>
          <div>
            {kicker && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: "var(--color-label)", textTransform: "uppercase" }}>{kicker}</div>}
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 21, marginTop: 3 }}>{title}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-muted)", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: "14px 22px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", gap: 10 }}>{footer}</div>}
      </div>
    </div>
  );
}
