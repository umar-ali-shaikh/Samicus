"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ServiceListItemDto } from "@vidhira/contracts";
import { Card, Badge, Button, Callout, EmptyState } from "@/components/ui";
import { TextInput, TextArea } from "@/components/forms";
import { inr } from "@/lib/format";
import { createServiceAction, deleteServiceAction, updateServiceAction } from "@/server/servicesAdminActions";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const EMPTY = { category: "", name: "", description: "", professionalFee: "", governmentFee: "0", timelineDays: "", includes: "", requiredDocuments: "", deliverables: "" };

export function ServicesTab({ services }: { services: ServiceListItemDto[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<"new" | ServiceListItemDto | null>(null);
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function open(s: "new" | ServiceListItemDto) {
    setEditing(s);
    setError(undefined);
    setF(
      s === "new"
        ? EMPTY
        : {
            category: s.category,
            name: s.name,
            description: s.description || "",
            professionalFee: String(s.professional_fee),
            governmentFee: String(s.government_fee),
            timelineDays: s.timeline_days ? String(s.timeline_days) : "",
            includes: s.includes.join("\n"),
            requiredDocuments: s.required_documents.join("\n"),
            deliverables: s.deliverables.join("\n"),
          },
    );
  }

  function save() {
    const input = {
      category: f.category,
      name: f.name,
      description: f.description || undefined,
      professionalFee: Number(f.professionalFee),
      governmentFee: Number(f.governmentFee || 0),
      timelineDays: f.timelineDays ? Number(f.timelineDays) : undefined,
      includes: lines(f.includes),
      requiredDocuments: lines(f.requiredDocuments),
      deliverables: lines(f.deliverables),
    };
    setError(undefined);
    startTransition(async () => {
      const result = editing === "new" ? await createServiceAction(input) : await updateServiceAction((editing as ServiceListItemDto).id, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  function remove(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    startTransition(async () => {
      const result = await deleteServiceAction(id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Fixed-fee service catalogue</div>
        <Button onClick={() => open("new")} style={{ width: "auto" }}>
          + New service
        </Button>
      </div>
      {error && <Callout tone="danger">{error}</Callout>}
      {editing && (
        <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <TextInput label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
            <TextInput label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <TextInput label="Professional fee (₹)" type="number" min="0" value={f.professionalFee} onChange={(e) => setF({ ...f, professionalFee: e.target.value })} />
            <TextInput label="Government charges (₹)" type="number" min="0" value={f.governmentFee} onChange={(e) => setF({ ...f, governmentFee: e.target.value })} />
            <TextInput label="Timeline (days)" type="number" min="1" value={f.timelineDays} onChange={(e) => setF({ ...f, timelineDays: e.target.value })} />
          </div>
          <TextArea label="Description" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <TextArea label="Includes (one per line)" rows={3} value={f.includes} onChange={(e) => setF({ ...f, includes: e.target.value })} />
            <TextArea label="Documents required" rows={3} value={f.requiredDocuments} onChange={(e) => setF({ ...f, requiredDocuments: e.target.value })} />
            <TextArea label="Deliverables" rows={3} value={f.deliverables} onChange={(e) => setF({ ...f, deliverables: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={save} disabled={isPending || !f.category || f.name.length < 3 || f.professionalFee === ""} style={{ width: "auto" }}>
              Save
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)} style={{ width: "auto" }}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
      {services.length === 0 ? (
        <EmptyState title="No services yet" body="Create the first fixed-fee service." />
      ) : (
        services.map((s) => (
          <Card key={s.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>
                {s.name} <Badge>{s.category}</Badge>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {inr(s.professional_fee)} + {inr(s.gov)} govt{s.timeline_days ? ` · ${s.timeline_days} days` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="outline" onClick={() => open(s)} style={{ width: "auto" }}>
                Edit
              </Button>
              <Button variant="ghost" onClick={() => remove(s.id, s.name)} style={{ width: "auto" }}>
                Delete
              </Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
