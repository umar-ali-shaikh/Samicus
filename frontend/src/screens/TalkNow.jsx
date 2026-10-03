import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Button, Callout } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { Select, TextArea } from "../components/forms";
import { LiveConsult } from "../components/LiveConsult";
import { LANGUAGES, STATES } from "../lib/format";

export function TalkNow() {
  const { activeAccount } = useAuth();
  const { lang } = useUI();
  const situations = useGet("/situations", undefined, { staleTime: 3600000 });
  const [form, setForm] = useState({ description: "", situationId: "", urgency: "today", mode: "video", language: "en", state: "", consent: false });
  const [live, setLive] = useState(null); // { intakeId, startedAt }
  const patch = (p) => setForm((f) => ({ ...f, ...p }));

  const start = useMut(async () => {
    const intake = await api.post("/intake-requests", {
      accountId: activeAccount?.id, description: form.description.trim(), situationId: form.situationId, urgency: form.urgency,
      mode: form.mode, language: form.language, state: form.state || undefined, kind: "instant",
    });
    await api.post(`/intake-requests/${intake.id}/consent`);
    // Computing the matches is what offers the request to the best-matched advocates.
    const { matches } = await api.get(`/intake-requests/${intake.id}/matches`);
    return { intake, count: matches.length };
  }, { onSuccess: ({ intake, count }) => setLive({ intakeId: intake.id, startedAt: Date.now(), count }) });

  const none = start.data && start.data.count === 0;
  const ready = form.description.trim().length >= 10 && form.situationId && form.consent;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Talk now" subtitle="Only the category and city are shared before the advocate's conflict check clears." />

      {live && !none ? (
        <div style={{ maxWidth: 560 }}><LiveConsult intakeId={live.intakeId} startedAt={live.startedAt} onCancelled={() => setLive(null)} onGone={() => setLive(null)} /></div>
      ) : (
        <Card style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 12 }}>
          <TextArea label="What's going on?" rows={3} value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Describe the issue in a few sentences" />
          <Select label="What kind of issue is it?" value={form.situationId} onChange={(e) => patch({ situationId: e.target.value })} placeholder="Choose the closest match" options={(situations.data || []).map((s) => [s.id, lang === "hi" ? s.label_hi : s.label_en])} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <Select label="Urgency" value={form.urgency} onChange={(e) => patch({ urgency: e.target.value })} options={[["today", "Today"], ["48h", "Within 48h"]]} />
            <Select label="Mode" value={form.mode} onChange={(e) => patch({ mode: e.target.value })} options={[["video", "Video"], ["phone", "Phone"], ["chat", "Chat"]]} />
            <Select label="Language" value={form.language} onChange={(e) => patch({ language: e.target.value })} options={LANGUAGES} />
            <Select label="State (optional)" value={form.state} onChange={(e) => patch({ state: e.target.value })} placeholder="Any" options={STATES} />
          </div>
          {none && <Callout tone="warning">No verified advocate is currently available for those preferences. Try another language or mode, or <a href="#find">browse advocates</a> to book a slot.</Callout>}
          <label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
            <input type="checkbox" checked={form.consent} onChange={(e) => patch({ consent: e.target.checked })} style={{ marginTop: 3 }} />
            I consent to sharing my described issue with the advocate who accepts, after their conflict check clears.
          </label>
          <Button onClick={() => { setLive(null); start.mutate(); }} disabled={!ready || start.isPending}>{start.isPending ? "Finding advocates…" : "Find an available advocate"}</Button>
          <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>The advocate's fee is shown before you pay or join.</div>
        </Card>
      )}
    </div>
  );
}
