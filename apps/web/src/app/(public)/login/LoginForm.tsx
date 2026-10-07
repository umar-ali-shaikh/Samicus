"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { GoogleMark } from "@/components/auth/GoogleMark";
import { Button, Callout, Field, inputStyle } from "@/components/ui";
import { signInAction, forgotPasswordAction, signInWithGoogleAction } from "@/server/authActions";
import { initialAuthFormState } from "@/server/authActionState";

/**
 * Ported from frontend/src/auth/LoginScreen.jsx's "signin"/"forgot" modes -- same copy and
 * validation rules. "signup" is split into its own /signup route+page (see target_structure
 * in docs/MASTER-PROMPT.md, which lists login and signup as separate (public) routes).
 * All Supabase Auth calls happen server-side (Server Actions) so the session cookie stays
 * HttpOnly -- this component never touches supabase-js directly.
 */
export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [signInState, signInFormAction, signInPending] = useActionState(signInAction, initialAuthFormState);
  const [forgotState, forgotFormAction, forgotPending] = useActionState(forgotPasswordAction, initialAuthFormState);

  const busy = signInPending || forgotPending;
  const state = mode === "forgot" ? forgotState : signInState;

  const title = mode === "forgot" ? "Reset your password" : "Welcome back";
  const subtitle = mode === "forgot" ? "Enter your email and we'll send you a reset link." : "Sign in to continue to Vidhira.";

  return (
    <AuthLayout
      title={title}
      subtitle={subtitle}
      footer={
        mode === "signin" ? (
          <>
            New to Vidhira? <Link href="/signup">Create an account</Link>
          </>
        ) : (
          <a
            href="#signin"
            onClick={(e) => {
              e.preventDefault();
              setMode("signin");
            }}
          >
            Back to sign in
          </a>
        )
      }
    >
      {mode === "signin" && (
        <>
          <form action={signInWithGoogleAction}>
            <button
              type="submit"
              disabled={busy}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "11px 14px",
                borderRadius: 10,
                border: "1px solid var(--color-border)",
                background: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                color: "var(--color-ink)",
                width: "100%",
              }}
            >
              <GoogleMark /> Continue with Google
            </button>
          </form>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--color-label)", fontSize: 11.5 }}>
            <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} /> or use email{" "}
            <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
          </div>
        </>
      )}

      <form action={mode === "forgot" ? forgotFormAction : signInFormAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Email">
          <input type="email" name="email" autoComplete="email" required style={inputStyle} />
        </Field>
        {mode === "signin" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>Password</span>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                required
                style={{ ...inputStyle, paddingRight: 48 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                style={{
                  position: "absolute",
                  right: 4,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--color-text-muted)",
                  padding: "8px 10px",
                  minHeight: 36,
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
        )}
        {state.error && <Callout tone="danger">{state.error}</Callout>}
        {state.notice && <Callout tone="success">{state.notice}</Callout>}
        <Button type="submit" disabled={busy} style={{ opacity: busy ? 0.7 : 1 }}>
          {busy ? "Please wait…" : mode === "forgot" ? "Send reset link" : "Sign in"}
        </Button>
        {mode === "signin" && (
          <a
            href="#forgot"
            onClick={(e) => {
              e.preventDefault();
              setMode("forgot");
            }}
            style={{ fontSize: 12.5, textAlign: "center" }}
          >
            Forgot your password?
          </a>
        )}
      </form>
    </AuthLayout>
  );
}
