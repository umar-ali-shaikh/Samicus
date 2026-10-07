"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Callout, Select, Field, inputStyle } from "@/components/ui";
import { DOCUMENT_KINDS } from "@vidhira/contracts";
import { uploadDocumentAction } from "@/server/documentsActions";

// Ported from frontend/src/screens/Documents.jsx's upload card. Uploads immediately on file
// selection, same as the original (no separate submit button).
export function UploadForm({ accountId, matterId, label }: { accountId: string; matterId?: string; label?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<(typeof DOCUMENT_KINDS)[number]>("Evidence");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(undefined);
    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("kind", kind);
    if (matterId) formData.set("matterId", matterId);
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadDocumentAction(formData);
      if (!result.ok) setError(result.error);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", border: "1.5px dashed var(--color-border)" }}>
      <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value as (typeof DOCUMENT_KINDS)[number])} options={DOCUMENT_KINDS} style={{ minWidth: 150 }} />
      <Field label={label ?? "Upload a document (PDF, DOC/DOCX, TXT, JPG, PNG · up to 25 MB)"} style={{ flex: 1, minWidth: 240 }}>
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" disabled={isPending} onChange={onChange} style={inputStyle} />
      </Field>
      {isPending && <span style={{ fontSize: 12 }}>Uploading…</span>}
      {error && <Callout tone="danger">{error}</Callout>}
    </Card>
  );
}
