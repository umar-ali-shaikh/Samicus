"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdvocateDto, AdvocateProfilePatchInput } from "@vidhira/contracts";
import { Card, Callout, Button, Select } from "@/components/ui";
import { TextInput, TextArea } from "@/components/forms";
import { CheckGroup } from "./CheckGroup";
import { JurisdictionsEditor, type JurisdictionEntry } from "./JurisdictionsEditor";
import { LANGUAGES, MODES } from "@/lib/format";
import { updateAdvocateProfileAction } from "@/server/advocatesActions";

const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const num = (v: string) => (v === "" ? undefined : Number(v));

const DAYS: Array<[number, string]> = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];

interface WeeklySchedule {
  days: number[];
  start: string;
  end: string;
  slotMinutes: number;
}

// Ported from frontend/src/screens/profile/AdvocateForms.jsx's AdvocateProfileEditor/EditorForm.
export function AdvocateProfileEditorForm({ advocate }: { advocate: AdvocateDto }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [f, setF] = useState({
    scheduledFee: advocate.scheduled_fee != null ? String(advocate.scheduled_fee) : "",
    instantFee: advocate.instant_fee != null ? String(advocate.instant_fee) : "",
    acceptsUrgent: advocate.accepts_urgent,
    city: advocate.city || "",
    chamberAddress: advocate.chamber_address || "",
    yearsOfPractice: advocate.years_of_practice != null ? String(advocate.years_of_practice) : "",
    subSpecialisations: advocate.sub_specialisations.join(", "),
    education: advocate.education.join("\n"),
    experience: advocate.relevant_experience.join("\n"),
    keywords: advocate.keywords.join(", "),
    languages: advocate.languages,
    consultationModes: advocate.consultation_modes,
    jurisdictions: (advocate.jurisdictions.length
      ? advocate.jurisdictions.map((j) => ({ state: j.state ?? "", forum: j.forum ?? "" }))
      : [{ state: "", forum: "" }]) as JurisdictionEntry[],
    schedule: (Object.keys(advocate.weekly_schedule).length
      ? (advocate.weekly_schedule as unknown as WeeklySchedule)
      : { days: [1, 2, 3, 4, 5, 6], start: "09:00", end: "19:00", slotMinutes: 60 }) as WeeklySchedule,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setSch = (p: Partial<WeeklySchedule>) => setF((x) => ({ ...x, schedule: { ...x.schedule, ...p } }));

  function submit() {
    const input: AdvocateProfilePatchInput = {
      scheduledFee: num(f.scheduledFee),
      instantFee: num(f.instantFee),
      acceptsUrgent: f.acceptsUrgent,
      city: f.city,
      chamberAddress: f.chamberAddress || undefined,
      yearsOfPractice: num(f.yearsOfPractice),
      subSpecialisations: list(f.subSpecialisations),
      education: list(f.education),
      relevantExperience: list(f.experience),
      keywords: list(f.keywords),
      languages: f.languages as AdvocateProfilePatchInput["languages"],
      consultationModes: f.consultationModes as AdvocateProfilePatchInput["consultationModes"],
      jurisdictions: f.jurisdictions.filter((j) => j.state && j.forum.trim()).map((j) => ({ state: j.state, forum: j.forum.trim() })),
      weeklySchedule: f.schedule as unknown as Record<string, unknown>,
    };
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const result = await updateAdvocateProfileAction(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice("Profile saved.");
      router.refresh();
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>Your listing</div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
        {advocate.bar_council} · {advocate.enrolment_number} (locked — contact support to change enrolment details)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <TextInput label="Scheduled fee (₹)" type="number" min="0" value={f.scheduledFee} onChange={set("scheduledFee")} />
        <TextInput label="Instant fee (₹)" type="number" min="0" value={f.instantFee} onChange={set("instantFee")} />
        <TextInput label="City" value={f.city} onChange={set("city")} />
        <TextInput label="Years of practice" type="number" min="0" value={f.yearsOfPractice} onChange={set("yearsOfPractice")} />
      </div>
      <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={f.acceptsUrgent} onChange={(e) => setF((x) => ({ ...x, acceptsUrgent: e.target.checked }))} /> Accept urgent requests
      </label>
      <CheckGroup label="Languages" options={LANGUAGES} value={f.languages} onChange={(v) => setF((x) => ({ ...x, languages: v }))} />
      <CheckGroup label="Consultation modes" options={MODES} value={f.consultationModes} onChange={(v) => setF((x) => ({ ...x, consultationModes: v }))} />
      <JurisdictionsEditor value={f.jurisdictions} onChange={(v) => setF((x) => ({ ...x, jurisdictions: v }))} />

      <div style={{ fontWeight: 700, fontSize: 13 }}>Bookable hours (IST)</div>
      <CheckGroup label="Working days" options={DAYS.map(([d, l]) => [String(d), l] as const)} value={f.schedule.days.map(String)} onChange={(v) => setSch({ days: v.map(Number) })} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <TextInput label="From" type="time" value={f.schedule.start} onChange={(e) => setSch({ start: e.target.value })} />
        <TextInput label="To" type="time" value={f.schedule.end} onChange={(e) => setSch({ end: e.target.value })} />
        <Select
          label="Slot length"
          value={f.schedule.slotMinutes}
          onChange={(e) => setSch({ slotMinutes: Number(e.target.value) })}
          options={[["30", "30 minutes"], ["45", "45 minutes"], ["60", "60 minutes"], ["90", "90 minutes"]]}
        />
      </div>

      <TextInput label="Sub-specialisations (comma-separated)" value={f.subSpecialisations} onChange={set("subSpecialisations")} />
      <TextArea label="Education (one per line)" rows={2} value={f.education} onChange={set("education")} />
      <TextArea label="Relevant matter experience (one per line)" rows={3} value={f.experience} onChange={set("experience")} />
      <TextInput label="Keywords (comma-separated)" value={f.keywords} onChange={set("keywords")} />
      {error && <Callout tone="danger">{error}</Callout>}
      {notice && <Callout tone="success">{notice}</Callout>}
      <Button onClick={submit} disabled={isPending} style={{ alignSelf: "flex-start" }}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </Card>
  );
}
