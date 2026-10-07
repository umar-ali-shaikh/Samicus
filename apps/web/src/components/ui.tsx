/**
 * Minimal UI primitives ported from frontend/src/components/ui.jsx (same inline-style design
 * system, same tokens.css variables) -- just the subset the auth pages need. The rest of the
 * component library gets ported screen-by-screen in Phase 3 as each domain moves to apps/web.
 */
import type { ButtonHTMLAttributes, ReactNode, CSSProperties, SelectHTMLAttributes } from "react";

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type CalloutTone = "neutral" | "success" | "danger" | "warning" | "info";

const CALLOUT_TONES: Record<CalloutTone, { bg: string; border: string; text: string }> = {
  neutral: { bg: "#FBF8F2", border: "#EDE5D8", text: "var(--color-text)" },
  success: { bg: "#E4F5EC", border: "#BFE6D3", text: "#0F7A55" },
  danger: { bg: "#FDEDE9", border: "#F3C4B8", text: "#8E2C18" },
  warning: { bg: "#FDF3DC", border: "#EBD7A8", text: "#8A6420" },
  info: { bg: "#EDEAF6", border: "#D6D0EC", text: "#4B3F86" },
};

export function Callout({ tone = "neutral", children, style }: { tone?: CalloutTone; children: ReactNode; style?: CSSProperties }) {
  const t = CALLOUT_TONES[tone];
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 11, padding: "12px 14px", ...style }}>
      <div style={{ fontSize: 13, color: t.text, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

type ButtonVariant = "primary" | "danger" | "outline" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: "var(--color-navy)", fg: "#fff", border: "none" },
  danger: { bg: "var(--color-rust-alt)", fg: "#fff", border: "none" },
  outline: { bg: "#fff", fg: "var(--color-ink)", border: "1px solid var(--color-border)" },
  ghost: { bg: "transparent", fg: "var(--color-rust)", border: "none" },
};

export function Button({
  variant = "primary",
  children,
  style,
  ...rest
}: { variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = BUTTON_VARIANTS[variant];
  return (
    <button
      style={{
        background: v.bg,
        color: v.fg,
        border: v.border,
        borderRadius: 10,
        padding: "10px 16px",
        fontSize: 13.5,
        fontWeight: 600,
        cursor: "pointer",
        width: "100%",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 9,
  border: "1px solid var(--color-border)",
  background: "#fff",
  fontSize: 14,
  color: "var(--color-ink)",
};

type BadgeTone = "neutral" | "success" | "danger" | "warning" | "info";

const BADGE_TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: "#F1EFE6", fg: "var(--color-text)" },
  success: { bg: "#E4F5EC", fg: "#0F7A55" },
  danger: { bg: "#FDEDE9", fg: "#B23A22" },
  warning: { bg: "#FDF3DC", fg: "#8A6420" },
  info: { bg: "#EDEAF6", fg: "#4B3F86" },
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  const t = BADGE_TONES[tone];
  return (
    <span style={{ background: t.bg, color: t.fg, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.02em" }}>
      {children}
    </span>
  );
}

export type SelectOption = string | readonly [string, string];

export function Select({
  label,
  hint,
  error,
  options,
  placeholder,
  ...rest
}: {
  label?: string;
  hint?: string;
  error?: string;
  options: readonly SelectOption[];
  placeholder?: string;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      <select {...rest} style={{ ...inputStyle, ...rest.style }}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o as string} value={o as string}>{o as string}</option>))}
      </select>
    </Field>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>{label}</span>
      {children}
      {error ? (
        <span role="alert" style={{ fontSize: 11.5, color: "#C0392B", fontWeight: 600 }}>
          {error}
        </span>
      ) : hint ? (
        <span style={{ fontSize: 11, color: "var(--color-label)" }}>{hint}</span>
      ) : null}
    </label>
  );
}

export function Pill({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        background: active ? "var(--color-navy)" : "#fff",
        color: active ? "#fff" : "var(--color-text)",
        border: active ? "none" : "1px solid var(--color-border)",
        borderRadius: 999,
        padding: "6px 14px",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function VerifiedBadge() {
  return <Badge tone="success">VERIFIED ADVOCATE</Badge>;
}

export function AvatarTile({ initials, size = 40 }: { initials: string; size?: number }) {
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

export function ProgressBar({ pct, tone = "mint" }: { pct: number; tone?: "mint" | "coral" | "navy" }) {
  const color = tone === "mint" ? "#159C6E" : tone === "coral" ? "#DB4F35" : "var(--color-navy)";
  return (
    <div style={{ height: 7, borderRadius: 999, background: "var(--color-border)", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, transition: "width .3s" }} />
    </div>
  );
}

export function RadioCard({
  selected,
  onClick,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
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
          border: `1.5px solid ${selected ? "var(--color-navy)" : "var(--color-border)"}`,
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-navy)" }} />}
      </span>
      <span>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{subtitle}</div>}
      </span>
    </button>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: "2px solid var(--color-border)",
        borderTopColor: "var(--color-navy)",
        borderRadius: "50%",
        animation: "vidhira-spin .7s linear infinite",
      }}
    />
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 24, color: "var(--color-text-muted)", fontSize: 13 }}>
      <Spinner /> {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <Callout tone="danger">{message}</Callout>;
}

export function EmptyState({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)" }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, color: "var(--color-ink)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{body}</div>
    </div>
  );
}
