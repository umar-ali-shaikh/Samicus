"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { GoogleMark } from "@/components/auth/GoogleMark";
import { Button, Callout, Field, inputStyle } from "@/components/ui";
import { signUpAction, signInWithGoogleAction } from "@/server/authActions";
import { initialAuthFormState } from "@/server/authActionState";

// Ported from frontend/src/auth/LoginScreen.jsx's "signup" mode -- same copy and validation.
export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialAuthFormState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <AuthLayout
      title="Create your account"
      subtitle="We'll email you a link to verify your address before you can continue."
      footer={
        <>
          Already have an account? <Link href="/login">Sign in</Link>
        </>
      }
    >
      <form action={signInWithGoogleAction}>
        <button
          type="submit"
          disabled={pending}
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

      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Full name">
          <input name="name" autoComplete="name" required style={inputStyle} />
        </Field>
        <Field label="Email">
          <input type="email" name="email" autoComplete="email" required style={inputStyle} />
        </Field>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>Password</span>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="new-password"
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
          <span style={{ fontSize: 11, color: "var(--color-label)" }}>At least 8 characters</span>
        </label>
        {state.error && <Callout tone="danger">{state.error}</Callout>}
        <Button type="submit" disabled={pending} style={{ opacity: pending ? 0.7 : 1 }}>
          {pending ? "Please wait…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
