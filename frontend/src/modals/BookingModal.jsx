import { useAppState, computeFees } from "../state/AppState";
import { SITUATIONS, LAWYERS } from "../data/mockData";
import { ModalShell } from "../components/Modal";
import { Button, Callout, RadioCard, AvatarTile, VerifiedBadge } from "../components/ui";

const URGENCY_OPTIONS = [
  { value: "today", title: "I need help today", subtitle: "Response targeted under 2 hours" },
  { value: "48h", title: "Within 48 hours", subtitle: "Standard fast-track" },
  { value: "week", title: "This week", subtitle: "Standard scheduling" },
  { value: "deadline", title: "I have a deadline", subtitle: "Tell your advocate the date on the call" },
];
const PLACE_OPTIONS = [
  { value: "Bengaluru", title: "Bengaluru", subtitle: "City Civil Court · 42 advocates" },
  { value: "Mumbai", title: "Mumbai", subtitle: "Sessions & Family Court · 31 advocates" },
  { value: "Delhi NCR", title: "Delhi NCR", subtitle: "High Court & Tribunals · 28 advocates" },
  { value: "elsewhere", title: "Elsewhere in India", subtitle: "We'll match by state on the call" },
];
const MODE_OPTIONS = [
  { value: "video", title: "Video call", subtitle: "Face-to-face, most common", fee: 2500 },
  { value: "phone", title: "Phone call", subtitle: "No video required", fee: 2200 },
  { value: "chat", title: "Secure chat", subtitle: "Text-based, async replies", fee: 1500 },
  { value: "in_person", title: "In person", subtitle: "At the advocate's chamber", fee: 3500 },
];
const LANGUAGE_OPTIONS = [
  { value: "English", title: "English", subtitle: "Most advocates available" },
  { value: "Hindi", title: "Hindi", subtitle: "Wide availability" },
  { value: "Kannada", title: "Kannada", subtitle: "Bengaluru-based advocates" },
  { value: "Marathi", title: "Marathi", subtitle: "Mumbai-based advocates" },
];

function nextWeekdays(n) {
  const days = [];
  const cursor = new Date();
  while (days.length < n) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) days.push(new Date(cursor));
  }
  return days;
}
const TIMES = ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"];

export function BookingModal() {
  const { state, act } = useAppState();
  const { bookStep: step, booking, consent, payMethod } = state;

  const matchPool = (() => {
    const inArea = LAWYERS.filter((l) => l.area === state.routedCategory);
    const rest = LAWYERS.filter((l) => l.area !== state.routedCategory);
    return [...inArea, ...rest].slice(0, 3);
  })();

  const selectedLawyer = LAWYERS.find((l) => l.id === booking.lawyerId);

  const stepComplete = {
    1: !!(state.intake || booking.situationId),
    2: !!booking.urgency, 3: !!booking.place, 4: !!booking.mode, 5: !!booking.language,
    6: !!booking.lawyerId, 7: !!(booking.date && booking.slot), 8: true,
    9: consent === true, 10: true,
  }[step];

  function goNext() {
    if (!stepComplete) { act.showToast("Please complete this step to continue."); return; }
    act.setBookStep(Math.min(10, step + 1));
  }
  function goBack() { act.setBookStep(Math.max(1, step - 1)); }

  const modeFee = selectedLawyer?.fee || MODE_OPTIONS.find((m) => m.value === booking.mode)?.fee || 0;
  const fees = computeFees(modeFee);

  return (
    <ModalShell
      kicker={`Step ${step} of 10`}
      title={{ 1: "Describe the issue", 2: "How soon do you need help?", 3: "Location and jurisdiction", 4: "Consultation mode", 5: "Preferred language", 6: "Advocates matched to your issue", 7: "Choose a date and slot", 8: "Transparent pricing", 9: "Confirm and pay", 10: "Booking confirmed" }[step]}
      onClose={act.closeModal}
      width={640}
      footer={
        step < 10 ? (
          <>
            <Button variant="outline" onClick={step === 1 ? act.closeModal : goBack}>{step === 1 ? "Cancel" : "Back"}</Button>
            <Button onClick={step === 9 ? act.confirmBooking : goNext} style={{ opacity: stepComplete ? 1 : 0.5, cursor: stepComplete ? "pointer" : "not-allowed" }}>
              {step === 9 ? "Pay & confirm" : step === 8 ? "Continue to payment" : "Continue"}
            </Button>
          </>
        ) : (
          <Button onClick={() => { act.closeModal(); act.go("matters"); }} style={{ width: "100%" }}>Go to my matters</Button>
        )
      }
    >
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 5, borderRadius: 999, background: i < step ? "#159C6E" : "var(--color-border)" }} />
        ))}
      </div>

      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <textarea
            value={state.intake}
            onChange={(e) => act.setIntake(e.target.value)}
            placeholder="Describe what's happening in your own words…"
            rows={4}
            style={{ padding: 12, borderRadius: 10, border: "1px solid var(--color-border)", fontSize: 14, resize: "vertical" }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SITUATIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => { act.setBooking({ situationId: s.id }); act.set({ routedCategory: s.area }); }}
                style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${booking.situationId === s.id ? "var(--color-navy)" : "var(--color-border)"}`, background: booking.situationId === s.id ? "var(--color-navy)" : "#fff", color: booking.situationId === s.id ? "#fff" : "var(--color-ink)", fontSize: 12.5, cursor: "pointer" }}
              >
                {state.lang === "hi" ? s.hi : s.en}
              </button>
            ))}
          </div>
          {state.routedCategory && <Callout tone="success" title="Likely practice area">{state.routedCategory}</Callout>}
        </div>
      )}

      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {URGENCY_OPTIONS.map((o) => <RadioCard key={o.value} selected={booking.urgency === o.value} onClick={() => act.setBooking({ urgency: o.value })} title={o.title} subtitle={o.subtitle} />)}
        </div>
      )}
      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PLACE_OPTIONS.map((o) => <RadioCard key={o.value} selected={booking.place === o.value} onClick={() => act.setBooking({ place: o.value })} title={o.title} subtitle={o.subtitle} />)}
        </div>
      )}
      {step === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {MODE_OPTIONS.map((o) => <RadioCard key={o.value} selected={booking.mode === o.value} onClick={() => act.setBooking({ mode: o.value })} title={o.title} subtitle={o.subtitle} trailing={`₹${o.fee}`} />)}
        </div>
      )}
      {step === 5 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {LANGUAGE_OPTIONS.map((o) => <RadioCard key={o.value} selected={booking.language === o.value} onClick={() => act.setBooking({ language: o.value })} title={o.title} subtitle={o.subtitle} />)}
        </div>
      )}

      {step === 6 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Ordered by relevance to your issue — not by payment, rating or advertising spend.</div>
          {matchPool.map((l) => (
            <button key={l.id} onClick={() => act.setBooking({ lawyerId: l.id })} style={{ textAlign: "left", border: `1.5px solid ${booking.lawyerId === l.id ? "var(--color-navy)" : "var(--color-border)"}`, borderRadius: 12, padding: 14, background: "#fff", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}><AvatarTile initials={l.initials} size={34} /><div style={{ fontWeight: 700 }}>{l.name}</div></div>
                <div>₹{l.fee}</div>
              </div>
              <Callout tone="neutral" style={{ marginTop: 8 }}>{l.whyMatch}</Callout>
            </button>
          ))}
        </div>
      )}

      {step === 7 && selectedLawyer && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <AvatarTile initials={selectedLawyer.initials} />
            <div><div style={{ fontWeight: 700 }}>{selectedLawyer.name}</div><VerifiedBadge /></div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {nextWeekdays(5).map((d) => {
              const iso = d.toISOString().slice(0, 10);
              return <button key={iso} onClick={() => act.setBooking({ date: iso })} style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${booking.date === iso ? "var(--color-navy)" : "var(--color-border)"}`, background: "#fff", cursor: "pointer", fontSize: 12.5 }}>{d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</button>;
            })}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TIMES.map((t, i) => {
              const full = i === 2 || i === 4;
              return <button key={t} disabled={full} onClick={() => act.setBooking({ slot: t })} style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${booking.slot === t ? "var(--color-navy)" : "var(--color-border)"}`, background: full ? "#F1EFE6" : "#fff", color: full ? "var(--color-text-muted)" : "var(--color-ink)", cursor: full ? "not-allowed" : "pointer", fontSize: 12.5 }}>{t} {full && "(full)"}</button>;
            })}
          </div>
        </div>
      )}

      {step === 8 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Issue: {state.routedCategory || "General advisory"}</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Advocate: {selectedLawyer?.name || "—"}</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Date & slot: {booking.date} at {booking.slot}</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Mode: {booking.mode} · Language: {booking.language}</div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginTop: 8 }}>
            <tbody>
              <tr><td style={{ padding: "6px 0" }}>Advocate fee</td><td style={{ textAlign: "right" }}>₹{fees.fee}</td></tr>
              <tr><td style={{ padding: "6px 0" }}>Platform fee</td><td style={{ textAlign: "right" }}>₹{fees.platformFee}</td></tr>
              <tr><td style={{ padding: "6px 0" }}>GST (18%)</td><td style={{ textAlign: "right" }}>₹{fees.gst}</td></tr>
              <tr><td style={{ padding: "6px 0" }}>Government / court fee</td><td style={{ textAlign: "right" }}>₹0 for a consultation</td></tr>
              <tr style={{ borderTop: "1px solid var(--color-border)", fontWeight: 700 }}><td style={{ padding: "8px 0" }}>Total</td><td style={{ textAlign: "right" }}>₹{fees.total}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {step === 9 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["upi", "UPI"], ["card", "Card"], ["net_banking", "Net banking"]].map(([v, label]) => (
              <RadioCard key={v} selected={payMethod === v} onClick={() => act.setPayMethod(v)} title={label} />
            ))}
          </div>
          <label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
            <input type="checkbox" checked={consent} onChange={(e) => act.setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            I consent to sharing my described issue and any documents with the matched advocate after the conflict check clears.
          </label>
        </div>
      )}

      {step === 10 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>Your consultation is confirmed</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Reference LA-CON-2026-8841</div>
          <Callout tone="neutral" style={{ width: "100%" }}>We'll send a reminder before your {booking.mode} consultation on {booking.date} at {booking.slot}.</Callout>
        </div>
      )}
    </ModalShell>
  );
}
