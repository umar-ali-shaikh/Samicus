"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdvocateDto, AvailabilityDayDto, SituationDto } from "@vidhira/contracts";
import { Button, Callout, RadioCard, AvatarTile, VerifiedBadge, Loading, ErrorNote, Card } from "@/components/ui";
import { Select } from "@/components/ui";
import { TextInput, TextArea } from "@/components/forms";
import { computeFees, fmtDate, inr, initials, languageName, LANGUAGES, MODES, STATES, URGENCY_OPTIONS, modeName } from "@/lib/format";
import { createBookingIntakeAction, confirmBookingAction, getAdvocateSlotsAction } from "@/server/bookingActions";
import { payFor } from "@/lib/payments";

const TITLES: Record<number, string> = {
  1: "Describe the issue",
  2: "How soon do you need help?",
  3: "Location and jurisdiction",
  4: "Consultation mode",
  5: "Preferred language",
  6: "Choose a date and slot",
  7: "Transparent pricing",
  8: "Confirm",
  9: "Booking confirmed",
};
const TOTAL_STEPS = 9;

interface Slot {
  time: string;
  startsAt: string;
  full: boolean;
  date: string;
}

// Ported from frontend/src/modals/BookingModal.jsx, scoped to this route's always-preset
// advocate (apps/web's /advocates/[advocateId]/book) -- so the original's step 6
// "advocates matched to your issue" match-picking step is dropped; every other step and its
// copy/validation is unchanged.
export function BookingWizard({
  advocate,
  situations,
  paymentsEnabled,
  user,
}: {
  advocate: AdvocateDto;
  situations: SituationDto[];
  paymentsEnabled: boolean;
  user: { full_name?: string; email?: string };
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    description: "",
    counterparty: "",
    situationId: "",
    areaId: "",
    urgency: "week",
    state: "",
    city: "",
    mode: advocate.consultation_modes[0] ?? "video",
    language: "en",
  });
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [intakeKey, setIntakeKey] = useState("");
  const [slots, setSlots] = useState<AvailabilityDayDto[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | undefined>();
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<{ consultation: { id: string }; paid: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const situation = situations.find((s) => s.id === form.situationId);
  const routedAreaId = form.areaId || situation?.mapped_practice_area_id || advocate.practice_areas[0]?.id || "";
  const routedArea = advocate.practice_areas.find((a) => a.id === routedAreaId) || situation?.mapped_practice_area;

  const modeOptions = useMemo(() => MODES.filter(([v]) => advocate.consultation_modes.includes(v)), [advocate.consultation_modes]);

  const stepComplete = {
    1: Boolean(routedAreaId && (form.description.trim().length >= 10 || form.situationId)),
    2: true,
    3: true,
    4: Boolean(form.mode),
    5: Boolean(form.language),
    6: Boolean(slot),
    7: true,
    8: consent,
    9: true,
  }[step];

  useEffect(() => {
    if (step !== 6) return;
    startTransition(async () => {
      setSlotsError(undefined);
      setSlots(null);
      try {
        const data = await getAdvocateSlotsAction(advocate.id);
        setSlots(data);
      } catch {
        setSlotsError("Could not load availability. Please try again.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function next() {
    if (!stepComplete) return;
    if (step !== 5) {
      setStep((s) => Math.min(TOTAL_STEPS, s + 1));
      return;
    }
    const key = JSON.stringify([form, routedAreaId]);
    if (intakeId && key === intakeKey) {
      setStep((s) => Math.min(TOTAL_STEPS, s + 1));
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await createBookingIntakeAction({
        description: form.description.trim() || undefined,
        counterpartyName: form.counterparty.trim() || undefined,
        situationId: form.situationId || undefined,
        routedPracticeAreaId: form.areaId || (situation ? undefined : routedAreaId) || undefined,
        urgency: form.urgency as "today" | "48h" | "week" | "deadline",
        state: form.state || undefined,
        city: form.city.trim() || undefined,
        mode: form.mode as "video" | "phone" | "chat" | "in_person",
        language: form.language,
        kind: "scheduled",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIntakeId(result.intakeId);
      setIntakeKey(key);
      setStep((s) => Math.min(TOTAL_STEPS, s + 1));
    });
  }

  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  function confirm() {
    if (!intakeId || !slot) return;
    setError(undefined);
    startTransition(async () => {
      const res = await confirmBookingAction(intakeId, {
        intakeId,
        advocateId: advocate.id,
        mode: form.mode as "video" | "phone" | "chat" | "in_person",
        scheduledStart: slot.startsAt,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      let paid = false;
      if (paymentsEnabled) {
        try {
          paid = await payFor("consultation", res.consultation.id, { user, description: "Consultation" });
        } catch (err) {
          setError(`${err instanceof Error ? err.message : "Payment failed."} Your slot is held — you can pay from Consultations.`);
        }
      }
      setResult({ consultation: res.consultation, paid });
      setStep(9);
    });
  }

  const fees = computeFees(advocate.scheduled_fee ?? advocate.instant_fee ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 640 }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Step {step} of {TOTAL_STEPS}</div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>{TITLES[step]}</h1>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 5, borderRadius: 999, background: i < step ? "#159C6E" : "var(--color-border)" }} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <AvatarTile initials={initials(advocate.user?.full_name)} />
        <div>
          <div style={{ fontWeight: 700 }}>Adv. {advocate.user?.full_name?.replace(/^Adv\.?\s*/i, "")}</div>
          <VerifiedBadge />
        </div>
      </div>

      <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <TextArea
              label="What's happening?"
              rows={4}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Describe the issue in your own words…"
              hint="Only the category and city are shared until the advocate's conflict check clears and you consent."
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {situations.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => patch({ situationId: s.id, areaId: "" })}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 999,
                    border: `1px solid ${form.situationId === s.id ? "var(--color-navy)" : "var(--color-border)"}`,
                    background: form.situationId === s.id ? "var(--color-navy)" : "#fff",
                    color: form.situationId === s.id ? "#fff" : "var(--color-ink)",
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  {s.label_en}
                </button>
              ))}
            </div>
            <Select
              label="Or choose the practice area directly"
              value={form.areaId}
              onChange={(e) => patch({ areaId: e.target.value, situationId: e.target.value ? "" : form.situationId })}
              placeholder="Use this advocate's main area"
              options={advocate.practice_areas.map((x) => [x.id, x.name] as const)}
            />
            <TextInput label="Other party (optional)" value={form.counterparty} onChange={(e) => patch({ counterparty: e.target.value })} hint="Used for the advocate's conflict-of-interest check." />
            {routedArea && <Callout tone="success">{routedArea.name}</Callout>}
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {URGENCY_OPTIONS.map(([v, t, s]) => (
              <RadioCard key={v} selected={form.urgency === v} onClick={() => patch({ urgency: v })} title={t} subtitle={s} />
            ))}
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Select label="State" value={form.state} onChange={(e) => patch({ state: e.target.value })} placeholder="Select a state (optional)" options={STATES} />
            <TextInput label="City" value={form.city} onChange={(e) => patch({ city: e.target.value })} placeholder="e.g. Pune" />
          </div>
        )}

        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {modeOptions.map(([v, t]) => (
              <RadioCard key={v} selected={form.mode === v} onClick={() => patch({ mode: v })} title={t} />
            ))}
          </div>
        )}

        {step === 5 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {LANGUAGES.map(([v, t]) => (
              <RadioCard key={v} selected={form.language === v} onClick={() => patch({ language: v })} title={t} />
            ))}
          </div>
        )}

        {step === 6 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!slots && !slotsError && <Loading label="Loading availability…" />}
            {slotsError && <ErrorNote message={slotsError} />}
            {slots?.length === 0 && <Callout tone="warning">No open slots in the next week.</Callout>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(slots || []).map((d) => (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => {
                    setDate(d.date);
                    setSlot(null);
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: `1.5px solid ${date === d.date ? "var(--color-navy)" : "var(--color-border)"}`,
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 12.5,
                  }}
                >
                  {new Date(`${d.date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                </button>
              ))}
            </div>
            {date && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(slots?.find((d) => d.date === date)?.slots || []).map((s) => (
                  <button
                    key={s.startsAt}
                    type="button"
                    disabled={s.full}
                    onClick={() => setSlot({ ...s, date })}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: `1.5px solid ${slot?.startsAt === s.startsAt ? "var(--color-navy)" : "var(--color-border)"}`,
                      background: s.full ? "#F1EFE6" : "#fff",
                      color: s.full ? "var(--color-text-muted)" : "var(--color-ink)",
                      cursor: s.full ? "not-allowed" : "pointer",
                      fontSize: 12.5,
                    }}
                  >
                    {s.time}
                    {s.full ? " (booked)" : ""}
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Times are in IST.</div>
          </div>
        )}

        {step === 7 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Issue: {routedArea?.name || "General advisory"}</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>When: {slot ? `${fmtDate(slot.startsAt)} at ${slot.time} IST` : "—"}</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              Mode: {modeName(form.mode)} · Language: {languageName(form.language)}
            </div>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginTop: 8 }}>
              <tbody>
                <tr>
                  <td style={{ padding: "6px 0" }}>Advocate fee</td>
                  <td style={{ textAlign: "right" }}>{inr(fees.fee)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "6px 0" }}>Platform fee</td>
                  <td style={{ textAlign: "right" }}>{inr(fees.platformFee)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "6px 0" }}>GST (18%)</td>
                  <td style={{ textAlign: "right" }}>{inr(fees.gst)}</td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--color-border)", fontWeight: 700 }}>
                  <td style={{ padding: "8px 0" }}>Total</td>
                  <td style={{ textAlign: "right" }}>{inr(fees.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {step === 8 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Callout tone={paymentsEnabled ? "neutral" : "warning"}>
              <strong>{paymentsEnabled ? "Payment" : "Online payment is off"}</strong>
              <div>
                {paymentsEnabled
                  ? `You'll pay ${inr(fees.total)} securely after confirming.`
                  : `This deployment doesn't collect payments online yet. Your slot is reserved; the fee of ${inr(fees.total)} is settled directly with the advocate.`}
              </div>
            </Callout>
            <label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
              I consent to sharing my described issue with this advocate after their conflict check clears.
            </label>
          </div>
        )}

        {step === 9 && result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>✓</div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>Your consultation is booked</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Reference {result.consultation.id.slice(0, 8).toUpperCase()}</div>
            <Callout tone="neutral" style={{ width: "100%" }}>
              {modeName(form.mode)} consultation{slot ? ` on ${fmtDate(slot.startsAt)} at ${slot.time} IST` : ""}. The room opens 15 minutes before the start from your Consultations page.
              {!result.paid && paymentsEnabled && " Payment is still pending — complete it from Consultations to keep the slot."}
            </Callout>
          </div>
        )}
      </Card>

      {error && <ErrorNote message={error} />}

      {step < 9 ? (
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <Button variant="outline" onClick={step === 1 ? () => router.back() : back} style={{ width: "auto" }}>
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          <Button onClick={step === 8 ? confirm : next} disabled={!stepComplete || isPending} style={{ width: "auto", opacity: stepComplete ? 1 : 0.5 }}>
            {isPending ? "Working…" : step === 8 ? (paymentsEnabled ? "Confirm & pay" : "Confirm booking") : "Continue"}
          </Button>
        </div>
      ) : (
        <Button onClick={() => router.push("/consultations")}>View my consultations</Button>
      )}
    </div>
  );
}
