/**
 * Minimal UI primitives ported from frontend/src/components/ui.jsx (same inline-style design
 * system, same tokens.css variables) -- just the subset the auth pages need. The rest of the
 * component library gets ported screen-by-screen in Phase 3 as each domain moves to apps/web.
 */
import type { ButtonHTMLAttributes, ReactNode, CSSProperties } from "react";

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

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
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
