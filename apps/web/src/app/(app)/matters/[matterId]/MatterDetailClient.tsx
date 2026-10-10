"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MatterDetailDto, MatterListItemDto } from "@vidhira/contracts";
import { Card, Pill, Button, AvatarTile } from "@/components/ui";
import { ProgressBar } from "@/components/ui";
import { fmtDate, initials, stageProgress, STAGE_LABEL } from "@/lib/format";
import { AdvocateControls } from "@/components/matters/AdvocateControls";
import { Timeline } from "@/components/matters/Timeline";
import { TasksAndHearings } from "@/components/matters/TasksAndHearings";
import { Fees } from "@/components/matters/Fees";
import { Access } from "@/components/matters/Access";
import { MatterDocuments } from "@/components/matters/MatterDocuments";
import { patchMatterAction } from "@/server/mattersActions";

const TABS = ["Timeline", "Tasks & hearings", "Documents", "Fees"] as const;

// Ported from frontend/src/screens/Matters.jsx (the list + pill selector) and
// frontend/src/screens/matter/MatterTabs.jsx (the tab bodies).
export function MatterDetailClient({
  matters,
  detail,
  matterId,
  threadId,
  paymentsEnabled,
  user,
}: {
  matters: MatterListItemDto[];
  detail: MatterDetailDto;
  matterId: string;
  threadId: string | null;
  paymentsEnabled: boolean;
  user: { full_name?: string; email?: string };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<string>("Timeline");
  const [isPending, startTransition] = useTransition();
  const { matter, side } = detail;
  const counterpart = side === "advocate" ? matter.account?.display_name?.replace(/\s*\([0-9a-f]{6}\)$/, "") : `Adv. ${matter.advocate?.user?.full_name?.replace(/^Adv\.?\s*/i, "")}`;
  const tabs = side === "client" ? [...TABS, "Access"] : TABS;

  function closeMatter() {
    if (!window.confirm("Close this matter? Your advocate will be notified.")) return;
    startTransition(async () => {
      await patchMatterAction(matterId, { stage: "closed" });
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 900 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {matters.map((m) => (
          <Link key={m.id} href={`/matters/${m.id}`}>
            <Pill active={m.id === matterId}>{m.title}</Pill>
          </Link>
        ))}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>{matter.title}</div>
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
              {matter.reference} · Opened {fmtDate(matter.opened_at)}
              {matter.forum ? ` · ${matter.forum}` : ""}
              {matter.practice_area?.name ? ` · ${matter.practice_area.name}` : ""}
            </div>
          </div>
          {side === "client" && !["closed", "archived"].includes(matter.stage) && (
            <Button variant="outline" onClick={closeMatter} disabled={isPending} style={{ width: "auto" }}>
              Close matter
            </Button>
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <ProgressBar pct={stageProgress(matter.stage)} />
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
            {STAGE_LABEL[matter.stage]}
            {matter.next_action ? ` · Next: ${matter.next_action}` : ""}
          </div>
        </div>
      </div>

      {side !== "viewer" && (
        <Card style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <AvatarTile initials={initials(counterpart)} />
            <div>
              <div style={{ fontWeight: 700 }}>{counterpart}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{matter.engaged_at ? `Engaged ${fmtDate(matter.engaged_at)}` : "Engagement pending"}</div>
            </div>
          </div>
          {threadId && (
            <Link href={`/messages/${threadId}`}>
              <Button variant="outline" style={{ width: "auto" }}>
                Secure message
              </Button>
            </Link>
          )}
        </Card>
      )}

      {side === "advocate" && <AdvocateControls key={matter.updated_at} matter={matter} matterId={matterId} />}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <Pill key={t} active={tab === t} onClick={() => setTab(t)}>
            {t}
          </Pill>
        ))}
      </div>

      {tab === "Timeline" && <Timeline events={detail.timeline} />}
      {tab === "Tasks & hearings" && <TasksAndHearings matterId={matterId} side={side} tasks={detail.tasks} hearings={detail.hearings} />}
      {tab === "Documents" && <MatterDocuments matter={matter} matterId={matterId} side={side} documents={detail.documents} />}
      {tab === "Fees" && (
        <Fees matterId={matterId} side={side} feeProposals={detail.feeProposals} invoices={detail.invoices} paymentsEnabled={paymentsEnabled} user={user} />
      )}
      {tab === "Access" && side === "client" && <Access matterId={matterId} matter={matter} access={detail.access} />}
    </div>
  );
}
