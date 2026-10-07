"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AccessGrantDto, MatterDto } from "@vidhira/contracts";
import { Card, Button, Callout } from "@/components/ui";
import { TextInput } from "@/components/forms";
import { grantAccessAction, revokeAccessAction } from "@/server/mattersActions";

const SCOPES = ["documents", "messages", "tasks", "fees"] as const;

// Ported from frontend/src/screens/matter/MatterTabs.jsx's Access.
export function Access({ matterId, matter, access }: { matterId: string; matter: MatterDto; access: AccessGrantDto[] }) {
  const router = useRouter();
  const [form, setForm] = useState<{ email: string; role: string; scope: string[] }>({ email: "", role: "Viewer", scope: ["documents"] });
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const advocateName = matter.advocate?.user?.full_name;

  function toggleScope(s: string) {
    setForm((f) => ({ ...f, scope: f.scope.includes(s) ? f.scope.filter((x) => x !== s) : [...f.scope, s] }));
  }

  function grant() {
    setError(undefined);
    startTransition(async () => {
      const result = await grantAccessAction(matterId, { email: form.email, role: form.role, scope: form.scope as Array<(typeof SCOPES)[number]> });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setForm({ email: "", role: "Viewer", scope: ["documents"] });
      router.refresh();
    });
  }

  function revoke(grantId: string) {
    setError(undefined);
    startTransition(async () => {
      await revokeAccessAction(matterId, grantId);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Card style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Adv. {advocateName?.replace(/^Adv\.?\s*/i, "")}</div>
          <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Engaged advocate · sees only documents you share</div>
        </div>
      </Card>
      {access.map((g) => (
        <Card key={g.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{g.subject_name}</div>
            <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
              {g.subject_role} · {g.scope.join(", ")}
            </div>
          </div>
          <Button variant="outline" onClick={() => revoke(g.id)} disabled={isPending} style={{ width: "auto" }}>
            Revoke
          </Button>
        </Card>
      ))}
      <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Share this matter with someone</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <TextInput label="Their email (must have a Vidhira account)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <TextInput label="Their role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Finance head" />
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          {SCOPES.map((s) => (
            <label key={s} style={{ display: "flex", gap: 6 }}>
              <input type="checkbox" checked={form.scope.includes(s)} onChange={() => toggleScope(s)} /> {s}
            </label>
          ))}
        </div>
        {error && <Callout tone="danger">{error}</Callout>}
        <Button onClick={grant} disabled={!form.email || form.scope.length === 0 || isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
          Grant access
        </Button>
      </Card>
    </div>
  );
}
