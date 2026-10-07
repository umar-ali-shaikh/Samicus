"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MatterDto } from "@vidhira/contracts";
import { Card, Button, Select } from "@/components/ui";
import { TextInput } from "@/components/forms";
import { patchMatterAction } from "@/server/mattersActions";

const STAGE_OPTIONS = [
  ["consultation", "Consultation"],
  ["engagement_confirmed", "Engagement confirmed"],
  ["action_in_progress", "Action in progress"],
  ["resolution", "Resolution"],
  ["closed", "Closed"],
] as const;

// Ported from frontend/src/screens/Matters.jsx's AdvocateControls.
export function AdvocateControls({ matter, matterId }: { matter: MatterDto; matterId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<(typeof STAGE_OPTIONS)[number][0]>(
    matter.stage === "lawyer_matched" || matter.stage === "intake" || matter.stage === "archived" ? "consultation" : matter.stage,
  );
  const [nextAction, setNextAction] = useState(matter.next_action || "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await patchMatterAction(matterId, { stage, nextAction });
      router.refresh();
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
      <Select label="Stage" value={stage} onChange={(e) => setStage(e.target.value as (typeof STAGE_OPTIONS)[number][0])} options={STAGE_OPTIONS} style={{ minWidth: 190 }} />
      <TextInput label="Next action" value={nextAction} onChange={(e) => setNextAction(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
      <Button onClick={save} disabled={isPending} style={{ width: "auto" }}>
        Save
      </Button>
    </Card>
  );
}
