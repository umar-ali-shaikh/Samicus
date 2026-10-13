"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdvocateDto } from "@vidhira/contracts";
import { Card, Badge, Callout, Button } from "@/components/ui";
import { resubmitAdvocateAction } from "@/server/advocatesActions";

type Tone = "neutral" | "success" | "danger" | "warning" | "info";

const STATUS: Record<string, [Tone, string]> = {
  submitted: ["info", "Submitted — awaiting review"],
  under_review: ["info", "Under review"],
  documents_requested: ["warning", "More information requested"],
  verified: ["success", "Verified and listed"],
  rejected: ["danger", "Not approved"],
};

// Ported from frontend/src/screens/profile/AdvocateForms.jsx's VerificationStatus.
export function VerificationStatusCard({ advocate }: { advocate: AdvocateDto }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [tone, label] = STATUS[advocate.verification_status] ?? ["neutral", advocate.verification_status];

  function resubmit() {
    setError(undefined);
    startTransition(async () => {
      const result = await resubmitAdvocateAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Verification</div>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
        {advocate.bar_council} · {advocate.enrolment_number}
      </div>
      {advocate.verification_status === "verified" ? (
        <div style={{ fontSize: 12.5 }}>Your profile is listed. Switch on &quot;Accepting requests&quot; on your dashboard to receive clients.</div>
      ) : advocate.verification_status === "documents_requested" ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12.5 }}>Our team asked for more information. Update your details below, then resubmit.</div>
          <Button onClick={resubmit} disabled={isPending} style={{ width: "auto" }}>
            {isPending ? "Resubmitting…" : "Resubmit"}
          </Button>
        </div>
      ) : (
        <div style={{ fontSize: 12.5 }}>You can edit your listing now; it becomes visible to clients once verified.</div>
      )}
      {error && <Callout tone="danger">{error}</Callout>}
    </Card>
  );
}
