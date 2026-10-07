"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdvocateDto } from "@vidhira/contracts";
import { Button } from "@/components/ui";
import { updateAvailabilityAction } from "@/server/advocatesActions";

// Ported from frontend/src/screens/LawyerDashboard.jsx's header actions.
export function AvailabilityToggle({ advocate }: { advocate: AdvocateDto }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const online = advocate.availability_state === "available";

  function toggleOnline() {
    startTransition(async () => {
      await updateAvailabilityAction({ availabilityState: online ? "offline" : "available" });
      router.refresh();
    });
  }

  function toggleUrgent() {
    startTransition(async () => {
      await updateAvailabilityAction({ acceptsUrgent: !advocate.accepts_urgent });
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Button variant={online ? "primary" : "outline"} onClick={toggleOnline} disabled={isPending} style={{ width: "auto" }}>
        {online ? "Accepting requests" : "Not accepting requests"}
      </Button>
      <Button variant="outline" onClick={toggleUrgent} disabled={isPending} style={{ width: "auto" }}>
        Urgent: {advocate.accepts_urgent ? "on" : "off"}
      </Button>
    </div>
  );
}
