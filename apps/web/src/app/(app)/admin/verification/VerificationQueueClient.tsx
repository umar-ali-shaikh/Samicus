"use client";

import { useState, useTransition } from "react";
import type { VerificationCaseListItemDto } from "@vidhira/contracts";
import { Card, Badge, Button, Callout } from "@/components/ui";
import { TextInput } from "@/components/forms";
import { fmtDate } from "@/lib/format";
import { decideVerificationAction } from "@/server/adminVerificationActions";

function CaseCard({ c, onDecided }: { c: VerificationCaseListItemDto; onDecided: (id: string) => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const a = c.advocate;

  function decide(decision: "approved" | "sent_back") {
    setError(undefined);
    startTransition(async () => {
      const result = await decideVerificationAction(c.id, { decision, note: note.trim() || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDecided(c.id);
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            {a.user?.full_name} <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>· {a.user?.email}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {a.bar_council} · {a.enrolment_number}
            {a.enrolment_year ? ` (${a.enrolment_year})` : ""} · {a.city} · {a.years_of_practice ?? "—"} yrs
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {a.advocate_practice_areas.map((p) => p.practice_area?.name).filter(Boolean).join(", ")}
            {a.education.length ? ` · ${a.education.join("; ")}` : ""}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Submitted {fmtDate(c.created_at)}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {c.checks.map((chk, i) => (
          <Badge key={i} tone={chk.status === "pass" ? "success" : chk.status === "needs_info" ? "danger" : "warning"}>
            {chk.type.replace(/_/g, " ")}: {chk.status.replace("_", " ")}
          </Badge>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>
        Verify the enrolment number against the Bar Council&apos;s roll before approving — the system records your decision but cannot check the register
        itself.
      </div>
      {error && <Callout tone="danger">{error}</Callout>}
      <TextInput label="Note to advocate (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: "flex", gap: 10 }}>
        <Button onClick={() => decide("approved")} disabled={isPending} style={{ width: "auto" }}>
          Approve listing
        </Button>
        <Button variant="outline" onClick={() => decide("sent_back")} disabled={isPending} style={{ width: "auto" }}>
          Send back
        </Button>
      </div>
    </Card>
  );
}

// Ported from frontend/src/screens/AdminQueue.jsx.
export function VerificationQueueClient({ initialCases }: { initialCases: VerificationCaseListItemDto[] }) {
  const [cases, setCases] = useState(initialCases);
  return cases.length === 0 ? (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)" }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, color: "var(--color-ink)", marginBottom: 6 }}>Queue is empty</div>
      <div style={{ fontSize: 13 }}>No advocates are currently pending verification.</div>
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {cases.map((c) => (
        <CaseCard key={c.id} c={c} onDecided={(id) => setCases((prev) => prev.filter((x) => x.id !== id))} />
      ))}
    </div>
  );
}
