import { useState } from "react";
import { useGet, useMut } from "../../api/hooks";
import { api } from "../../lib/api";
import { Card, Callout, Button, Badge, Loading } from "../../components/ui";
import { Select, TextInput, TextArea, Field, inputStyle } from "../../components/forms";
import { LANGUAGES, MODES, STATES } from "../../lib/format";

const list = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const num = (v) => (v === "" || v === undefined ? undefined : Number(v));

function CheckGroup({ label, options, value, onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
        {options.map(([v, l]) => <label key={v} style={{ display: "flex", gap: 6 }}><input type="checkbox" checked={value.includes(v)} onChange={() => toggle(v)} /> {l}</label>)}
      </div>
    </Field>
  );
}

function Jurisdictions({ value, onChange }) {
  return (
    <Field label="Courts & forums you appear before">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {value.map((j, i) => (
          <div key={i} style={{ display: "flex", gap: 8 }}>
            <select value={j.state} onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, state: e.target.value } : x)))} style={inputStyle}>
              <option value="">State…</option>{STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <input value={j.forum} onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, forum: e.target.value } : x)))} placeholder="e.g. City Civil Court" style={inputStyle} />
            <button onClick={() => onChange(value.filter((_, k) => k !== i))} aria-label="Remove" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
        ))}
        <button onClick={() => onChange([...value, { state: "", forum: "" }])} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12.5 }}>+ Add a forum</button>
      </div>
    </Field>
  );
}

export function ApplyAdvocate({ onDone }) {
  const areas = useGet("/specialisations", undefined, { staleTime: 600000 });
  const [f, setF] = useState({
    barCouncil: "", enrolmentNumber: "", enrolmentYear: "", practiceAreaIds: [], subSpecialisations: "", yearsOfPractice: "", city: "", chamberAddress: "",
    languages: ["en"], consultationModes: ["video"], jurisdictions: [{ state: "", forum: "" }], scheduledFee: "", instantFee: "", acceptsUrgent: false, education: "", experience: "", keywords: "",
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const apply = useMut(() => api.post("/advocate/apply", {
    barCouncil: f.barCouncil, enrolmentNumber: f.enrolmentNumber, enrolmentYear: num(f.enrolmentYear), practiceAreaIds: f.practiceAreaIds,
    subSpecialisations: list(f.subSpecialisations), yearsOfPractice: num(f.yearsOfPractice), education: list(f.education), relevantExperience: list(f.experience),
    city: f.city, chamberAddress: f.chamberAddress || undefined, languages: f.languages, consultationModes: f.consultationModes,
    jurisdictions: f.jurisdictions.filter((j) => j.state && j.forum.trim()).map((j) => ({ state: j.state, forum: j.forum.trim() })),
    instantFee: num(f.instantFee), scheduledFee: num(f.scheduledFee), acceptsUrgent: f.acceptsUrgent, keywords: list(f.keywords),
  }), { success: "Application submitted. Our trust team will verify your enrolment.", onSuccess: onDone });
  const valid = f.barCouncil.trim().length >= 2 && f.enrolmentNumber.trim().length >= 3 && f.practiceAreaIds.length > 0 && f.city.trim().length >= 2 && f.languages.length && f.consultationModes.length;

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>Apply to list as an advocate</div>
      <Callout tone="neutral">Your profile stays hidden until our trust team verifies your Bar Council enrolment. Applying switches your account to advocate mode; you can still use Samicus as a client.</Callout>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <TextInput label="Bar Council" value={f.barCouncil} onChange={set("barCouncil")} placeholder="e.g. Bar Council of Karnataka" />
        <TextInput label="Enrolment number" value={f.enrolmentNumber} onChange={set("enrolmentNumber")} placeholder="e.g. KAR/1234/2015" />
        <TextInput label="Enrolment year" type="number" value={f.enrolmentYear} onChange={set("enrolmentYear")} />
        <TextInput label="Years of practice" type="number" min="0" value={f.yearsOfPractice} onChange={set("yearsOfPractice")} />
        <TextInput label="City" value={f.city} onChange={set("city")} />
        <TextInput label="Chamber address (optional)" value={f.chamberAddress} onChange={set("chamberAddress")} />
      </div>
      {areas.isPending ? <Loading /> : <CheckGroup label="Practice areas" options={(areas.data || []).map((a) => [a.id, a.name])} value={f.practiceAreaIds} onChange={(v) => setF({ ...f, practiceAreaIds: v })} />}
      <TextInput label="Sub-specialisations (comma-separated)" value={f.subSpecialisations} onChange={set("subSpecialisations")} placeholder="e.g. Bail, Arrest defence" />
      <CheckGroup label="Languages" options={LANGUAGES} value={f.languages} onChange={(v) => setF({ ...f, languages: v })} />
      <CheckGroup label="Consultation modes" options={MODES} value={f.consultationModes} onChange={(v) => setF({ ...f, consultationModes: v })} />
      <Jurisdictions value={f.jurisdictions} onChange={(v) => setF({ ...f, jurisdictions: v })} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <TextInput label="Scheduled consultation fee (₹)" type="number" min="0" value={f.scheduledFee} onChange={set("scheduledFee")} />
        <TextInput label="Instant consultation fee (₹)" type="number" min="0" value={f.instantFee} onChange={set("instantFee")} />
      </div>
      <label style={{ display: "flex", gap: 8, fontSize: 13 }}><input type="checkbox" checked={f.acceptsUrgent} onChange={(e) => setF({ ...f, acceptsUrgent: e.target.checked })} /> I'm willing to take urgent requests</label>
      <TextArea label="Education (one per line)" rows={2} value={f.education} onChange={set("education")} />
      <TextArea label="Relevant matter experience (one per line)" rows={3} value={f.experience} onChange={set("experience")} hint="Self-declared. Do not include client names or confidential details." />
      <TextInput label="Keywords (comma-separated)" value={f.keywords} onChange={set("keywords")} />
      <Button onClick={() => apply.mutate()} disabled={!valid || apply.isPending} style={{ alignSelf: "flex-start" }}>{apply.isPending ? "Submitting…" : "Submit for verification"}</Button>
    </Card>
  );
}

const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];

export function AdvocateProfileEditor() {
  const profile = useGet("/advocate/profile");
  if (profile.isPending) return <Loading />;
  if (profile.isError) return <Callout tone="danger">{profile.error.message}</Callout>;
  return <EditorForm a={profile.data} />;
}

function EditorForm({ a }) {
  const [f, setF] = useState({
    scheduledFee: a.scheduled_fee ?? "", instantFee: a.instant_fee ?? "", acceptsUrgent: a.accepts_urgent, city: a.city || "", chamberAddress: a.chamber_address || "",
    yearsOfPractice: a.years_of_practice ?? "", subSpecialisations: (a.sub_specialisations || []).join(", "), education: (a.education || []).join("\n"),
    experience: (a.relevant_experience || []).join("\n"), keywords: (a.keywords || []).join(", "),
    languages: a.languages || [], consultationModes: a.consultation_modes || [], jurisdictions: a.jurisdictions?.length ? a.jurisdictions : [{ state: "", forum: "" }],
    schedule: a.weekly_schedule || { days: [1, 2, 3, 4, 5, 6], start: "09:00", end: "19:00", slotMinutes: 60 },
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMut(() => api.patch("/advocate/profile", {
    scheduledFee: num(f.scheduledFee), instantFee: num(f.instantFee), acceptsUrgent: f.acceptsUrgent, city: f.city, chamberAddress: f.chamberAddress || undefined,
    yearsOfPractice: num(f.yearsOfPractice), subSpecialisations: list(f.subSpecialisations), education: list(f.education), relevantExperience: list(f.experience), keywords: list(f.keywords),
    languages: f.languages, consultationModes: f.consultationModes, jurisdictions: f.jurisdictions.filter((j) => j.state && j.forum.trim()).map((j) => ({ state: j.state, forum: j.forum.trim() })),
    weeklySchedule: f.schedule,
  }), { invalidate: ["/advocate/profile", "/me", "/advocates"], success: "Profile saved." });
  const sch = f.schedule;
  const setSch = (p) => setF((x) => ({ ...x, schedule: { ...x.schedule, ...p } }));

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>Your listing</div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{a.bar_council} · {a.enrolment_number} (locked — contact support to change enrolment details)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <TextInput label="Scheduled fee (₹)" type="number" min="0" value={f.scheduledFee} onChange={set("scheduledFee")} />
        <TextInput label="Instant fee (₹)" type="number" min="0" value={f.instantFee} onChange={set("instantFee")} />
        <TextInput label="City" value={f.city} onChange={set("city")} />
        <TextInput label="Years of practice" type="number" min="0" value={f.yearsOfPractice} onChange={set("yearsOfPractice")} />
      </div>
      <label style={{ display: "flex", gap: 8, fontSize: 13 }}><input type="checkbox" checked={f.acceptsUrgent} onChange={(e) => setF({ ...f, acceptsUrgent: e.target.checked })} /> Accept urgent requests</label>
      <CheckGroup label="Languages" options={LANGUAGES} value={f.languages} onChange={(v) => setF({ ...f, languages: v })} />
      <CheckGroup label="Consultation modes" options={MODES} value={f.consultationModes} onChange={(v) => setF({ ...f, consultationModes: v })} />
      <Jurisdictions value={f.jurisdictions} onChange={(v) => setF({ ...f, jurisdictions: v })} />

      <div style={{ fontWeight: 700, fontSize: 13 }}>Bookable hours (IST)</div>
      <CheckGroup label="Working days" options={DAYS.map(([d, l]) => [d, l])} value={sch.days} onChange={(v) => setSch({ days: v })} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <TextInput label="From" type="time" value={sch.start} onChange={(e) => setSch({ start: e.target.value })} />
        <TextInput label="To" type="time" value={sch.end} onChange={(e) => setSch({ end: e.target.value })} />
        <Select label="Slot length" value={sch.slotMinutes} onChange={(e) => setSch({ slotMinutes: Number(e.target.value) })} options={[[30, "30 minutes"], [45, "45 minutes"], [60, "60 minutes"], [90, "90 minutes"]]} />
      </div>

      <TextInput label="Sub-specialisations (comma-separated)" value={f.subSpecialisations} onChange={set("subSpecialisations")} />
      <TextArea label="Education (one per line)" rows={2} value={f.education} onChange={set("education")} />
      <TextArea label="Relevant matter experience (one per line)" rows={3} value={f.experience} onChange={set("experience")} />
      <TextInput label="Keywords (comma-separated)" value={f.keywords} onChange={set("keywords")} />
      <Button onClick={() => save.mutate()} disabled={save.isPending} style={{ alignSelf: "flex-start" }}>{save.isPending ? "Saving…" : "Save changes"}</Button>
    </Card>
  );
}

const STATUS = {
  submitted: ["info", "Submitted — awaiting review"],
  under_review: ["info", "Under review"],
  documents_requested: ["warning", "More information requested"],
  verified: ["success", "Verified and listed"],
  rejected: ["danger", "Not approved"],
};

export function VerificationStatus({ advocate }) {
  const resubmit = useMut(() => api.post("/advocate/resubmit"), { invalidate: ["/me"], success: "Resubmitted for review." });
  const [tone, label] = STATUS[advocate.verification_status] || ["neutral", advocate.verification_status];
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Verification</div><Badge tone={tone}>{label}</Badge>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{advocate.bar_council} · {advocate.enrolment_number}</div>
      {advocate.verification_status === "verified" ? (
        <div style={{ fontSize: 12.5 }}>Your profile is listed. Switch on “Accepting requests” on your dashboard to receive clients.</div>
      ) : advocate.verification_status === "documents_requested" ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><div style={{ fontSize: 12.5 }}>Our team asked for more information. Update your details below, then resubmit.</div><Button onClick={() => resubmit.mutate()} disabled={resubmit.isPending}>Resubmit</Button></div>
      ) : (
        <div style={{ fontSize: 12.5 }}>You can edit your listing now; it becomes visible to clients once verified.</div>
      )}
    </Card>
  );
}
