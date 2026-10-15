"use client";

import { useTransition } from "react";
import { signOutAction } from "@/server/authActions";

// signOutAction only ends the server-side session (httpOnly cookies) -- it has no way to reach
// into this browser's localStorage/sessionStorage, where client-only state (e.g. the AI
// assistant's legalAssistant.sessionId.<userId> key) lives. Left behind, that's a shared-device
// hygiene gap: the next person to sign in on this browser would still find the previous user's
// leftover client-side state. Clearing it here, right before the server sign-out, is the one
// place that's guaranteed to run on every sign-out.
export function SignOutButton({ children = "Sign out" }: { children?: React.ReactNode }) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // storage unavailable (private mode) -- nothing to clear, sign-out should still proceed
      }
      await signOutAction();
    });
  }

  return (
    <button onClick={onClick} disabled={isPending} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "var(--color-navy)", color: "#fff", cursor: "pointer" }}>
      {isPending ? "Signing out…" : children}
    </button>
  );
}
