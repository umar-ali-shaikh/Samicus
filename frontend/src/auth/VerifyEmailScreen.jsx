import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthLayout } from "./AuthLayout";
import { Button, Callout } from "../components/ui";

export function VerifyEmailScreen() {
  const { pendingEmail, session, resendVerification, refresh, backToSignIn } = useAuth();
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState({ tone: "", text: "" });
  const [checking, setChecking] = useState(false);
  const email = pendingEmail || session?.user?.email || "your email";

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    setMessage({ tone: "", text: "" });
    try {
      await resendVerification();
      setCooldown(60);
      setMessage({ tone: "success", text: "Verification email sent. Check your inbox (and spam folder)." });
    } catch (err) {
      setMessage({ tone: "danger", text: /rate limit/i.test(err.message) ? "Please wait a little before requesting another email." : err.message });
    }
  }

  async function check() {
    setChecking(true);
    setMessage({ tone: "", text: "" });
    const data = await refresh();
    if (!data) setMessage({ tone: "warning", text: "Your email isn't verified yet. Open the link we sent you, then come back." });
    setChecking(false);
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={`We sent a confirmation link to ${email}. Open it to activate your account — this page continues automatically once you have.`}
      footer={<a href="#back" onClick={(e) => { e.preventDefault(); backToSignIn(); }}>Use a different account</a>}
    >
      {message.text && <Callout tone={message.tone || "neutral"}>{message.text}</Callout>}
      {session && <Button onClick={check} disabled={checking}>{checking ? "Checking…" : "I've verified my email"}</Button>}
      <Button variant="outline" onClick={resend} disabled={cooldown > 0}>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}</Button>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
        Verifying your email protects your account and is required before you can book advocates, upload documents or ask for legal research.
      </div>
    </AuthLayout>
  );
}
