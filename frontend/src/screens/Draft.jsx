import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useGet, useMut, useConfig } from "../api/hooks";
import { api } from "../lib/api";
import { payFor } from "../lib/payments";
import { Card, Pill, Badge, Button, Callout, QueryBoundary, EmptyState, Loading } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { Select, TextInput } from "../components/forms";
import { inr } from "../lib/format";

const STEPS = ["Template", "Your details", "Special clauses", "Review & issue"];
const FAVOR_LABEL = { drafter: "FAVOURS YOU", counterparty: "FAVOURS THEM", balanced: "BALANCED" };
const FAVOR_TONE = { drafter: "success", counterparty: "danger", balanced: "neutral" };

function Preview({ draftId, version }) {
  const [blocks, setBlocks] = useState(null);
  const [error, setError] = useState("");
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.post(`/drafts/${draftId}/preview`).then((r) => { setBlocks(r.blocks); setError(""); }).catch((e) => setError(e.message));
    }, 350);
    return () => clearTimeout(timer.current);
  }, [draftId, version]);
  return (
    <Card style={{ position: "sticky", top: 0 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--color-label)", marginBottom: 8 }}>DRAFT · NOT EXECUTED</div>
      {error && <Callout tone="danger">{error}</Callout>}
      {!blocks && !error && <Loading />}
      {(blocks || []).map((b) => (
        <div key={b.n} style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 12.5 }}>{b.n}. {b.heading} {b.reviewAdvised && <Badge tone="warning">REVIEW ADVISED</Badge>}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "pre-wrap" }}>{b.text}</div>
        </div>
      ))}
    </Card>
  );
}

function Editor({ templateId, draft, onBack }) {
  const { user, activeAccount } = useAuth();
  const config = useConfig();
  const template = useGet(`/doc-templates/${templateId}`);
  const [step, setStep] = useState(2);
  const [fields, setFields] = useState(draft.field_values || {});
  const [selected, setSelected] = useState(draft.selected_clause_ids || []);
  const [custom, setCustom] = useState((draft.custom_clauses || [])[0]?.body || "");
  const [version, setVersion] = useState(0);
  const [advocateId, setAdvocateId] = useState("");
  const save = useMut((b) => api.patch(`/drafts/${draft.id}`, b), { silent: false, onSuccess: () => setVersion((v) => v + 1) });
  const advocates = useGet("/advocates", undefined, { enabled: step === 4, staleTime: 60000 });
  const review = useMut(async () => {
    const r = await api.post(`/drafts/${draft.id}/reviews`, { advocateId });
    if (config.data?.payments?.enabled) await payFor("draft_review", r.id, { user, description: "Advocate review of draft" });
    return r;
  }, { invalidate: ["/drafts"], success: "Sent for advocate review." });
  const download = useMut((fmt) => api.download(`/drafts/${draft.id}/download?format=${fmt}`, `draft.${fmt}`), { success: "Downloaded." });

  const t = template.data?.template;
  const clauses = template.data?.clauses || [];
  const commit = (patch) => save.mutate(patch);
  const missingFields = (t?.field_schema || []).filter((f) => f.required && !String(fields[f.key] || "").trim()).map((f) => f.label);

  if (template.isPending) return <Loading />;
  if (template.isError) return <Callout tone="danger">{template.error.message}</Callout>;
  void activeAccount;

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 400px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="ghost" onClick={onBack}>← Templates</Button>
          {STEPS.map((s, i) => <Pill key={s} active={step === i + 1} onClick={() => i > 0 && setStep(i + 1)}>{i + 1}. {s}</Pill>)}
        </div>

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(t.field_schema || []).map((f) => (
              <TextInput key={f.key} label={f.label + (f.required ? " *" : "")} placeholder={f.placeholder} value={fields[f.key] || ""} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} onBlur={() => commit({ fieldValues: fields })} />
            ))}
            {missingFields.length > 0 && <Callout tone="danger">Required (marked *): {missingFields.join(", ")}.</Callout>}
            <Button onClick={() => { commit({ fieldValues: fields }); setStep(3); }} disabled={missingFields.length > 0}>Continue</Button>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Button variant="outline" onClick={() => { const rec = clauses.filter((c) => c.disposition === "recommended").map((c) => c.id); const next = [...new Set([...selected, ...rec])]; setSelected(next); commit({ fieldValues: fields, selectedClauseIds: next }); }}>Add all recommended</Button>
            {clauses.length === 0 && <EmptyState title="No optional clauses" body="This template has no clause library entries." />}
            {clauses.map((c) => {
              const on = selected.includes(c.id);
              return (
                <Card key={c.id} style={{ cursor: "pointer" }} onClick={() => { const next = on ? selected.filter((x) => x !== c.id) : [...selected, c.id]; setSelected(next); commit({ fieldValues: fields, selectedClauseIds: next }); }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}><input type="checkbox" checked={on} readOnly /> {c.title}</label>
                    <Badge tone={FAVOR_TONE[c.favors]}>{FAVOR_LABEL[c.favors]}</Badge>
                  </div>
                  {c.rationale_note && <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>{c.rationale_note}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>{c.disposition === "recommended" && <Badge tone="info">RECOMMENDED</Badge>}{c.disposition === "review_advised" && <Badge tone="warning">ADVOCATE REVIEW ADVISED</Badge>}</div>
                </Card>
              );
            })}
            <TextInput label="Add a custom clause (not reviewed automatically)" value={custom} onChange={(e) => setCustom(e.target.value)} onBlur={() => commit({ customClauses: custom.trim() ? [{ body: custom.trim() }] : [] })} />
            <Button onClick={() => { commit({ customClauses: custom.trim() ? [{ body: custom.trim() }] : [] }); setStep(4); }}>Continue</Button>
          </div>
        )}

        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Callout tone="warning">This is a standard draft, not legal advice, until reviewed by a named verified advocate. {t.stamp_duty_note}</Callout>
            {missingFields.length > 0 && (
              <Callout tone="danger">
                Fill in the required fields before downloading: {missingFields.join(", ")}.{" "}
                <button onClick={() => setStep(2)} style={{ all: "unset", cursor: "pointer", fontWeight: 700, textDecoration: "underline" }}>Go back to Your details</button>
              </Callout>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button onClick={() => download.mutate("docx")} disabled={download.isPending || missingFields.length > 0}>Download DOCX</Button>
              <Button variant="outline" onClick={() => download.mutate("pdf")} disabled={download.isPending || missingFields.length > 0}>Download PDF</Button>
            </div>
            <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontWeight: 700 }}>Advocate review · {inr(t.review_fee)} + fees</div>
              {draft.status === "sent_for_review" || review.isSuccess ? <Badge tone="success">Sent for advocate review</Badge> : (
                <>
                  <QueryBoundary query={advocates} empty={<div style={{ fontSize: 12.5 }}>No verified advocates are listed yet.</div>}>
                    {(list) => <Select label="Choose an advocate" value={advocateId} onChange={(e) => setAdvocateId(e.target.value)} placeholder="Select…" options={list.map((a) => [a.id, `Adv. ${a.user?.full_name?.replace(/^Adv\.?\s*/i, "")} · ${(a.practice_areas || []).map((p) => p.name).join(", ")}`])} />}
                  </QueryBoundary>
                  <Button onClick={() => review.mutate()} disabled={!advocateId || review.isPending} style={{ alignSelf: "flex-start" }}>{review.isPending ? "Sending…" : config.data?.payments?.enabled ? "Request review & pay" : "Request review"}</Button>
                </>
              )}
            </Card>
            <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>e-Stamping is not handled in the app — your advocate can advise on stamp duty and registration for your state.</div>
          </div>
        )}
      </div>
      <div style={{ flex: "1 1 300px", minWidth: 0 }}><Preview draftId={draft.id} version={version} /></div>
    </div>
  );
}

export function Draft() {
  const { activeAccount } = useAuth();
  const templates = useGet("/doc-templates");
  const drafts = useGet("/drafts");
  const [current, setCurrent] = useState(null); // { templateId, draft }
  const create = useMut((templateId) => api.post("/drafts", { templateId, accountId: activeAccount?.id }).then((d) => ({ templateId, draft: d })), { invalidate: ["/drafts"], onSuccess: setCurrent });
  const open = useMut((d) => api.get(`/drafts/${d.id}`).then((full) => ({ templateId: full.template_id, draft: full })), { onSuccess: setCurrent });

  if (current) return <Editor key={current.draft.id} templateId={current.templateId} draft={current.draft} onBack={() => setCurrent(null)} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Draft a document" subtitle="Pick a template, fill in your details and choose clauses. Every clause says whom it favours. Drafts are free; advocate review is optional." />
      <QueryBoundary query={templates} empty={<EmptyState title="No templates yet" body="Document templates will appear here once they're published." />}>
        {(list) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {list.map((t) => (
              <Card key={t.id} style={{ cursor: "pointer" }} onClick={() => !create.isPending && create.mutate(t.id)}>
                <div style={{ fontWeight: 700 }}>{t.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{t.blurb}</div>
                <div style={{ fontSize: 11.5, color: "var(--color-label)", marginTop: 4 }}>{t.pages ? `${t.pages} pages · ` : ""}Draft free · advocate review {inr(t.review_fee)}</div>
              </Card>
            ))}
          </div>
        )}
      </QueryBoundary>

      {drafts.data?.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Your recent drafts</div>
          {drafts.data.slice(0, 5).map((d) => (
            <Card key={d.id} style={{ marginBottom: 8, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => open.mutate(d)}>
              <span>{d.template?.name}</span><Badge>{d.status.replace("_", " ")}</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
