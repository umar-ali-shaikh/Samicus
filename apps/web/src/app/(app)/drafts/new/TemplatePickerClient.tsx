"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DocTemplateListItemDto } from "@vidhira/contracts";
import { Card, Callout } from "@/components/ui";
import { inr } from "@/lib/format";
import { createDraftAction } from "@/server/draftingActions";

// Ported from frontend/src/screens/Draft.jsx's "Template" step.
export function TemplatePickerClient({ templates }: { templates: DocTemplateListItemDto[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function pick(templateId: string) {
    if (isPending) return;
    setError(undefined);
    startTransition(async () => {
      const result = await createDraftAction({ templateId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/drafts/${result.draft.id}`);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {error && <Callout tone="danger">{error}</Callout>}
      {templates.map((t) => (
        <div key={t.id} onClick={() => pick(t.id)} style={{ cursor: isPending ? "default" : "pointer", opacity: isPending ? 0.6 : 1 }}>
          <Card>
            <div style={{ fontWeight: 700 }}>{t.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{t.blurb}</div>
            <div style={{ fontSize: 11.5, color: "var(--color-label)", marginTop: 4 }}>
              {t.pages ? `${t.pages} pages · ` : ""}Draft free · advocate review {inr(t.review_fee)}
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}
