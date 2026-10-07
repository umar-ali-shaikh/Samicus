"use client";

import { useActionState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button, Callout, Field, inputStyle } from "@/components/ui";
import { updatePasswordAction } from "@/server/authActions";
import { initialAuthFormState } from "@/server/authActionState";

// Ported from frontend/src/auth/ResetPasswordScreen.jsx -- same copy and validation.
export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, initialAuthFormState);

  return (
    <AuthLayout title="Choose a new password" subtitle="You're signed in through your reset link. Set a new password to finish.">
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="New password" hint="At least 8 characters">
          <input type="password" name="password" autoComplete="new-password" required style={inputStyle} />
        </Field>
        {state.error && <Callout tone="danger">{state.error}</Callout>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
