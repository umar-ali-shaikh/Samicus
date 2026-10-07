"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdvocateRequestListItemDto } from "@vidhira/contracts";
import { Card, Badge, Callout, Button } from "@/components/ui";
import { fmtDateTime, modeName, URGENCY } from "@/lib/format";
import { acceptRequestAction, declineRequestAction, getRequestDetailAction, runConflictCheckAction } from "@/server/advocatesActions";

interface RequestFacts {
  factsReleased: boolean;
  description: string | null;
}

// Ported from frontend/src/screens/LawyerDashboard.jsx's RequestCard.
export function RequestCard({ r }: { r: AdvocateRequestListItemDto }) {
  const router = useRouter();
  const [facts, setFacts] = useState<RequestFacts | null>(null);
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const cleared = r.conflict_status === "clear";

  function runConflictCheck() {
    setError(undefined);
    startTransition(async () => {
      const result = await runConflictCheckAction(r.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        result.check.status === "clear"
          ? "Conflict check clear. Facts can now be disclosed once the client has consented."
          : "Conflict found — you cannot take this request.",
      );
      router.refresh();
    });
  }

  function accept() {
    setError(undefined);
    startTransition(async () => {
      const result = await acceptRequestAction(r.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice("Accepted. A matter has been opened and a secure conversation started.");
      router.refresh();
    });
  }

  function decline() {
    setError(undefined);
    startTransition(async () => {
      const result = await declineRequestAction(r.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice("Declined. No reason is recorded or shown.");
      router.refresh();
    });
  }

  function viewFacts() {
    setError(undefined);
    startTransition(async () => {
      const detail = (await getRequestDetailAction(r.id)) as unknown as RequestFacts;
      setFacts(detail);
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            {r.practice_area?.name || "New request"} · {r.kind}
            {r.kind !== "scheduled" ? " ⚡" : ""}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {URGENCY[r.urgency] ?? r.urgency} · {modeName(r.mode)} · {r.language.toUpperCase()}
            {r.city ? ` · ${r.city}` : ""}
            {r.state ? `, ${r.state}` : ""} · received {fmtDateTime(r.created_at)}
          </div>
        </div>
        <Badge tone={cleared ? "success" : r.conflict_status === "conflict" ? "danger" : "neutral"}>Conflict check: {r.conflict_status}</Badge>
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
        The client&apos;s facts are withheld until your conflict check clears and they have consented.
      </div>
      {facts?.factsReleased && <Callout tone="neutral">{facts.description || "No description provided."}</Callout>}
      {facts && !facts.factsReleased && (
        <Callout tone="warning">Facts are not released yet{!cleared ? " — run the conflict check first" : " — the client hasn't consented"}.</Callout>
      )}
      {notice && <Callout tone="success">{notice}</Callout>}
      {error && <Callout tone="danger">{error}</Callout>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {r.conflict_status !== "clear" && (
          <Button variant="outline" onClick={runConflictCheck} disabled={isPending} style={{ width: "auto" }}>
            Run conflict check
          </Button>
        )}
        {cleared && (
          <Button variant="outline" onClick={viewFacts} disabled={isPending} style={{ width: "auto" }}>
            View facts
          </Button>
        )}
        <Button onClick={accept} disabled={!cleared || isPending} style={{ width: "auto", opacity: cleared ? 1 : 0.5 }}>
          Accept request
        </Button>
        <Button variant="ghost" onClick={decline} disabled={isPending} style={{ width: "auto" }}>
          Decline without reason
        </Button>
      </div>
    </Card>
  );
}
