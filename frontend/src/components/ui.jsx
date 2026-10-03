// Shared, inline-styled UI primitives matching the Samicus/Vidhira/Command Centre design
// language: Newsreader serif headings, Public Sans body, generous radii, cream/navy palette.

export function Card({ children, style, ...rest }) {
  return (
    <div
      style={{
        background: "var(--color-white)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: 18,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Callout({ tone = "neutral", title, children, style }) {
  const tones = {
    neutral: { bg: "#FBF8F2", border: "#EDE5D8", text: "var(--color-text)" },
    success: { bg: "#E4F5EC", border: "#BFE6D3", text: "#0F7A55" },
    danger: { bg: "#FDEDE9", border: "#F3C4B8", text: "#8E2C18" },
    warning: { bg: "#FDF3DC", border: "#EBD7A8", text: "#8A6420" },
    info: { bg: "#EDEAF6", border: "#D6D0EC", text: "#4B3F86" },
  }[tone];
  return (
    <div style={{ background: tones.bg, border: `1px solid ${tones.border}`, borderRadius: 11, padding: "12px 14px", ...style }}>
      {title && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: tones.text, marginBottom: 4 }}>{title}</div>}
      <div style={{ fontSize: 13, color: tones.text, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export function Pill({ active, onClick, children, tone = "default" }) {
  const palettes = {
    default: active ? { bg: "var(--color-navy)", fg: "#fff" } : { bg: "#fff", fg: "var(--color-text)" },
    dark: active ? { bg: "var(--color-gold)", fg: "var(--color-navy)" } : { bg: "#182338", fg: "#F6F1E8" },
  }[tone];
  return (
    <button
      onClick={onClick}
      style={{
        background: palettes.bg,
        color: palettes.fg,
        border: active ? "none" : "1px solid var(--color-border)",
        borderRadius: 999,
        padding: "7px 14px",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = "neutral", children }) {
  const tones = {
    neutral: { bg: "#F1EFE6", fg: "var(--color-text)" },
    success: { bg: "#E4F5EC", fg: "#0F7A55" },
    danger: { bg: "#FDEDE9", fg: "#B23A22" },
    warning: { bg: "#FDF3DC", fg: "#8A6420" },
    info: { bg: "#EDEAF6", fg: "#4B3F86" },
  }[tone];
  return (
    <span style={{ background: tones.bg, color: tones.fg, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.02em" }}>
      {children}
    </span>
  );
}

export function VerifiedBadge() {
  return <Badge tone="success">VERIFIED ADVOCATE</Badge>;
}

export function Button({ variant = "primary", children, style, ...rest }) {
  const variants = {
    primary: { bg: "var(--color-navy)", fg: "#fff", border: "none" },
    danger: { bg: "var(--color-rust-alt)", fg: "#fff", border: "none" },
    outline: { bg: "#fff", fg: "var(--color-ink)", border: "1px solid var(--color-border)" },
    ghost: { bg: "transparent", fg: "var(--color-rust)", border: "none" },
  }[variant];
  return (
    <button
      style={{
        background: variants.bg,
        color: variants.fg,
        border: variants.border,
        borderRadius: 10,
        padding: "10px 16px",
        fontSize: 13.5,
        fontWeight: 600,
        cursor: "pointer",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function RadioCard({ selected, onClick, title, subtitle, trailing }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 12,
        border: `1.5px solid ${selected ? "var(--color-navy)" : "var(--color-border)"}`,
        background: "#fff",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: `2px solid ${selected ? "var(--color-navy)" : "#C9C1B2"}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
        }}
      >
        {selected && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--color-navy)" }} />}
      </span>
      <span style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{subtitle}</div>}
      </span>
      {trailing && <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{trailing}</span>}
    </button>
  );
}

export function AvatarTile({ initials, size = 40 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        background: "var(--color-navy)",
        color: "var(--color-gold)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-serif)",
        fontSize: size * 0.4,
        flex: "none",
      }}
    >
      {initials}
    </div>
  );
}

export function ProgressBar({ pct, tone = "mint" }) {
  const color = tone === "mint" ? "#159C6E" : tone === "coral" ? "#DB4F35" : "var(--color-navy)";
  return (
    <div style={{ height: 7, borderRadius: 999, background: "var(--color-border)", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, transition: "width .3s" }} />
    </div>
  );
}

export function SegmentedControl({ options, value, onChange, dark }) {
  return (
    <div style={{ display: "flex", gap: 2, background: dark ? "#182338" : "#F1EFE6", borderRadius: 9, padding: 3 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            background: value === opt.value ? (dark ? "var(--color-gold)" : "var(--color-navy)") : "transparent",
            color: value === opt.value ? (dark ? "var(--color-navy)" : "#fff") : dark ? "#F6F1E8" : "var(--color-ink)",
            border: "none",
            borderRadius: 7,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function StatTile({ value, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--color-surface-alt)", border: "1px solid var(--color-border)", borderRadius: 11, padding: "8px 13px" }}>
      <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-label)" }}>{label}</span>
    </div>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--color-navy)",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 11,
        fontSize: 13,
        boxShadow: "0 18px 40px -18px rgba(11,18,32,.7)",
        zIndex: 200,
        maxWidth: "80vw",
      }}
    >
      {message}
    </div>
  );
}

export function EmptyState({ title, body }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)" }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, color: "var(--color-ink)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{body}</div>
    </div>
  );
}
