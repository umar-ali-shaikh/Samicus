"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ConsultationListItemDto, DocumentListItemDto, MatterListItemDto } from "@vidhira/contracts";
import { Badge, inputStyle } from "@/components/ui";
import { shareDocumentAction } from "@/server/documentsActions";

// Ported from frontend/src/screens/Documents.jsx's ShareControl. Only advocates this account
// actually works with (per its matters/consultations) can be chosen -- matches the server's
// own allow-list check in service.ts's shareDocument.
export function ShareControl({ doc, matters, consultations }: { doc: DocumentListItemDto; matters: MatterListItemDto[]; consultations: ConsultationListItemDto[] }) {
  const router = useRouter();
  const [advocateId, setAdvocateId] = useState("");
  const [, startTransition] = useTransition();

  const options = new Map<string, string | undefined>();
  for (const m of matters) if (m.account_id === doc.account_id && m.advocate) options.set(m.advocate.id, m.advocate.user?.full_name);
  for (const c of consultations) if (c.account_id === doc.account_id && c.advocate) options.set(c.advocate.id, c.advocate.user?.full_name);
  const sharedWith = doc.shared_with.filter((id) => options.has(id));

  function share(id: string, value: boolean) {
    startTransition(async () => {
      await shareDocumentAction(doc.id, id, value, doc.matter_id);
      router.refresh();
    });
  }

  if (options.size === 0) {
    return <span style={{ fontSize: 11.5, color: "var(--color-label)" }}>Private — sharing is available once you work with an advocate</span>;
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {sharedWith.map((id) => (
        <button key={id} onClick={() => share(id, false)} type="button" style={{ border: "none", background: "none", cursor: "pointer" }}>
          <Badge tone="success">Shared with Adv. {options.get(id)?.replace(/^Adv\.?\s*/i, "")} ✕</Badge>
        </button>
      ))}
      <select
        value={advocateId}
        onChange={(e) => {
          if (e.target.value) share(e.target.value, true);
          setAdvocateId("");
        }}
        aria-label="Share with"
        style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontSize: 12 }}
      >
        <option value="">Share with…</option>
        {[...options].filter(([id]) => !sharedWith.includes(id)).map(([id, name]) => (
          <option key={id} value={id}>
            Adv. {name?.replace(/^Adv\.?\s*/i, "")}
          </option>
        ))}
      </select>
    </div>
  );
}
