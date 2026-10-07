"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ConsultationListItemDto, DocumentListItemDto, MatterListItemDto } from "@vidhira/contracts";
import { Card, Button, Callout } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { deleteDocumentAction, downloadDocumentAction } from "@/server/documentsActions";
import { ShareControl } from "./ShareControl";

// Ported from frontend/src/screens/Documents.jsx's document row.
export function DocumentRow({ doc, matters, consultations }: { doc: DocumentListItemDto; matters: MatterListItemDto[]; consultations: ConsultationListItemDto[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function download() {
    setError(undefined);
    startTransition(async () => {
      const { url } = await downloadDocumentAction(doc.id);
      window.open(url, "_blank", "noopener");
    });
  }

  function remove() {
    if (!window.confirm(`Delete "${doc.filename}"?`)) return;
    setError(undefined);
    startTransition(async () => {
      const result = await deleteDocumentAction(doc.id, doc.matter_id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{doc.filename}</div>
        <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
          {Math.max(1, Math.round((doc.size_bytes || 0) / 1024))} KB · {doc.kind} · {fmtDate(doc.created_at)}
          {doc.sharedWithMe && !doc.owned ? " · shared with you" : ""}
        </div>
        {doc.virus_scan_status === "pending" && <div style={{ fontSize: 11, color: "var(--color-label)" }}>Not virus-scanned — open files from people you don&apos;t know with care.</div>}
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {doc.owned && <ShareControl doc={doc} matters={matters} consultations={consultations} />}
        <Button variant="outline" onClick={download} disabled={isPending} style={{ width: "auto" }}>
          Download
        </Button>
        {doc.owned && (
          <Button variant="ghost" onClick={remove} disabled={isPending} style={{ width: "auto" }}>
            Delete
          </Button>
        )}
      </div>
    </Card>
  );
}
