import { useAppState } from "../state/AppState";
import { TEMPLATES, FAVORS } from "../data/mockData";
import { Card, Pill, Badge, Button, Callout } from "../components/ui";

const STEPS = ["Template", "Your details", "Special clauses", "Review & issue"];
const FAVOR_LABEL = { drafter: "FAVOURS YOU", counterparty: "FAVOURS THEM", balanced: "BALANCED" };

export function Draft() {
  const { state, act } = useAppState();
  const { draft } = state;
  const template = TEMPLATES.find((t) => t.id === draft.templateId);

  const blocks = (() => {
    let n = 0;
    const base = template.sections.map((s) => { n += 1; return { n, h: s.h, text: s.t(draft.fields) }; });
    const chosen = template.clauses.filter((c) => draft.clauses[c.id]).map((c) => { n += 1; return { n, h: c.title, text: c.text(draft.fields), flag: c.flag, favors: FAVORS[c.id] }; });
    const custom = draft.custom ? [(() => { n += 1; return { n, h: "Additional clause agreed between the parties", text: draft.custom, custom: true }; })()] : [];
    return [...base, ...chosen, ...custom];
  })();

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 400px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Draft a document</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{STEPS.map((s, i) => <Pill key={s} active={draft.step === i + 1}>{i + 1}. {s}</Pill>)}</div>

        {draft.step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {TEMPLATES.map((t) => (
              <Card key={t.id} style={{ cursor: "pointer" }} onClick={() => act.setDraftTemplate(t.id)}>
                <div style={{ fontWeight: 700 }}>{t.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{t.blurb}</div>
                <div style={{ fontSize: 11.5, color: "var(--color-label)", marginTop: 4 }}>{t.pages} pages · Draft free · advocate review ₹1,499</div>
              </Card>
            ))}
          </div>
        )}

        {draft.step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {template.fields.map((f) => (
              <div key={f.k}>
                <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{f.label}</label>
                <input placeholder={f.ph} value={draft.fields[f.k] || ""} onChange={(e) => act.setDraftField(f.k, e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }} />
              </div>
            ))}
            <Button onClick={() => act.setDraftStep(3)}>Continue</Button>
          </div>
        )}

        {draft.step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Button variant="outline" onClick={act.addRecommended}>Add all recommended</Button>
            {template.clauses.map((c) => (
              <Card key={c.id} style={{ cursor: "pointer" }} onClick={() => act.toggleClause(c.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                    <input type="checkbox" checked={!!draft.clauses[c.id]} readOnly /> {c.title}
                  </label>
                  <Badge tone={FAVORS[c.id] === "drafter" ? "success" : FAVORS[c.id] === "counterparty" ? "danger" : "neutral"}>{FAVOR_LABEL[FAVORS[c.id]]}</Badge>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>{c.note}</div>
                {c.rec && <Badge tone="info">RECOMMENDED</Badge>}
                {c.flag === "review" && <Badge tone="warning">ADVOCATE REVIEW ADVISED</Badge>}
              </Card>
            ))}
            <textarea placeholder="Add a custom clause (not reviewed automatically)…" value={draft.custom} onChange={(e) => act.setCustomClause(e.target.value)} rows={2} style={{ padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }} />
            <Button onClick={() => act.setDraftStep(4)}>Continue</Button>
          </div>
        )}

        {draft.step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Callout tone="warning">This is a standard draft, not legal advice, until reviewed by a named verified advocate.</Callout>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button onClick={act.downloadDraft}>Download DOCX</Button>
              <Button variant="outline" onClick={act.downloadDraft}>Download PDF</Button>
              <Button variant="outline" onClick={act.sendForReview}>{draft.reviewed ? "Sent for advocate review" : "Advocate review · ₹1,499"}</Button>
              <Button variant="outline" onClick={act.eStamp}>Add e-stamp & registration support</Button>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: "1 1 300px", minWidth: 0 }}>
        <Card style={{ position: "sticky", top: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--color-label)", marginBottom: 8 }}>DRAFT · NOT EXECUTED</div>
          {blocks.map((b) => (
            <div key={b.n} style={{ marginBottom: 10, opacity: b.custom ? 0.85 : 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>{b.n}. {b.h}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{b.text}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
