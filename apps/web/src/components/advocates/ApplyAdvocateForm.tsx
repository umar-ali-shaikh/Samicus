"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApplyAdvocateInput } from "@vidhira/contracts";
import { Card, Callout, Button } from "@/components/ui";
import { TextInput, TextArea } from "@/components/forms";
import { CheckGroup } from "./CheckGroup";
import { JurisdictionsEditor, type JurisdictionEntry } from "./JurisdictionsEditor";
import { LANGUAGES, MODES } from "@/lib/format";
import { applyAdvocateAction } from "@/server/advocatesActions";

const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const num = (v: string) => (v === "" ? undefined : Number(v));

export interface PracticeAreaOption {
  id: string;
  name: string;
}

// Ported from frontend/src/screens/profile/AdvocateForms.jsx's ApplyAdvocate. practiceAreas is
// fetched server-side (GET /specialisations, still served by the not-yet-converted askLearn.js
// domain router) and passed in as a prop instead of fetched client-side here.
export function ApplyAdvocateForm({ practiceAreas, onDone }: { practiceAreas: PracticeAreaOption[]; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [f, setF] = useState({
    barCouncil: "",
    enrolmentNumber: "",
    enrolmentYear: "",
    practiceAreaIds: [] as string[],
    subSpecialisations: "",
    yearsOfPractice: "",
    city: "",
    chamberAddress: "",
    languages: ["en"] as string[],
    consultationModes: ["video"] as string[],
    jurisdictions: [{ state: "", forum: "" }] as JurisdictionEntry[],
    scheduledFee: "",
    instantFee: "",
    acceptsUrgent: false,
    education: "",
    experience: "",
    keywords: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const valid =
    f.barCouncil.trim().length >= 2 &&
    f.enrolmentNumber.trim().length >= 3 &&
    f.practiceAreaIds.length > 0 &&
    f.city.trim().length >= 2 &&
    f.languages.length > 0 &&
    f.consultationModes.length > 0;

  function submit() {
    const input: ApplyAdvocateInput = {
      barCouncil: f.barCouncil,
      enrolmentNumber: f.enrolmentNumber,
      enrolmentYear: num(f.enrolmentYear),
      practiceAreaIds: f.practiceAreaIds,
      subSpecialisations: list(f.subSpecialisations),
      yearsOfPractice: num(f.yearsOfPractice),
      education: list(f.education),
      relevantExperience: list(f.experience),
      city: f.city,
      chamberAddress: f.chamberAddress || undefined,
      languages: f.languages,
      consultationModes: f.consultationModes as ApplyAdvocateInput["consultationModes"],
      jurisdictions: f.jurisdictions.filter((j) => j.state && j.forum.trim()).map((j) => ({ state: j.state, forum: j.forum.trim() })),
      instantFee: num(f.instantFee),
      scheduledFee: num(f.scheduledFee),
      acceptsUrgent: f.acceptsUrgent,
      keywords: list(f.keywords),
    };
    setError(undefined);
    startTransition(async () => {
      const result = await applyAdvocateAction(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>Apply to list as an advocate</div>
      <Callout tone="neutral">
        Your profile stays hidden until our trust team verifies your Bar Council enrolment. Applying switches your account to advocate mode; you can still
        use Vidhira as a client.
      </Callout>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <TextInput label="Bar Council" value={f.barCouncil} onChange={set("barCouncil")} placeholder="e.g. Bar Council of Karnataka" />
        <TextInput label="Enrolment number" value={f.enrolmentNumber} onChange={set("enrolmentNumber")} placeholder="e.g. KAR/1234/2015" />
        <TextInput label="Enrolment year" type="number" value={f.enrolmentYear} onChange={set("enrolmentYear")} />
        <TextInput label="Years of practice" type="number" min="0" value={f.yearsOfPractice} onChange={set("yearsOfPractice")} />
        <TextInput label="City" value={f.city} onChange={set("city")} />
        <TextInput label="Chamber address (optional)" value={f.chamberAddress} onChange={set("chamberAddress")} />
      </div>
      <CheckGroup
        label="Practice areas"
        options={practiceAreas.map((a) => [a.id, a.name] as const)}
        value={f.practiceAreaIds}
        onChange={(v) => setF((x) => ({ ...x, practiceAreaIds: v }))}
      />
      <TextInput label="Sub-specialisations (comma-separated)" value={f.subSpecialisations} onChange={set("subSpecialisations")} placeholder="e.g. Bail, Arrest defence" />
      <CheckGroup label="Languages" options={LANGUAGES} value={f.languages} onChange={(v) => setF((x) => ({ ...x, languages: v }))} />
      <CheckGroup label="Consultation modes" options={MODES} value={f.consultationModes} onChange={(v) => setF((x) => ({ ...x, consultationModes: v }))} />
      <JurisdictionsEditor value={f.jurisdictions} onChange={(v) => setF((x) => ({ ...x, jurisdictions: v }))} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <TextInput label="Scheduled consultation fee (₹)" type="number" min="0" value={f.scheduledFee} onChange={set("scheduledFee")} />
        <TextInput label="Instant consultation fee (₹)" type="number" min="0" value={f.instantFee} onChange={set("instantFee")} />
      </div>
      <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={f.acceptsUrgent} onChange={(e) => setF((x) => ({ ...x, acceptsUrgent: e.target.checked }))} /> I&apos;m willing to
        take urgent requests
      </label>
      <TextArea label="Education (one per line)" rows={2} value={f.education} onChange={set("education")} />
      <TextArea
        label="Relevant matter experience (one per line)"
        rows={3}
        value={f.experience}
        onChange={set("experience")}
        hint="Self-declared. Do not include client names or confidential details."
      />
      <TextInput label="Keywords (comma-separated)" value={f.keywords} onChange={set("keywords")} />
      {error && <Callout tone="danger">{error}</Callout>}
      <Button onClick={submit} disabled={!valid || isPending} style={{ alignSelf: "flex-start" }}>
        {isPending ? "Submitting…" : "Submit for verification"}
      </Button>
    </Card>
  );
}
