"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MatterDocumentDto, MatterDto } from "@vidhira/contracts";
import { Card, Badge, Button, EmptyState } from "@/components/ui";
import { UploadForm } from "@/components/documents/UploadForm";
import { fmtDate } from "@/lib/format";
import { downloadDocumentAction, shareDocumentAction } from "@/server/documentsActions";

// Ported from frontend/src/screens/matter/MatterTabs.jsx's MatterDocuments. Unlike the
// library-wide /documents page's ShareControl (any advocate the account works with), a
// matter has exactly one engaged advocate, so sharing here is a single on/off toggle.
export function MatterDocuments({ matter, matterId, side, documents }: { matter: MatterDto; matterId: string; side: "client" | "advocate" | "viewer"; documents: MatterDocumentDto[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const advocateId = matter.advocate?.id || matter.advocate_id;

  function download(id: string) {
    startTransition(async () => {
      const { url } = await downloadDocumentAction(id);
      window.open(url, "_blank", "noopener");
    });
  }

  function toggleShare(id: string, next: boolean) {
    startTransition(async () => {
      await shareDocumentAction(id, advocateId, next, matterId);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {documents.length === 0 && <EmptyState title="No documents" body={side === "advocate" ? "Documents your client shares with you appear here." : "Upload documents for this matter below."} />}
      {documents.map((d) => {
        const shared = d.shared_with.includes(advocateId);
        return (
          <Card key={d.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.filename}</div>
              <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                {d.kind} · {Math.max(1, Math.round((d.size_bytes || 0) / 1024))} KB · {fmtDate(d.created_at)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Button variant="outline" onClick={() => download(d.id)} disabled={isPending} style={{ width: "auto" }}>
                Download
              </Button>
              {side === "client" && (
                <button onClick={() => toggleShare(d.id, !shared)} disabled={isPending} type="button" style={{ border: "none", background: "none", cursor: "pointer" }}>
                  <Badge tone={shared ? "success" : "neutral"}>{shared ? "Shared — click to revoke" : "Private — click to share"}</Badge>
                </button>
              )}
            </div>
          </Card>
        );
      })}
      {side === "client" && <UploadForm accountId={matter.account_id} matterId={matterId} label="Upload a document for this matter" />}
    </div>
  );
}
