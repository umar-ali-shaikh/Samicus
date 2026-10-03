import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Callout, ProgressBar, Badge, Loading } from "../components/ui";
import { STAGE_LABEL, stageProgress, inr, fmtDateTime, fmtDate } from "../lib/format";

const TILES = [
  { tab: "talknow", label: "Talk now", sub: "Instant consultation" },
  { tab: "find", label: "Book", sub: "Schedule an advocate" },
  { tab: "documents", label: "Documents", sub: "Your document library" },
  { tab: "services", label: "Services", sub: "Fixed-fee legal work" },
  { tab: "draft", label: "Draft", sub: "Generate a document" },
];

function Tasks() {
  const tasks = useGet("/tasks/mine");
  const done = useMut(({ matterId, id, completed }) => api.post(`/matters/${matterId}/tasks/${id}/complete`, { completed }), { invalidate: ["/tasks/mine", "/matters"] });
  if (tasks.isPending) return <Loading />;
  const list = (tasks.data || []).slice(0, 5);
  if (list.length === 0) return <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Nothing due. Tasks from your advocate will show up here.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {list.map((t) => (
        <Card key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: 12 }}>
          <input type="checkbox" checked={false} onChange={() => done.mutate({ matterId: t.matter_id, id: t.id, completed: true })} aria-label={`Mark done: ${t.label}`} />
          <div style={{ fontSize: 12.5 }}>
            {t.label}
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{t.matter?.title}{t.due_at ? ` · due ${fmtDate(t.due_at)}` : ""}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function BusinessDesk({ account }) {
  const { go } = useUI();
  const spend = useGet(`/accounts/${account.id}/legal-spend`, undefined, { enabled: ["owner", "admin", "finance"].includes(account.myRole) });
  const t = spend.data?.totals;
  return (
    <Card>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, marginBottom: 8 }}>Business legal desk</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, fontSize: 12.5, marginBottom: 12 }}>
        {[["Contract review", "review"], ["Draft agreements", "draft"], ["Pack compliance", "pack"], ["Find an advocate", "find"], ["Fixed-fee services", "services"]].map(([l, tab]) => (
          <button key={l} onClick={() => go(tab)} style={{ textAlign: "left", padding: 10, border: "1px solid var(--color-border)", borderRadius: 9, background: "#fff", cursor: "pointer" }}>{l}</button>
        ))}
      </div>
      {spend.isPending ? <Loading /> : t ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          {[["Billed to date", inr(t.total)], ["Paid", inr(t.paid)], ["Outstanding", inr(t.total - t.paid)], ["Open matters", spend.data.openMatters]].map(([l, v]) => (
            <div key={l} style={{ background: "#FBF8F2", border: "1px solid var(--color-border)", borderRadius: 9, padding: 10, textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>{v}</div>
              <div style={{ fontSize: 10.5, color: "var(--color-label)" }}>{l}</div>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export function Home() {
  const { user, activeAccount } = useAuth();
  const { go, openModal, lang } = useUI();
  const [text, setText] = useState("");
  const situations = useGet("/situations", undefined, { staleTime: 60 * 60 * 1000 });
  const matters = useGet("/matters");
  const consultations = useGet("/consultations");

  const myMatters = (matters.data || []).filter((m) => m.account_id === activeAccount?.id && m.mySide === "client" && !["closed", "archived"].includes(m.stage));
  const upcoming = (consultations.data || [])
    .filter((c) => c.account_id === activeAccount?.id && ["scheduled", "reminder_sent", "in_progress"].includes(c.state) && new Date(c.scheduled_start) > new Date(Date.now() - 3 * 3600 * 1000))
    .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 24 }}>Hello, {user?.full_name?.split(" ")[0]}</div>
        <Badge tone="info">Secure & confidential intake</Badge>
      </div>

      <Card style={{ background: "var(--color-navy)", color: "#F6F1E8", border: "none" }}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>What's going on? Describe it in your own words.</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="e.g. My landlord is refusing to return my security deposit…"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #2A3854", background: "#18233A", color: "#fff", resize: "vertical" }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {(situations.data || []).slice(0, 8).map((s) => (
            <button key={s.id} onClick={() => openModal("booking", { description: text, situationId: s.id })} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #2A3854", background: "#182338", color: "#F6F1E8", fontSize: 12, cursor: "pointer" }}>
              {lang === "hi" ? s.label_hi : s.label_en}
            </button>
          ))}
        </div>
        <button onClick={() => openModal("booking", { description: text })} style={{ marginTop: 12, background: "var(--color-gold)", color: "var(--color-navy)", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>
          Get matched with an advocate
        </button>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {TILES.map((t) => (
          <button key={t.tab} onClick={() => go(t.tab)} style={{ textAlign: "left", padding: 14, borderRadius: 12, border: "1px solid var(--color-border)", background: "#fff", cursor: "pointer" }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.label}</div>
            <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{t.sub}</div>
          </button>
        ))}
      </div>

      <Callout tone="danger">
        Time-critical matter? <button onClick={() => openModal("urgent")} style={{ background: "none", border: "none", color: "#8E2C18", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Get urgent help now</button>
      </Callout>

      {upcoming.length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, marginBottom: 10 }}>Upcoming consultations</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {upcoming.slice(0, 3).map((c) => (
              <Card key={c.id} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }} onClick={() => go("consultations")}>
                <div><div style={{ fontWeight: 700 }}>{c.advocate?.user?.full_name}</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{c.mode.replace("_", " ")} · {fmtDateTime(c.scheduled_start)}</div></div>
                <Badge tone="info">{c.state.replace("_", " ")}</Badge>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 280 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, marginBottom: 10 }}>Active matters</div>
          {matters.isPending ? <Loading /> : myMatters.length === 0 ? (
            <Card><div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No active matters yet. Once an advocate accepts your request, your matter appears here with its timeline, tasks and fees.</div></Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {myMatters.map((m) => (
                <Card key={m.id} style={{ cursor: "pointer" }} onClick={() => go("matters", m.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700 }}>{m.title}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.reference}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "6px 0" }}>{STAGE_LABEL[m.stage]}{m.next_action ? ` · ${m.next_action}` : ""}</div>
                  <ProgressBar pct={stageProgress(m.stage)} />
                </Card>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, marginBottom: 10 }}>Your tasks</div>
          <Tasks />
        </div>
      </div>

      {activeAccount?.type === "business" && <BusinessDesk account={activeAccount} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Card style={{ cursor: "pointer" }} onClick={() => go("legalassistant")}><div style={{ fontWeight: 700 }}>AI legal assistant</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Cited answers from real Indian sources</div></Card>
        <Card style={{ cursor: "pointer" }} onClick={() => go("review")}><div style={{ fontWeight: 700 }}>Review a contract</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Compare it with a balanced baseline</div></Card>
        <Card style={{ cursor: "pointer" }} onClick={() => go("learn")}><div style={{ fontWeight: 700 }}>Ask anonymously</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Post a public question</div></Card>
      </div>

      <Callout tone="neutral" title="Free legal aid">
        You may be eligible for free legal aid under the Legal Services Authorities Act, 1987. The National Legal Services Authority helpline is <strong>15100</strong> — <a href="https://nalsa.gov.in" target="_blank" rel="noreferrer">nalsa.gov.in</a>.
      </Callout>
    </div>
  );
}
