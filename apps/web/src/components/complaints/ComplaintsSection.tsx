"use client";

import { useState, useTransition } from "react";
import type { MyComplaintDto } from "@vidhira/contracts";
import { Card, Badge, Button, Callout, Select } from "@/components/ui";
import { TextInput, TextArea } from "@/components/forms";
import { fmtDate } from "@/lib/format";
import { fileComplaintAction } from "@/server/complaintsActions";

const CATEGORIES = [
  ["advocate_conduct", "Advocate conduct"],
  ["deliverable_delay", "Delay in a deliverable"],
  ["payment", "Payment / billing"],
  ["citation_accuracy", "Incorrect AI answer or citation"],
  ["compliance_coverage", "Compliance coverage gap"],
  ["other", "Something else"],
] as const;

// Ported from frontend/src/screens/Profile.jsx's Complaints section.
export function ComplaintsSection({ initialComplaints }: { initialComplaints: MyComplaintDto[] }) {
  const [complaints, setComplaints] = useState(initialComplaints);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number][0]>("other");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await fileComplaintAction({ title, description, category });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setComplaints([{ id: result.complaint.id, ref: result.complaint.ref, title, category, status: result.complaint.status, created_at: new Date().toISOString(), corrective_action: null }, ...complaints]);
      setOpen(false);
      setTitle("");
      setDescription("");
      setCategory("other");
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 700 }}>Report a problem</div>
      {error && <Callout tone="danger">{error}</Callout>}
      {complaints.map((c) => (
        <Card key={c.id} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
              {c.ref} · {fmtDate(c.created_at)}
            </div>
          </div>
          <Badge tone={c.status === "resolved" ? "success" : "warning"}>{c.status}</Badge>
        </Card>
      ))}
      {open ? (
        <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <Select label="What is it about?" value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number][0])} options={CATEGORIES} />
          <TextInput label="Summary" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextArea label="What happened?" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} hint="At least 20 characters." />
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={submit} disabled={title.trim().length < 5 || description.trim().length < 20 || isPending} style={{ width: "auto" }}>
              Submit
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} style={{ width: "auto" }}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)} style={{ alignSelf: "flex-start", width: "auto" }}>
          File a complaint
        </Button>
      )}
    </div>
  );
}
