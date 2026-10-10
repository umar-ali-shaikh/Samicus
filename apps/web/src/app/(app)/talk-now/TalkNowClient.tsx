"use client";

import { useState, useTransition } from "react";
import type { SituationDto } from "@vidhira/contracts";
import { Card, Button, Callout, Select } from "@/components/ui";
import { TextArea } from "@/components/forms";
import { LiveConsult } from "@/components/intake/LiveConsult";
import { NoAdvocatesFallback } from "@/components/advocates/NoAdvocatesFallback";
import { LANGUAGES, STATES } from "@/lib/format";
import { startInstantIntakeAction } from "@/server/intakeActions";

// Ported from frontend/src/screens/TalkNow.jsx. The Hindi/English situation-label toggle
// (useUI().lang) isn't ported -- apps/web has no i18n context yet -- so labels stay English-only.
export function TalkNowClient({
  situations,
  paymentsEnabled,
  user,
}: {
  situations: SituationDto[];
  paymentsEnabled: boolean;
  user: { full_name?: string; email?: string };
}) {
  const [form, setForm] = useState({ description: "", situationId: "", urgency: "today", mode: "video", language: "en", state: "", consent: false });
  const [live, setLive] = useState<{ intakeId: string; matchCount: number } | null>(null);
  const [validationError, setValidationError] = useState("");
  const [isPending, startTransition] = useTransition();
  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const none = live && live.matchCount === 0;
  const situationPracticeAreaId = situations.find((s) => s.id === form.situationId)?.mapped_practice_area?.id;

  function onSubmit() {
    if (form.description.trim().length < 10) return setValidationError("Describe the issue in at least a few words (10+ characters).");
    if (!form.situationId) return setValidationError("Choose the issue type that's closest to your situation.");
    if (!form.consent) return setValidationError("Please tick the consent box so an advocate can review your issue.");
    setValidationError("");
    setLive(null);
    startTransition(async () => {
      const result = await startInstantIntakeAction({
        description: form.description.trim(),
        situationId: form.situationId,
        urgency: form.urgency as "today" | "48h",
        mode: form.mode as "video" | "phone" | "chat",
        language: form.language,
        state: form.state || undefined,
        kind: "instant",
      });
      if (!result.ok) {
        setValidationError(result.error);
        return;
      }
      setLive({ intakeId: result.intakeId, matchCount: result.matchCount });
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 560 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Talk now</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Only the category and city are shared before the advocate&apos;s conflict check clears.</p>
      </div>

      {live && !none ? (
        <LiveConsult intakeId={live.intakeId} onCancelled={() => setLive(null)} onGone={() => setLive(null)} paymentsEnabled={paymentsEnabled} user={user} />
      ) : (
        <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <TextArea label="What's going on?" rows={3} value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Describe the issue in a few sentences" />
          <Select
            label="What kind of issue is it?"
            value={form.situationId}
            onChange={(e) => patch({ situationId: e.target.value })}
            placeholder="Choose the closest match"
            options={situations.map((s) => [s.id, s.label_en] as const)}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <Select label="Urgency" value={form.urgency} onChange={(e) => patch({ urgency: e.target.value })} options={[["today", "Today"], ["48h", "Within 48h"]] as const} />
            <Select label="Mode" value={form.mode} onChange={(e) => patch({ mode: e.target.value })} options={[["video", "Video"], ["phone", "Phone"], ["chat", "Chat"]] as const} />
            <Select label="Language" value={form.language} onChange={(e) => patch({ language: e.target.value })} options={LANGUAGES} />
            <Select label="State (optional)" value={form.state} onChange={(e) => patch({ state: e.target.value })} placeholder="Any" options={STATES} />
          </div>
          {none && <NoAdvocatesFallback practiceAreaId={situationPracticeAreaId} title="No verified advocate is currently available for those preferences" />}
          <label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(e) => {
                patch({ consent: e.target.checked });
                setValidationError("");
              }}
              style={{ marginTop: 3 }}
            />
            I consent to sharing my described issue with the advocate who accepts, after their conflict check clears.
          </label>
          {validationError && <Callout tone="danger">{validationError}</Callout>}
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? "Finding advocates…" : "Find an available advocate"}
          </Button>
          <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>The advocate&apos;s fee is shown before you pay or join.</div>
        </Card>
      )}
    </div>
  );
}
