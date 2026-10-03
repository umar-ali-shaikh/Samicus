import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthLayout } from "./AuthLayout";
import { Button, Callout } from "../components/ui";
import { Field, inputStyle } from "../components/forms";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.3 5.7c4.3-4 6.8-9.9 6.8-17.2z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.6 2.2-8.6 2.2-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function LoginScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function run(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try { await fn(); } catch (err) { setError(friendly(err)); } finally { setBusy(false); }
  }

  const submit = (e) => {
    e.preventDefault();
    if (mode === "forgot") return run(async () => { await auth.forgotPassword(form.email.trim()); setNotice("If an account exists for that email, a reset link is on its way."); });
    if (mode === "signup") {
      if (form.name.trim().length < 2) return setError("Please enter your full name.");
      if (form.password.length < 8) return setError("Use a password of at least 8 characters.");
      return run(() => auth.signUp({ name: form.name.trim(), email: form.email.trim(), password: form.password }));
    }
    return run(() => auth.signIn({ email: form.email.trim(), password: form.password }));
  };

  const title = { signin: "Welcome back", signup: "Create your account", forgot: "Reset your password" }[mode];
  const subtitle = { signin: "Sign in to continue to Samicus.", signup: "We'll email you a link to verify your address before you can continue.", forgot: "Enter your email and we'll send you a reset link." }[mode];

  return (
    <AuthLayout
      title={title}
      subtitle={subtitle}
      footer={
        mode === "signin" ? (
          <>New to Samicus? <a href="#signup" onClick={(e) => { e.preventDefault(); setMode("signup"); setError(""); }}>Create an account</a></>
        ) : (
          <>Already have an account? <a href="#signin" onClick={(e) => { e.preventDefault(); setMode("signin"); setError(""); setNotice(""); }}>Sign in</a></>
        )
      }
    >
      {mode !== "forgot" && (
        <>
          <button
            type="button"
            onClick={() => run(auth.signInWithGoogle)}
            disabled={busy}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "11px 14px", borderRadius: 10, border: "1px solid var(--color-border)", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--color-ink)" }}
          >
            <GoogleMark /> Continue with Google
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--color-label)", fontSize: 11.5 }}>
            <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} /> or use email <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
          </div>
        </>
      )}

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
        {mode === "signup" && <Field label="Full name"><input value={form.name} onChange={set("name")} autoComplete="name" style={inputStyle} /></Field>}
        <Field label="Email"><input type="email" value={form.email} onChange={set("email")} autoComplete="email" required style={inputStyle} /></Field>
        {mode !== "forgot" && (
          <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
            <input type="password" value={form.password} onChange={set("password")} autoComplete={mode === "signup" ? "new-password" : "current-password"} required style={inputStyle} />
          </Field>
        )}
        {error && <Callout tone="danger">{error}</Callout>}
        {notice && <Callout tone="success">{notice}</Callout>}
        <Button type="submit" disabled={busy || !form.email} style={{ opacity: busy ? 0.7 : 1 }}>
          {busy ? "Please wait…" : { signin: "Sign in", signup: "Create account", forgot: "Send reset link" }[mode]}
        </Button>
        {mode === "signin" && (
          <a href="#forgot" onClick={(e) => { e.preventDefault(); setMode("forgot"); setError(""); }} style={{ fontSize: 12.5, textAlign: "center" }}>Forgot your password?</a>
        )}
      </form>
    </AuthLayout>
  );
}

function friendly(err) {
  const m = err?.message || "Something went wrong.";
  if (/invalid login credentials/i.test(m)) return "That email and password don't match. If you signed up with Google, use “Continue with Google”.";
  if (/rate limit|too many/i.test(m)) return "Too many attempts. Please wait a minute and try again.";
  if (/password should be at least/i.test(m)) return "Use a password of at least 8 characters.";
  return m;
}
