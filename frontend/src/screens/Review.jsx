import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { useConfig, useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Pill, Badge, Button, Callout, EmptyState, Loading, QueryBoundary } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { Field, Select, TextInput, inputStyle, useFormValidation } from "../components/forms";
import { fmtDate } from "../lib/format";

const FAVOR_TONE = { drafter: "success", counterparty: "danger", balanced: "neutral" };
const FAVOR_LABEL = { drafter: "Favours you", counterparty: "Favours them", balanced: "Balanced" };

function Findings({ review }) {
  const { go } = useUI();
  const [filter, setFilter] = useState("All");
  const findings = review.findings.filter((f) => filter === "All" || (filter === "Favours them" ? f.favors === "counterparty" : filter === "Balanced" ? f.favors === "balanced" : filter === "Favours you" ? f.favors === "drafter" : !f.favors));
  const count = (k) => review.findings.filter((f) => f.favors === k).length;
  const exportNote = useMut(() => api.download(`/contract-reviews/${review.id}/export`, "contract-review-note.docx"), { success: "Negotiation note downloaded." });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{review.document?.filename}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{review.contract_type}{review.counterparty_name ? ` vs ${review.counterparty_name}` : ""} · {review.clauses_identified} clauses read · {fmtDate(review.created_at)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Badge tone="danger">{count("counterparty")} favours them</Badge><Badge>{count("balanced")} balanced</Badge><Badge tone="success">{count("drafter")} favours you</Badge>
        </div>
      </Card>
      {review.notes && <Callout tone="neutral">{review.notes}</Callout>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{["All", "Favours them", "Balanced", "Favours you", "Not assessed"].map((f) => <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Pill>)}</div>
      {findings.length === 0 && <EmptyState title="No findings in this filter" body="Try a different filter." />}
      {findings.map((f) => (
        <Card key={f.id}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>{f.clause_type} <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>{f.clause_ref}</span></div>
            {f.favors ? <Badge tone={FAVOR_TONE[f.favors]}>{FAVOR_LABEL[f.favors]}</Badge> : <Badge>Not assessed</Badge>}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 6, whiteSpace: "pre-wrap" }}>{f.extracted_text}</div>
          <Callout tone="neutral" style={{ marginTop: 8 }} title={`Compared with baseline “${f.library_entry?.title || f.clause_type}”${f.similarity ? ` (similarity ${Math.round(f.similarity * 100)}%)` : ""}`}>{f.deviation_note}</Callout>
          {f.why_it_matters && <Callout tone="warning" style={{ marginTop: 8 }} title="Why it matters">{f.why_it_matters}</Callout>}
          {f.recommended_ask && <Callout tone="success" style={{ marginTop: 8 }} title="What to ask for">{f.recommended_ask}</Callout>}
        </Card>
      ))}
      <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>An automated comparison against a balanced baseline — not a legal opinion. Clauses with no close baseline are not assessed.</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button onClick={() => exportNote.mutate()} disabled={exportNote.isPending}>Export negotiation note</Button>
        <Button variant="outline" onClick={() => go("find")}>Have an advocate review it</Button>
      </div>
    </div>
  );
}

export function Review() {
  const { activeAccount } = useAuth();
  const config = useConfig();
  const templates = useGet("/doc-templates");
  const past = useGet("/contract-reviews");
  const [contractType, setContractType] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [file, setFile] = useState(null);
  const [current, setCurrent] = useState(null);
  const { errors, registerField, validate, clearError } = useFormValidation();

  const run = useMut(async () => {
    const form = new FormData();
    form.set("accountId", activeAccount.id);
    form.set("kind", "Agreements");
    form.set("file", file);
    const doc = await api.upload("/documents", form);
    return api.post("/contract-reviews", { documentId: doc.id, contractType, counterpartyName: counterparty || undefined });
  }, { invalidate: ["/contract-reviews", "/documents"], onSuccess: async (r) => setCurrent(await api.get(`/contract-reviews/${r.id}`)) });
  const open = useMut((id) => api.get(`/contract-reviews/${id}`), { onSuccess: setCurrent });

  const disabled = config.data && !config.data.research.enabled;

  function submitReview() {
    const ok = validate([
      ["contractType", !contractType, "Select what kind of contract this is."],
      ["file", !file, "Choose a contract file to upload."],
    ]);
    if (ok) run.mutate();
  }
  return (
    <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Contract review" subtitle="Upload a contract and see how each clause compares with a balanced baseline from our clause library. This is not a legal opinion." />

      {disabled && <Callout tone="warning" title="Not enabled on this deployment">Contract review needs the knowledge base (Qdrant + OpenRouter embeddings) to be configured.</Callout>}

      {current ? (
        <>
          <Button variant="ghost" onClick={() => setCurrent(null)} style={{ alignSelf: "flex-start" }}>← New review</Button>
          <Findings review={current} />
        </>
      ) : (
        <>
          <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Select
              ref={registerField("contractType")}
              label="What kind of contract is it?"
              value={contractType}
              onChange={(e) => { setContractType(e.target.value); clearError("contractType"); }}
              placeholder="Select…"
              options={(templates.data || []).map((t) => [t.category, t.name])}
              hint="We can only compare against contract types in our clause library."
              error={errors.contractType}
            />
            <TextInput label="Other party (optional)" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
            <Field label="Contract file (PDF with selectable text, DOCX or TXT · 25 MB max)" error={errors.file}>
              <input ref={registerField("file")} type="file" accept=".pdf,.docx,.txt" onChange={(e) => { setFile(e.target.files?.[0] || null); clearError("file"); }} style={inputStyle} />
            </Field>
            <Button onClick={submitReview} disabled={run.isPending || disabled || !activeAccount}>{run.isPending ? "Reading and comparing clauses…" : "Review contract"}</Button>
            {run.isPending && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>This can take up to a minute for long contracts.</div>}
          </Card>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Your previous reviews</div>
            <QueryBoundary query={past} empty={<div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Nothing yet.</div>}>
              {(list) => list.map((r) => (
                <Card key={r.id} style={{ marginBottom: 8, padding: 12, display: "flex", justifyContent: "space-between", cursor: "pointer" }} onClick={() => open.mutate(r.id)}>
                  <span>{r.document?.filename} <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>· {r.contract_type}</span></span><span style={{ fontSize: 12 }}>{fmtDate(r.created_at)}</span>
                </Card>
              ))}
            </QueryBoundary>
            {open.isPending && <Loading />}
          </div>
        </>
      )}
    </div>
  );
}
