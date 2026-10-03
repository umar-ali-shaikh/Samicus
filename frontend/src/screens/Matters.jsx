import { useAppState } from "../state/AppState";
import { MATTERS, TASKS, STAGES } from "../data/mockData";
import { Card, Pill, Badge, Callout, Button, AvatarTile, ProgressBar } from "../components/ui";

const TABS = ["Timeline", "Tasks & hearings", "Documents", "Fees", "Access"];

export function Matters() {
  const { state, act } = useAppState();
  const isBusiness = state.account === "business";
  const matters = MATTERS.filter((m) => m.forBusiness === isBusiness);
  const matter = matters.find((m) => m.id === state.matterId) || matters[0];
  const tasks = TASKS.filter((t) => t.matter === matter.id);
  const totalDue = matter.fees.reduce((s, f) => s + f.amount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {matters.map((m) => <Pill key={m.id} active={matter.id === m.id} onClick={() => act.openMatter(m.id)}>{m.short}</Pill>)}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>{matter.title}</div>
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{matter.ref} · Opened {matter.opened} · {matter.forum}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="outline" onClick={() => act.openQuote(matter.lawyerId)}>Fee quotation</Button>
            <Button variant="outline" onClick={() => act.showToast("Matter closed.")}>Close matter</Button>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <ProgressBar pct={(matter.stage / STAGES.length) * 100} />
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>{STAGES[matter.stage - 1]} · Next: {matter.nextAction}</div>
        </div>
      </div>

      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <AvatarTile initials={matter.lawyerInitials} />
          <div>
            <div style={{ fontWeight: 700 }}>{matter.lawyer}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Engaged {matter.engagedOn || "pending"}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" onClick={() => act.go("messages")}>Secure message</Button>
          <Button variant="outline" onClick={act.addMember}>Add team/family member</Button>
        </div>
      </Card>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TABS.map((t) => <Pill key={t} active={state.matterTab === t} onClick={() => act.setMatterTab(t)}>{t}</Pill>)}
      </div>

      {state.matterTab === "Timeline" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {matter.timeline.map((ev, i) => (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-navy)", marginTop: 6, flex: "none" }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{ev.title}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{ev.body}</div>
                <div style={{ fontSize: 11, color: "var(--color-label)" }}>{ev.when} · {ev.who}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {state.matterTab === "Tasks & hearings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tasks.map((t) => (
            <Card key={t.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={!!state.tasksDone[t.id] || t.done} onChange={() => act.toggleTask(t.id)} />
              <div style={{ flex: 1, textDecoration: (state.tasksDone[t.id] || t.done) ? "line-through" : "none" }}>
                <div style={{ fontSize: 13.5 }}>{t.label}</div>
                <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Due {t.due} · {t.owner}</div>
              </div>
            </Card>
          ))}
          {matter.stage >= 4 && (
            <Callout tone="warning" title="Hearing listed">{matter.forum} · Hall 4 · Next hearing in 2 weeks</Callout>
          )}
        </div>
      )}

      {state.matterTab === "Documents" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {matter.docs.map((d, i) => (
            <Card key={i} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{d.meta}</div>
              </div>
              <Badge tone={d.tag.includes("Shared") ? "success" : "neutral"}>{d.tag}</Badge>
            </Card>
          ))}
          <Button variant="outline" onClick={() => act.go("documents")} style={{ alignSelf: "flex-start" }}>Upload to this matter</Button>
        </div>
      )}

      {state.matterTab === "Fees" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {matter.fees.map((f, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span>{f.label} <Badge tone={f.gov ? "warning" : "neutral"}>{f.gov ? "government" : "professional"}</Badge></span>
              <span>₹{f.amount}</span>
            </div>
          ))}
          <Callout tone="warning">Payable now: ₹{totalDue} <Button style={{ marginLeft: 10 }} onClick={() => act.openPay(`₹${totalDue}`)}>Pay invoice</Button></Callout>
          <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Court fees, professional fees and the platform fee are always itemized separately, never a single opaque total.</div>
        </div>
      )}

      {state.matterTab === "Access" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { id: "a1", name: matter.lawyer, role: "Engaged advocate" },
            { id: "a2", name: "Finance Head", role: "Fees only" },
            { id: "a3", name: "Ops Viewer", role: "Viewer" },
          ].map((a) => {
            const on = state.access[a.id] !== undefined ? state.access[a.id] : true;
            return (
              <Card key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{a.role}</div>
                </div>
                <Button variant="outline" onClick={() => act.toggleAccess(a.id, !on)}>{on ? "Revoke" : "Grant"}</Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
