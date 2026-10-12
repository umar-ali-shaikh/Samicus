"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DocTemplateListItemDto } from "@vidhira/contracts";
import { Card, Select, Field, Button, Callout, inputStyle } from "@/components/ui";
import { TextInput } from "@/components/forms";
import { uploadDocumentAction } from "@/server/documentsActions";
import { createContractReviewAction } from "@/server/contractReviewActions";

// Ported from frontend/src/screens/Review.jsx's upload form.
export function ReviewUploadClient({ templates, accountId, disabled }: { templates: DocTemplateListItemDto[]; accountId: string | null; disabled: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [contractType, setContractType] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ contractType?: string; file?: string }>({});
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function submit() {
    const nextErrors: { contractType?: string; file?: string } = {};
    if (!contractType) nextErrors.contractType = "Select what kind of contract this is.";
    if (!file) nextErrors.file = "Choose a contract file to upload.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !accountId) return;

    setError(undefined);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("accountId", accountId);
      formData.set("kind", "Agreements");
      formData.set("file", file!);
      const uploaded = await uploadDocumentAction(formData);
      if (!uploaded.ok) {
        setError(uploaded.error);
        return;
      }
      const created = await createContractReviewAction({ documentId: uploaded.doc.id, contractType, counterpartyName: counterparty || undefined });
      if (!created.ok) {
        setError(created.error);
        return;
      }
      router.push(`/contract-review/${created.review.id}`);
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {error && <Callout tone="danger">{error}</Callout>}
      <Select
        label="What kind of contract is it?"
        value={contractType}
        onChange={(e) => {
          setContractType(e.target.value);
          setErrors((er) => ({ ...er, contractType: undefined }));
        }}
        placeholder="Select…"
        options={templates.map((t) => [t.category ?? "", t.name] as const)}
        hint="We can only compare against contract types in our clause library."
        error={errors.contractType}
      />
      <TextInput label="Other party (optional)" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
      <Field label="Contract file (PDF with selectable text, DOCX or TXT · 25 MB max)" error={errors.file}>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setErrors((er) => ({ ...er, file: undefined }));
          }}
          style={inputStyle}
        />
      </Field>
      <Button onClick={submit} disabled={isPending || disabled || !accountId} style={{ width: "auto" }}>
        {isPending ? "Reading and comparing clauses…" : "Review contract"}
      </Button>
      {isPending && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>This can take up to a minute for long contracts.</div>}
    </Card>
  );
}
