import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { useConfig, useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { payFor } from "../lib/payments";
import { computeFees, inr, initials, languageName, LANGUAGES, MODES, STATES, URGENCY, fmtDate, modeName } from "../lib/format";
import { ModalShell } from "../components/Modal";
import { Button, Callout, RadioCard, AvatarTile, VerifiedBadge, Loading, ErrorNote } from "../components/ui";
import { Select, TextInput, TextArea } from "../components/forms";

const TITLES = { 1: "Describe the issue", 2: "How soon do you need help?", 3: "Location and jurisdiction", 4: "Consultation mode", 5: "Preferred language", 6: "Advocates matched to your issue", 7: "Choose a date and slot", 8: "Transparent pricing", 9: "Confirm", 10: "Booking confirmed" };

export function BookingModal({ advocateId: presetAdvocateId, description: presetDescription = "", situationId: presetSituation = "" }) {
  const { user, activeAccount } = useAuth();
  const { closeModal, go, showToast, lang } = useUI();
  const config = useConfig();
  const paymentsOn = config.data?.payments?.enabled;

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    description: presetDescription, counterparty: "", situationId: presetSituation, areaId: "", urgency: "week", state: "", city: "", mode: "video", language: "en",
  });
  const [advocateId, setAdvocateId] = useState(presetAdvocateId || "");
  const [intakeId, setIntakeId] = useState(null);
  const [intakeKey, setIntakeKey] = useState("");
  const [slot, setSlot] = useState(null); // { date, startsAt, time }
  const [date, setDate] = useState("");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState(null);
  const patch = (p) => setForm((f) => ({ ...f, ...p }));

  const situations = useGet("/situations", undefined, { staleTime: 3600000 });
  const areas = useGet("/specialisations", undefined, { staleTime: 600000 });
  const presetAdvocate = useGet(`/advocates/${presetAdvocateId}`, undefined, { enabled: Boolean(presetAdvocateId) });
  const matches = useGet(`/intake-requests/${intakeId}/matches`, undefined, { enabled: Boolean(intakeId) && !presetAdvocateId && step === 6, staleTime: 60000 });
  const advocate = useGet(`/advocates/${advocateId}`, undefined, { enabled: Boolean(advocateId) && step >= 7 });
  const slots = useGet(`/advocates/${advocateId}/slots`, undefined, { enabled: Boolean(advocateId) && step === 7, refetchOnMount: "always" });

  const situation = (situations.data || []).find((s) => s.id === form.situationId);
  const routedAreaId = form.areaId || situation?.mapped_practice_area_id || presetAdvocate.data?.practice_areas?.[0]?.id || "";
  const routedArea = (areas.data || []).find((a) => a.id === routedAreaId) || situation?.mapped_practice_area;

  const stepComplete = {
    1: Boolean(routedAreaId && (form.description.trim().length >= 10 || form.situationId)),
    2: true, 3: true, 4: Boolean(form.mode), 5: Boolean(form.language),
    6: Boolean(advocateId), 7: Boolean(slot), 8: true, 9: consent, 10: true,
  }[step];

  const modeOptions = useMemo(() => {
    const offered = presetAdvocate.data?.consultation_modes;
    return MODES.filter(([v]) => !offered || offered.includes(v));
  }, [presetAdvocate.data]);

  const createIntake = useMut(async () => {
    const body = {
      accountId: activeAccount?.id, description: form.description.trim() || undefined, counterpartyName: form.counterparty.trim() || undefined,
      situationId: form.situationId || undefined, routedPracticeAreaId: form.areaId || (situation ? undefined : routedAreaId) || undefined,
      urgency: form.urgency, state: form.state || undefined, city: form.city.trim() || undefined, mode: form.mode, language: form.language, kind: "scheduled",
    };
    return api.post("/intake-requests", body);
  }, { silent: false });

  async function next() {
    if (!stepComplete) return showToast("Please complete this step to continue.");
    if (step === 5) {
      const key = JSON.stringify([form, routedAreaId]);
      if (!intakeId || key !== intakeKey) {
        try {
          const intake = await createIntake.mutateAsync();
          setIntakeId(intake.id);
          setIntakeKey(key);
        } catch { return; }
      }
      return setStep(presetAdvocateId ? 7 : 6);
    }
    setStep((s) => Math.min(10, s + 1));
  }
  const back = () => setStep((s) => (s === 7 && presetAdvocateId ? 5 : Math.max(1, s - 1)));

  const confirm = useMut(async () => {
    await api.post(`/intake-requests/${intakeId}/consent`);
    const consultation = await api.post("/consultations", { intakeId, advocateId, mode: form.mode, scheduledStart: slot.startsAt });
    let paid = false;
    if (paymentsOn) {
      try { paid = await payFor("consultation", consultation.id, { user, description: "Consultation" }); }
      catch (err) { showToast(`${err.message} Your slot is held — you can pay from Consultations.`); }
    }
    return { consultation, paid };
  }, { invalidate: ["/consultations", "/advocates"], onSuccess: (r) => { setResult(r); setStep(10); } });

  const a = advocate.data || presetAdvocate.data;
  const fees = computeFees(a?.scheduled_fee ?? a?.instant_fee ?? 0);

  return (
    <ModalShell
      kicker={`Step ${step} of 10`}
      title={TITLES[step]}
      onClose={closeModal}
      width={640}
      footer={
        step < 10 ? (
          <>
            <Button variant="outline" onClick={step === 1 ? closeModal : back}>{step === 1 ? "Cancel" : "Back"}</Button>
            <Button onClick={step === 9 ? () => confirm.mutate() : next} disabled={!stepComplete || createIntake.isPending || confirm.isPending} style={{ opacity: stepComplete ? 1 : 0.5 }}>
              {confirm.isPending || createIntake.isPending ? "Working…" : step === 9 ? (paymentsOn ? "Confirm & pay" : "Confirm booking") : step === 8 ? "Continue" : "Continue"}
            </Button>
          </>
        ) : (
          <Button onClick={() => { closeModal(); go("consultations"); }} style={{ width: "100%" }}>View my consultations</Button>
        )
      }
    >
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {Array.from({ length: 10 }).map((_, i) => <div key={i} style={{ flex: 1, height: 5, borderRadius: 999, background: i < step ? "#159C6E" : "var(--color-border)" }} />)}
      </div>

      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TextArea label="What's happening?" rows={4} value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Describe the issue in your own words…" hint="Only the category and city are shared until the advocate's conflict check clears and you consent." />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(situations.data || []).map((s) => (
              <button key={s.id} onClick={() => patch({ situationId: s.id, areaId: "" })} style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${form.situationId === s.id ? "var(--color-navy)" : "var(--color-border)"}`, background: form.situationId === s.id ? "var(--color-navy)" : "#fff", color: form.situationId === s.id ? "#fff" : "var(--color-ink)", fontSize: 12.5, cursor: "pointer" }}>
                {lang === "hi" ? s.label_hi : s.label_en}
              </button>
            ))}
          </div>
          <Select label="Or choose the practice area directly" value={form.areaId} onChange={(e) => patch({ areaId: e.target.value, situationId: e.target.value ? "" : form.situationId })} placeholder={presetAdvocate.data ? "Use this advocate's main area" : "Select…"} options={(presetAdvocate.data?.practice_areas || areas.data || []).map((x) => [x.id, x.name])} />
          <TextInput label="Other party (optional)" value={form.counterparty} onChange={(e) => patch({ counterparty: e.target.value })} hint="Used for the advocate's conflict-of-interest check." />
          {routedArea && <Callout tone="success" title="Likely practice area">{routedArea.name}</Callout>}
        </div>
      )}

      {step === 2 && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{URGENCY.map(([v, t, s]) => <RadioCard key={v} selected={form.urgency === v} onClick={() => patch({ urgency: v })} title={t} subtitle={s} />)}</div>}

      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Select label="State" value={form.state} onChange={(e) => patch({ state: e.target.value })} placeholder="Select a state (optional)" options={STATES} />
          <TextInput label="City" value={form.city} onChange={(e) => patch({ city: e.target.value })} placeholder="e.g. Pune" />
        </div>
      )}

      {step === 4 && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{modeOptions.map(([v, t]) => <RadioCard key={v} selected={form.mode === v} onClick={() => patch({ mode: v })} title={t} />)}</div>}

      {step === 5 && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{LANGUAGES.map(([v, t]) => <RadioCard key={v} selected={form.language === v} onClick={() => patch({ language: v })} title={t} />)}</div>}

      {step === 6 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Ordered by relevance to your issue — not by payment, rating or advertising spend.</div>
          {matches.isPending && <Loading label="Finding advocates…" />}
          {matches.isError && <ErrorNote error={matches.error} />}
          {matches.data?.matches?.length === 0 && (
            <Callout tone="warning" title="No exact match">
              No verified advocate currently matches all of those preferences. Try a different language, mode or state — or browse every advocate.
              <div style={{ marginTop: 8 }}><Button variant="outline" onClick={() => { closeModal(); go("find"); }}>Browse all advocates</Button></div>
            </Callout>
          )}
          {(matches.data?.matches || []).map((m) => (
            <button key={m.id} onClick={() => setAdvocateId(m.advocate_id)} style={{ textAlign: "left", border: `1.5px solid ${advocateId === m.advocate_id ? "var(--color-navy)" : "var(--color-border)"}`, borderRadius: 12, padding: 14, background: "#fff", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}><AvatarTile initials={initials(m.advocate?.user?.full_name)} size={34} /><div style={{ fontWeight: 700 }}>Adv. {m.advocate?.user?.full_name?.replace(/^Adv\.?\s*/i, "")}</div></div>
                <div>{inr(m.advocate?.scheduled_fee ?? m.quoted_fee)}</div>
              </div>
              <Callout tone="neutral" style={{ marginTop: 8 }}>{m.why_matched}</Callout>
            </button>
          ))}
        </div>
      )}

      {step === 7 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {a && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <AvatarTile initials={initials(a.user?.full_name)} />
              <div><div style={{ fontWeight: 700 }}>Adv. {a.user?.full_name?.replace(/^Adv\.?\s*/i, "")}</div><VerifiedBadge /></div>
            </div>
          )}
          {slots.isPending && <Loading label="Loading availability…" />}
          {slots.isError && <ErrorNote error={slots.error} />}
          {slots.data?.length === 0 && <Callout tone="warning">No open slots in the next week. Try another advocate.</Callout>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(slots.data || []).map((d) => (
              <button key={d.date} onClick={() => { setDate(d.date); setSlot(null); }} style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${date === d.date ? "var(--color-navy)" : "var(--color-border)"}`, background: "#fff", cursor: "pointer", fontSize: 12.5 }}>
                {new Date(`${d.date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </button>
            ))}
          </div>
          {date && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(slots.data?.find((d) => d.date === date)?.slots || []).map((s) => (
                <button key={s.startsAt} disabled={s.full} onClick={() => setSlot({ ...s, date })} style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${slot?.startsAt === s.startsAt ? "var(--color-navy)" : "var(--color-border)"}`, background: s.full ? "#F1EFE6" : "#fff", color: s.full ? "var(--color-text-muted)" : "var(--color-ink)", cursor: s.full ? "not-allowed" : "pointer", fontSize: 12.5 }}>
                  {s.time}{s.full ? " (booked)" : ""}
                </button>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Times are in IST.</div>
        </div>
      )}

      {step === 8 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Issue: {routedArea?.name || "General advisory"}</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Advocate: {a ? `Adv. ${a.user?.full_name?.replace(/^Adv\.?\s*/i, "")}` : "—"}</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>When: {slot ? `${fmtDate(slot.startsAt)} at ${slot.time} IST` : "—"}</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Mode: {modeName(form.mode)} · Language: {languageName(form.language)}</div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginTop: 8 }}>
            <tbody>
              <tr><td style={{ padding: "6px 0" }}>Advocate fee</td><td style={{ textAlign: "right" }}>{inr(fees.fee)}</td></tr>
              <tr><td style={{ padding: "6px 0" }}>Platform fee</td><td style={{ textAlign: "right" }}>{inr(fees.platformFee)}</td></tr>
              <tr><td style={{ padding: "6px 0" }}>GST (18%)</td><td style={{ textAlign: "right" }}>{inr(fees.gst)}</td></tr>
              <tr><td style={{ padding: "6px 0" }}>Government / court fee</td><td style={{ textAlign: "right" }}>₹0 for a consultation</td></tr>
              <tr style={{ borderTop: "1px solid var(--color-border)", fontWeight: 700 }}><td style={{ padding: "8px 0" }}>Total</td><td style={{ textAlign: "right" }}>{inr(fees.total)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {step === 9 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Callout tone={paymentsOn ? "neutral" : "warning"} title={paymentsOn ? "Payment" : "Online payment is off"}>
            {paymentsOn ? `You'll pay ${inr(fees.total)} securely after confirming.` : `This deployment doesn't collect payments online. Your slot is reserved; the fee of ${inr(fees.total)} is settled directly with the advocate.`}
          </Callout>
          <label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            I consent to sharing my described issue with this advocate after their conflict check clears.
          </label>
          {confirm.isError && <ErrorNote error={confirm.error} />}
        </div>
      )}

      {step === 10 && result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>Your consultation is booked</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Reference {result.consultation.id.slice(0, 8).toUpperCase()}</div>
          <Callout tone="neutral" style={{ width: "100%" }}>
            {modeName(form.mode)} consultation on {fmtDate(slot.startsAt)} at {slot.time} IST. The room opens 15 minutes before the start from your Consultations page.
            {!result.paid && paymentsOn && " Payment is still pending — complete it from Consultations to keep the slot."}
          </Callout>
        </div>
      )}
    </ModalShell>
  );
}
