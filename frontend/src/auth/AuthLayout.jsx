import { Card } from "../components/ui";

export function Brand({ light }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--color-gold)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-serif)", fontSize: 19, color: "var(--color-navy)", fontWeight: 600 }}>S</div>
      <span style={{ fontFamily: "var(--font-serif)", fontSize: 21, letterSpacing: "0.06em", color: light ? "#F6F1E8" : "var(--color-navy)" }}>VIDHIRA</span>
    </div>
  );
}

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexWrap: "wrap", background: "var(--color-bg)" }}>
      <div style={{ flex: "1 1 360px", background: "var(--color-navy-2)", color: "#F6F1E8", padding: "48px 40px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 32 }}>
        <Brand light />
        <div style={{ maxWidth: 440 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 34, lineHeight: 1.15, marginBottom: 14 }}>Legal help for India, grounded in real sources.</div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: "#9AA5BC" }}>
            Find a verified advocate, research Indian law with cited answers, draft and review contracts, and track your matters — in one place.
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#8A94A8", maxWidth: 420, lineHeight: 1.6 }}>
          Vidhira is a technology platform. It does not practise law and does not guarantee outcomes. In an emergency, call 112.
        </div>
      </div>
      <div style={{ flex: "1 1 420px", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <Card style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 25 }}>{title}</div>
              {subtitle && <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.5 }}>{subtitle}</div>}
            </div>
            {children}
          </Card>
          {footer && <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 14 }}>{footer}</div>}
        </div>
      </div>
    </div>
  );
}
