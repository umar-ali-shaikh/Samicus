"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssembledBlockDto, ClauseDto, DirectoryItemDto, DocTemplateDetailDto, DocumentDraftDto } from "@vidhira/contracts";
import { Card, Pill, Badge, Button, Callout, Select, EmptyState, Loading } from "@/components/ui";
import { TextInput } from "@/components/forms";
import { inr } from "@/lib/format";
import { patchDraftAction, previewDraftAction, requestDraftReviewAction } from "@/server/draftingActions";
import { payFor } from "@/lib/payments";

const STEPS = ["Your details", "Special clauses", "Review & issue"];
const FAVOR_LABEL: Record<string, string> = { drafter: "FAVOURS YOU", counterparty: "FAVOURS THEM", balanced: "BALANCED" };
const FAVOR_TONE: Record<string, "success" | "danger" | "neutral"> = { drafter: "success", counterparty: "danger", balanced: "neutral" };

function applyTemplateDefaults(
  fields: Record<string, string>,
  fieldSchema: DocTemplateDetailDto["template"]["field_schema"],
): Record<string, string> {
  const next = { ...fields };
  for (const f of fieldSchema) {
    if (f.default !== undefined && !String(next[f.key] || "").trim()) next[f.key] = f.default;
  }
  return next;
}

function Preview({ draftId, version }: { draftId: string; version: number }) {
  const [blocks, setBlocks] = useState<AssembledBlockDto[] | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      previewDraftAction(draftId).then((r) => {
        if (r.ok) {
          setBlocks(r.preview.blocks);
          setError("");
        } else {
          setError(r.error);
        }
      });
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
          <div style={{ fontWeight: 700, fontSize: 12.5 }}>
            {b.n}. {b.heading} {b.reviewAdvised && <Badge tone="warning">REVIEW ADVISED</Badge>}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "pre-wrap" }}>{b.text}</div>
        </div>
      ))}
    </Card>
  );
}

export function DraftEditorClient({
  draft,
  template,
  clauses,
  advocates,
  paymentsEnabled,
  user,
}: {
  draft: DocumentDraftDto;
  template: DocTemplateDetailDto["template"];
  clauses: ClauseDto[];
  advocates: DirectoryItemDto[];
  paymentsEnabled: boolean;
  user: { full_name?: string; email?: string | null };
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [fields, setFields] = useState<Record<string, string>>(() => applyTemplateDefaults(draft.field_values, template.field_schema));
  const [selected, setSelected] = useState<string[]>(draft.selected_clause_ids);
  const [custom, setCustom] = useState(draft.custom_clauses[0]?.body || "");
  const [version, setVersion] = useState(0);
  const [advocateId, setAdvocateId] = useState("");
  const [status, setStatus] = useState(draft.status);
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const missingFields = template.field_schema.filter((f) => f.required && !String(fields[f.key] || "").trim()).map((f) => f.label);

  // Re-apply the new template's defaults when the template itself changes (not on every
  // re-render) -- calling setState here, during render, rather than in an effect, is React's own
  // documented pattern for "adjusting state when a prop changes" (same frontend/src/screens/Draft.jsx
  // behaviour, applied once per template load).
  const [defaultsAppliedFor, setDefaultsAppliedFor] = useState(template.id);
  if (template.id !== defaultsAppliedFor) {
    setDefaultsAppliedFor(template.id);
    setFields((f) => applyTemplateDefaults(f, template.field_schema));
  }

  function commit(patch: { fieldValues?: Record<string, string>; selectedClauseIds?: string[]; customClauses?: Array<{ body: string }> }) {
    startTransition(async () => {
      const result = await patchDraftAction(draft.id, patch);
      if (!result.ok) setError(result.error);
      else setVersion((v) => v + 1);
    });
  }

  function requestReview() {
    setError(undefined);
    startTransition(async () => {
      const result = await requestDraftReviewAction(draft.id, advocateId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatus("sent_for_review");
      if (paymentsEnabled) {
        try {
          await payFor("draft_review", result.review.id, { user, description: "Advocate review of draft" });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Payment failed.");
        }
      }
      setSent(true);
    });
  }

  function download(format: "docx" | "pdf") {
    window.open(`/api/bff/drafts/${draft.id}/download?format=${format}`, "_blank", "noopener");
  }

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", padding: 24 }}>
      <div style={{ flex: "1 1 400px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="ghost" onClick={() => router.push("/drafts")} style={{ width: "auto" }}>
            ← Drafts
          </Button>
          {STEPS.map((s, i) => (
            <Pill key={s} active={step === i + 1} onClick={() => i === 0 || setStep(i + 1)}>
              {i + 1}. {s}
            </Pill>
          ))}
        </div>

        {error && <Callout tone="danger">{error}</Callout>}

        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {template.field_schema.map((f) => (
              <TextInput
                key={f.key}
                label={f.label + (f.required ? " *" : "")}
                placeholder={f.placeholder ?? undefined}
                value={fields[f.key] || ""}
                onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                onBlur={() => commit({ fieldValues: fields })}
              />
            ))}
            {missingFields.length > 0 && <Callout tone="danger">Required (marked *): {missingFields.join(", ")}.</Callout>}
            <Button
              onClick={() => {
                commit({ fieldValues: fields });
                setStep(2);
              }}
              disabled={missingFields.length > 0}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Button
              variant="outline"
              onClick={() => {
                const rec = clauses.filter((c) => c.disposition === "recommended").map((c) => c.id);
                const next = [...new Set([...selected, ...rec])];
                setSelected(next);
                commit({ fieldValues: fields, selectedClauseIds: next });
              }}
            >
              Add all recommended
            </Button>
            {clauses.length === 0 && <EmptyState title="No optional clauses" body="This template has no clause library entries." />}
            {clauses.map((c) => {
              const on = selected.includes(c.id);
              return (
                <div
                  key={c.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    const next = on ? selected.filter((x) => x !== c.id) : [...selected, c.id];
                    setSelected(next);
                    commit({ fieldValues: fields, selectedClauseIds: next });
                  }}
                >
                  <Card>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                      {/* Not a <label>: wrapping the checkbox would make the browser dispatch a second, synthetic click on it, double-toggling selection. */}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                        <input type="checkbox" checked={on} readOnly /> {c.title}
                      </div>
                      <Badge tone={FAVOR_TONE[c.favors]}>{FAVOR_LABEL[c.favors]}</Badge>
                    </div>
                    {c.rationale_note && <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>{c.rationale_note}</div>}
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      {c.disposition === "recommended" && <Badge tone="info">RECOMMENDED</Badge>}
                      {c.disposition === "review_advised" && <Badge tone="warning">ADVOCATE REVIEW ADVISED</Badge>}
                    </div>
                  </Card>
                </div>
              );
            })}
            <TextInput
              label="Add a custom clause (not reviewed automatically)"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={() => commit({ customClauses: custom.trim() ? [{ body: custom.trim() }] : [] })}
            />
            <Button
              onClick={() => {
                commit({ customClauses: custom.trim() ? [{ body: custom.trim() }] : [] });
                setStep(3);
              }}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Callout tone="warning">
              This is a standard draft, not legal advice, until reviewed by a named verified advocate. {template.stamp_duty_note}
            </Callout>
            {missingFields.length > 0 && (
              <Callout tone="danger">
                Fill in the required fields before downloading: {missingFields.join(", ")}.{" "}
                <button onClick={() => setStep(1)} style={{ all: "unset", cursor: "pointer", fontWeight: 700, textDecoration: "underline" }}>
                  Go back to Your details
                </button>
              </Callout>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button onClick={() => download("docx")} disabled={missingFields.length > 0}>
                Download DOCX
              </Button>
              <Button variant="outline" onClick={() => download("pdf")} disabled={missingFields.length > 0}>
                Download PDF
              </Button>
            </div>
            <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontWeight: 700 }}>Advocate review · {inr(template.review_fee)} + fees</div>
              {status === "sent_for_review" || sent ? (
                <Badge tone="success">Sent for advocate review</Badge>
              ) : advocates.length === 0 ? (
                <div style={{ fontSize: 12.5 }}>No verified advocates are listed yet.</div>
              ) : (
                <>
                  <Select
                    label="Choose an advocate"
                    value={advocateId}
                    onChange={(e) => setAdvocateId(e.target.value)}
                    placeholder="Select…"
                    options={advocates.map((a) => [a.id, `Adv. ${(a.user?.full_name || "").replace(/^Adv\.?\s*/i, "")} · ${a.practice_areas.map((p) => p.name).join(", ")}`])}
                  />
                  <Button onClick={requestReview} disabled={!advocateId || isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
                    {isPending ? "Sending…" : paymentsEnabled ? "Request review & pay" : "Request review"}
                  </Button>
                </>
              )}
            </Card>
            <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>
              e-Stamping is not handled in the app — your advocate can advise on stamp duty and registration for your state.
            </div>
          </div>
        )}
      </div>
      <div style={{ flex: "1 1 300px", minWidth: 0 }}>
        <Preview draftId={draft.id} version={version} />
      </div>
    </div>
  );
}
