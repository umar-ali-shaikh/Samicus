import { useState } from "react";
import { api } from "../lib/api";
import { Card, Button, Callout } from "./ui";

const linkStyle = {
  display: "block", padding: "10px 12px", borderRadius: 9, border: "1px solid var(--color-border)",
  background: "#fff", fontSize: 12.5, textDecoration: "none", color: "inherit", fontWeight: 600, textAlign: "center",
};

// The honest fallback shown wherever an advocate search/match comes back with zero results —
// Find a lawyer, Talk now, Urgent help — instead of a dead-end "no advocate available"
// message with nothing the person can actually do next.
export function NoAdvocatesFallback({ accountId, practiceAreaId, title = "No advocate is available right now" }) {
  const [notified, setNotified] = useState(false);
  const [busy, setBusy] = useState(false);

  async function notify() {
    setBusy(true);
    try {
      await api.post("/advocates/notify-when-available", { accountId, practiceAreaId });
      setNotified(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Callout tone="warning" title={title}>
        You can still get help immediately from these free services, or we'll let you know the moment an advocate is free.
      </Callout>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
        <a href="tel:112" style={linkStyle}>📞 Police emergency — 112</a>
        <a href="tel:181" style={linkStyle}>📞 Women's helpline — 181</a>
        <a href="tel:1930" style={linkStyle}>📞 Cyber fraud — 1930</a>
        <a href="tel:15100" style={linkStyle}>📞 Free legal aid (NALSA) — 15100</a>
        <a href="https://nalsa.gov.in/dlsa" target="_blank" rel="noopener noreferrer" style={linkStyle}>🏛 Find your DLSA office ↗</a>
      </div>
      <Button variant="outline" onClick={notify} disabled={busy || notified}>
        {notified ? "We'll notify you ✓" : busy ? "Saving…" : "Notify me when an advocate is available"}
      </Button>
    </Card>
  );
}
