"use client";

import { useActionState, type CSSProperties } from "react";
import { Card, Button, Callout } from "@/components/ui";
import { notifyWhenAvailableAction } from "@/server/advocatesActions";

const linkStyle: CSSProperties = {
  display: "block",
  padding: "10px 12px",
  borderRadius: 9,
  border: "1px solid var(--color-border)",
  background: "#fff",
  fontSize: 12.5,
  textDecoration: "none",
  color: "inherit",
  fontWeight: 600,
  textAlign: "center",
};

// Ported from frontend/src/components/NoAdvocatesFallback.jsx -- same copy, same honest
// fallback shown wherever an advocate search/match comes back with zero results.
export function NoAdvocatesFallback({
  accountId,
  practiceAreaId,
  title = "No advocate is available right now",
}: {
  accountId?: string;
  practiceAreaId?: string;
  title?: string;
}) {
  const [state, formAction, pending] = useActionState(notifyWhenAvailableAction, { notified: false });

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <Callout tone="warning">
        <strong>{title}</strong>
        <div>You can still get help immediately from these free services, or we&apos;ll let you know the moment an advocate is free.</div>
      </Callout>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
        <a href="tel:112" style={linkStyle}>📞 Police emergency — 112</a>
        <a href="tel:181" style={linkStyle}>📞 Women&apos;s helpline — 181</a>
        <a href="tel:1930" style={linkStyle}>📞 Cyber fraud — 1930</a>
        <a href="tel:15100" style={linkStyle}>📞 Free legal aid (NALSA) — 15100</a>
        <a href="https://nalsa.gov.in/dlsa" target="_blank" rel="noopener noreferrer" style={linkStyle}>
          🏛 Find your DLSA office ↗
        </a>
      </div>
      {state.notified && <Callout tone="success">We&apos;ll notify you ✓ — you&apos;ll hear from us the moment an advocate is available.</Callout>}
      {state.error && <Callout tone="danger">{state.error}</Callout>}
      <form action={formAction}>
        <input type="hidden" name="accountId" value={accountId ?? ""} />
        <input type="hidden" name="practiceAreaId" value={practiceAreaId ?? ""} />
        <Button variant="outline" type="submit" disabled={pending || state.notified}>
          {state.notified ? "We'll notify you ✓" : pending ? "Saving…" : "Notify me when an advocate is available"}
        </Button>
      </form>
    </Card>
  );
}
