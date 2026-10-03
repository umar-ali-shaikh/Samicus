import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Pill, Button, AvatarTile, ProgressBar, QueryBoundary, EmptyState, Loading, ErrorNote } from "../components/ui";
import { Select, TextInput } from "../components/forms";
import { PageHeader } from "../components/PageHeader";
import { STAGE_LABEL, fmtDate, initials, stageProgress } from "../lib/format";
import { Access, Fees, MatterDocuments, TasksAndHearings, Timeline } from "./matter/MatterTabs";

const STAGE_OPTIONS = [["consultation", "Consultation"], ["engagement_confirmed", "Engagement confirmed"], ["action_in_progress", "Action in progress"], ["resolution", "Resolution"], ["closed", "Closed"]];

function AdvocateControls({ data, matterId }) {
  const [stage, setStage] = useState(data.matter.stage === "lawyer_matched" || data.matter.stage === "intake" ? "consultation" : data.matter.stage);
  const [nextAction, setNextAction] = useState(data.matter.next_action || "");
  const save = useMut((b) => api.patch(`/matters/${matterId}`, b), { invalidate: ["/matters"], success: "Matter updated." });
  return (
    <Card style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
      <Select label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} options={STAGE_OPTIONS} style={{ minWidth: 190 }} />
      <TextInput label="Next action" value={nextAction} onChange={(e) => setNextAction(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
      <Button onClick={() => save.mutate({ stage, nextAction })} disabled={save.isPending}>Save</Button>
    </Card>
  );
}

function MatterDetail({ id }) {
  const { go } = useUI();
  const detail = useGet(`/matters/${id}`);
  const threads = useGet("/threads");
  const [tab, setTab] = useState("Timeline");
  const close = useMut(() => api.patch(`/matters/${id}`, { stage: "closed" }), { invalidate: ["/matters"], success: "Matter closed." });

  if (detail.isPending) return <Loading />;
  if (detail.isError) return <ErrorNote error={detail.error} onRetry={detail.refetch} />;
  const data = detail.data;
  const { matter, side } = data;
  const counterpart = side === "advocate" ? matter.account?.display_name?.replace(/\s*\([0-9a-f]{6}\)$/, "") : `Adv. ${matter.advocate?.user?.full_name?.replace(/^Adv\.?\s*/i, "")}`;
  const thread = (threads.data || []).find((t) => t.matter?.reference === matter.reference);
  const tabs = ["Timeline", "Tasks & hearings", "Documents", "Fees", ...(side === "client" ? ["Access"] : [])];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>{matter.title}</div>
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{matter.reference} · Opened {fmtDate(matter.opened_at)}{matter.forum ? ` · ${matter.forum}` : ""}{matter.practice_area?.name ? ` · ${matter.practice_area.name}` : ""}</div>
          </div>
          {side === "client" && !["closed", "archived"].includes(matter.stage) && (
            <Button variant="outline" onClick={() => window.confirm("Close this matter? Your advocate will be notified.") && close.mutate()}>Close matter</Button>
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <ProgressBar pct={stageProgress(matter.stage)} />
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>{STAGE_LABEL[matter.stage]}{matter.next_action ? ` · Next: ${matter.next_action}` : ""}</div>
        </div>
      </div>

      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <AvatarTile initials={initials(counterpart)} />
          <div>
            <div style={{ fontWeight: 700 }}>{counterpart}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{matter.engaged_at ? `Engaged ${fmtDate(matter.engaged_at)}` : "Engagement pending"}</div>
          </div>
        </div>
        <Button variant="outline" onClick={() => go("messages", thread?.id || "")}>Secure message</Button>
      </Card>

      {side === "advocate" && <AdvocateControls key={matter.updated_at} data={data} matterId={id} />}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{tabs.map((t) => <Pill key={t} active={tab === t} onClick={() => setTab(t)}>{t}</Pill>)}</div>

      {tab === "Timeline" && <Timeline data={data} />}
      {tab === "Tasks & hearings" && <TasksAndHearings data={data} matterId={id} />}
      {tab === "Documents" && <MatterDocuments data={data} matterId={id} />}
      {tab === "Fees" && <Fees data={data} matterId={id} />}
      {tab === "Access" && <Access data={data} matterId={id} />}
    </div>
  );
}

export function Matters() {
  const { user, activeAccount } = useAuth();
  const { param, go, actAsClient } = useUI();
  const matters = useGet("/matters");
  const advocateMode = user?.role === "advocate" && !actAsClient;

  const mine = (matters.data || []).filter((m) => (advocateMode ? m.mySide === "advocate" : m.mySide === "client" && m.account_id === activeAccount?.id));
  const selected = mine.find((m) => m.id === param) || mine[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title={advocateMode ? "Matters" : "My matters"} />
      <QueryBoundary query={matters} isEmpty={() => mine.length === 0} empty={<EmptyState title="No matters yet" body={advocateMode ? "Matters appear here when you accept a client request or open one after a consultation." : "Once an advocate accepts your request or you confirm an engagement, your matter appears here."} />}>
        {() => (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {mine.map((m) => <Pill key={m.id} active={selected?.id === m.id} onClick={() => go("matters", m.id)}>{m.title}</Pill>)}
            </div>
            {selected && <MatterDetail key={selected.id} id={selected.id} />}
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
