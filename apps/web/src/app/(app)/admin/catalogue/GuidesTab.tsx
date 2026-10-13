"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GuideListItemDto } from "@vidhira/contracts";
import { Card, Button, Callout, Select } from "@/components/ui";
import { TextInput, TextArea } from "@/components/forms";
import { createGuideAction, deleteGuideAction } from "@/server/learnActions";

const EMPTY = { tag: "", title: "", body: "", readMinutes: "", locale: "en" as "en" | "hi" };

export function GuidesTab({ guides }: { guides: GuideListItemDto[] }) {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function create() {
    setError(undefined);
    startTransition(async () => {
      const result = await createGuideAction({ tag: f.tag || undefined, title: f.title, body: f.body, readMinutes: f.readMinutes ? Number(f.readMinutes) : undefined, locale: f.locale });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setF(EMPTY);
      router.refresh();
    });
  }

  function remove(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"?`)) return;
    startTransition(async () => {
      const result = await deleteGuideAction(id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>&ldquo;Know your rights&rdquo; guides</div>
      <Callout tone="warning">Only publish guides that a verified advocate has reviewed for accuracy. Guides are shown to the public as general information.</Callout>
      {error && <Callout tone="danger">{error}</Callout>}
      <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <TextInput label="Tag" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} />
          <TextInput label="Read time (min)" type="number" min="1" value={f.readMinutes} onChange={(e) => setF({ ...f, readMinutes: e.target.value })} />
          <Select label="Language" value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value as "en" | "hi" })} options={[["en", "English"], ["hi", "Hindi"]]} />
        </div>
        <TextArea label="Body" rows={8} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} hint="At least 50 characters." />
        <Button onClick={create} disabled={f.title.length < 5 || f.body.length < 50 || isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
          Publish guide
        </Button>
      </Card>
      {guides.map((g) => (
        <Card key={g.id} style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{g.title}</span>
          <Button variant="ghost" onClick={() => remove(g.id, g.title)} style={{ width: "auto" }}>
            Delete
          </Button>
        </Card>
      ))}
    </div>
  );
}
