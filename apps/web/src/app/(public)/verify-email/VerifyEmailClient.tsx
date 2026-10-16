"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button, Callout } from "@/components/ui";
import { resendVerificationAction, checkVerifiedAction, signOutAction } from "@/server/authActions";
import { initialAuthFormState } from "@/server/authActionState";

// Ported from frontend/src/auth/VerifyEmailScreen.jsx -- same copy, same polling behaviour
// (every 6s + on window focus) while waiting for the confirmation link to be clicked.
// `signedIn` is false right after a signup that required confirmation: there's no session to
// poll yet, so the page offers "sign in once verified" instead of auto-continuing.
export function VerifyEmailClient({ email, signedIn }: { email: string; signedIn: boolean }) {
  const router = useRouter();
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState("");
  const [resendState, resendFormAction, resendPending] = useActionState(resendVerificationAction, initialAuthFormState);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);


  async function check() {
    setChecking(true);
    setCheckMessage("");
    const { verified } = await checkVerifiedAction();
    if (verified) {
      router.push("/dashboard");
      return;
    }
    setCheckMessage("Your email isn't verified yet. Open the link we sent you, then come back.");
    setChecking(false);
  }

  useEffect(() => {
    if (!signedIn) return undefined;
    const timer = setInterval(check, 6000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={
        signedIn
          ? `We sent a confirmation link to ${email}. Open it to activate your account — this page continues automatically once you have.`
          : `We sent a confirmation link to ${email}. Open it to activate your account, then sign in.`
      }
      footer={
        signedIn ? (
          <form action={signOutAction}>
            <button type="submit" style={{ background: "none", border: "none", padding: 0, color: "var(--color-rust)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
              Use a different account
            </button>
          </form>
        ) : (
          <Link href="/signup" style={{ color: "var(--color-rust)" }}>
            Use a different email
          </Link>
        )
      }
    >
      {resendState.notice && <Callout tone="success">{resendState.notice}</Callout>}
      {resendState.error && <Callout tone="danger">{resendState.error}</Callout>}
      {checkMessage && <Callout tone="warning">{checkMessage}</Callout>}
      {signedIn ? (
        <Button onClick={check} disabled={checking}>
          {checking ? "Checking…" : "I've verified my email"}
        </Button>
      ) : (
        <Link href="/login" style={{ textAlign: "center", fontWeight: 700, color: "var(--color-ink)" }}>
          I&apos;ve verified my email — sign in
        </Link>
      )}
      <form action={resendFormAction} onSubmit={() => setCooldown(60)}>
        <input type="hidden" name="email" value={email} />
        <Button type="submit" variant="outline" disabled={cooldown > 0 || resendPending}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}
        </Button>
      </form>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
        Verifying your email protects your account and is required before you can book advocates, upload documents or ask for legal research.
      </div>
    </AuthLayout>
  );
}
