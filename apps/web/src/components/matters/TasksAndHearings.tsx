"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HearingDto, TaskDto } from "@vidhira/contracts";
import { Card, Button, Callout, EmptyState, Select } from "@/components/ui";
import { TextInput } from "@/components/forms";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { addHearingAction, addTaskAction, completeTaskAction } from "@/server/mattersActions";

// Ported from frontend/src/screens/matter/MatterTabs.jsx's TasksAndHearings.
export function TasksAndHearings({ matterId, side, tasks, hearings }: { matterId: string; side: "client" | "advocate" | "viewer"; tasks: TaskDto[]; hearings: HearingDto[] }) {
  const router = useRouter();
  const [task, setTask] = useState({ label: "", ownerType: "client" as "client" | "advocate", dueAt: "" });
  const [hearing, setHearing] = useState({ listedAt: "", forum: "", courtHall: "", purpose: "" });
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const [now] = useState(() => Date.now());
  const upcoming = hearings.filter((h) => new Date(h.listed_at) >= new Date(now - 86400000));

  function toggle(id: string, completed: boolean) {
    startTransition(async () => {
      await completeTaskAction(matterId, id, completed);
      router.refresh();
    });
  }

  function submitTask() {
    setError(undefined);
    startTransition(async () => {
      const result = await addTaskAction(matterId, {
        label: task.label,
        ownerType: task.ownerType,
        isStatutoryDeadline: false,
        ...(task.dueAt ? { dueAt: new Date(`${task.dueAt}T18:00:00+05:30`).toISOString() } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTask({ label: "", ownerType: "client", dueAt: "" });
      router.refresh();
    });
  }

  function submitHearing() {
    setError(undefined);
    startTransition(async () => {
      const result = await addHearingAction(matterId, {
        listedAt: new Date(`${hearing.listedAt}:00+05:30`).toISOString(),
        forum: hearing.forum || undefined,
        courtHall: hearing.courtHall || undefined,
        purpose: hearing.purpose || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHearing({ listedAt: "", forum: "", courtHall: "", purpose: "" });
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {tasks.length === 0 && <EmptyState title="No tasks" body={side === "advocate" ? "Add the first task for your client below." : "Your advocate will add tasks here."} />}
      {tasks.map((t) => {
        const mine = t.owner_type === side;
        return (
          <Card key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
            <input type="checkbox" checked={Boolean(t.completed_at)} disabled={!mine || isPending} onChange={(e) => toggle(t.id, e.target.checked)} aria-label={t.label} />
            <div style={{ flex: 1, textDecoration: t.completed_at ? "line-through" : "none" }}>
              <div style={{ fontSize: 13.5 }}>{t.label}</div>
              <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                {t.due_at ? `Due ${fmtDate(t.due_at)} · ` : ""}
                {t.owner_type === "client" ? "Client" : "Advocate"}
                {t.is_statutory_deadline ? " · statutory deadline" : ""}
              </div>
            </div>
          </Card>
        );
      })}

      {upcoming.map((h) => (
        <Callout key={h.id} tone="warning">
          Hearing listed: {fmtDateTime(h.listed_at)} · {h.forum}
          {h.court_hall ? ` · Hall ${h.court_hall}` : ""}
          {h.purpose ? ` · ${h.purpose}` : ""}
        </Callout>
      ))}

      {error && <Callout tone="danger">{error}</Callout>}

      {side === "advocate" && (
        <>
          <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Add a task</div>
            <TextInput label="Task" value={task.label} onChange={(e) => setTask({ ...task, label: e.target.value })} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <Select label="For" value={task.ownerType} onChange={(e) => setTask({ ...task, ownerType: e.target.value as "client" | "advocate" })} options={[["client", "Client"], ["advocate", "Advocate"]] as const} />
              <TextInput label="Due (optional)" type="date" value={task.dueAt} onChange={(e) => setTask({ ...task, dueAt: e.target.value })} />
            </div>
            <Button onClick={submitTask} disabled={task.label.trim().length < 2 || isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
              Add task
            </Button>
          </Card>
          <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>List a hearing</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <TextInput label="Date & time" type="datetime-local" value={hearing.listedAt} onChange={(e) => setHearing({ ...hearing, listedAt: e.target.value })} />
              <TextInput label="Forum" value={hearing.forum} onChange={(e) => setHearing({ ...hearing, forum: e.target.value })} />
              <TextInput label="Court hall" value={hearing.courtHall} onChange={(e) => setHearing({ ...hearing, courtHall: e.target.value })} />
              <TextInput label="Purpose" value={hearing.purpose} onChange={(e) => setHearing({ ...hearing, purpose: e.target.value })} />
            </div>
            <Button onClick={submitHearing} disabled={!hearing.listedAt || isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
              List hearing
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
