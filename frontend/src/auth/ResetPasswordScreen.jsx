import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthLayout } from "./AuthLayout";
import { Button, Callout } from "../components/ui";
import { Field, inputStyle } from "../components/forms";

export function ResetPasswordScreen() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    setBusy(true);
    setError("");
    try { await updatePassword(password); } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="You're signed in through your reset link. Set a new password to finish.">
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="New password" hint="At least 8 characters"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={inputStyle} /></Field>
        {error && <Callout tone="danger">{error}</Callout>}
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
      </form>
    </AuthLayout>
  );
}
