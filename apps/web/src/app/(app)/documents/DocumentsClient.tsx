"use client";

import { useState } from "react";
import type { ConsultationListItemDto, DocumentListItemDto, MatterListItemDto } from "@vidhira/contracts";
import { DOCUMENT_KINDS } from "@vidhira/contracts";
import { Pill, EmptyState } from "@/components/ui";
import { DocumentRow } from "@/components/documents/DocumentRow";
import { UploadForm } from "@/components/documents/UploadForm";

export function DocumentsClient({
  documents,
  matters,
  consultations,
  defaultAccountId,
  advocateMode,
}: {
  documents: DocumentListItemDto[];
  matters: MatterListItemDto[];
  consultations: ConsultationListItemDto[];
  defaultAccountId: string | null;
  advocateMode: boolean;
}) {
  const [filter, setFilter] = useState<string>("All");
  const rows = documents.filter((d) => filter === "All" || d.kind === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 800 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Documents</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Stored privately and encrypted at rest. Only you — and an advocate you choose to share a document with — can open it. Platform staff cannot browse
          your files through the product.
        </p>
      </div>

      {defaultAccountId && <UploadForm accountId={defaultAccountId} />}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["All", ...DOCUMENT_KINDS].map((k) => (
          <Pill key={k} active={filter === k} onClick={() => setFilter(k)}>
            {k}
          </Pill>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No documents" body={advocateMode ? "Documents clients share with you appear here." : "Upload a document to get started."} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((d) => (
            <DocumentRow key={d.id} doc={d} matters={matters} consultations={consultations} />
          ))}
        </div>
      )}
    </div>
  );
}
