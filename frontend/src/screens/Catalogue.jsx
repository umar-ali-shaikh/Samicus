import { useState } from "react";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Badge, Button, Callout, Pill, QueryBoundary, EmptyState } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { Select, TextInput, TextArea } from "../components/forms";
import { inr } from "../lib/format";

const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const EMPTY_SERVICE = { category: "", name: "", description: "", professionalFee: "", governmentFee: "0", timelineDays: "", includes: "", requiredDocuments: "", deliverables: "" };

function Services() {
  const services = useGet("/services");
  const [editing, setEditing] = useState(null); // null | "new" | service
  const [f, setF] = useState(EMPTY_SERVICE);
  const open = (s) => {
    setEditing(s);
    setF(s === "new" ? EMPTY_SERVICE : { category: s.category, name: s.name, description: s.description || "", professionalFee: s.professional_fee, governmentFee: s.government_fee, timelineDays: s.timeline_days || "", includes: (s.includes || []).join("\n"), requiredDocuments: (s.required_documents || []).join("\n"), deliverables: (s.deliverables || []).join("\n") });
  };
  const body = () => ({ category: f.category, name: f.name, description: f.description || undefined, professionalFee: Number(f.professionalFee), governmentFee: Number(f.governmentFee || 0), timelineDays: f.timelineDays ? Number(f.timelineDays) : undefined, includes: lines(f.includes), requiredDocuments: lines(f.requiredDocuments), deliverables: lines(f.deliverables) });
  const save = useMut(() => (editing === "new" ? api.post("/admin/services", body()) : api.put(`/admin/services/${editing.id}`, body())), { invalidate: ["/services"], success: "Saved.", onSuccess: () => setEditing(null) });
  const remove = useMut((id) => api.delete(`/admin/services/${id}`), { invalidate: ["/services"], success: "Deleted." });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ fontWeight: 700 }}>Fixed-fee service catalogue</div><Button onClick={() => open("new")}>+ New service</Button></div>
      {editing && (
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
          <div style={{ display: "flex", gap: 8 }}><Button onClick={() => save.mutate()} disabled={save.isPending || !f.category || f.name.length < 3 || f.professionalFee === ""}>Save</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
        </Card>
      )}
      <QueryBoundary query={services} empty={<EmptyState title="No services yet" body="Create the first fixed-fee service." />}>
        {(list) => list.map((s) => (
          <Card key={s.id} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <div><div style={{ fontWeight: 600 }}>{s.name} <Badge>{s.category}</Badge></div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{inr(s.professional_fee)} + {inr(s.gov)} govt{s.timeline_days ? ` · ${s.timeline_days} days` : ""}</div></div>
            <div style={{ display: "flex", gap: 8 }}><Button variant="outline" onClick={() => open(s)}>Edit</Button><Button variant="ghost" onClick={() => window.confirm(`Delete “${s.name}”?`) && remove.mutate(s.id)}>Delete</Button></div>
          </Card>
        ))}
      </QueryBoundary>
    </div>
  );
}

function Guides() {
  const guides = useGet("/guides");
  const [f, setF] = useState({ tag: "", title: "", body: "", readMinutes: "", locale: "en" });
  const create = useMut(() => api.post("/admin/guides", { tag: f.tag || undefined, title: f.title, body: f.body, readMinutes: f.readMinutes ? Number(f.readMinutes) : undefined, locale: f.locale }), { invalidate: ["/guides"], success: "Guide published.", onSuccess: () => setF({ tag: "", title: "", body: "", readMinutes: "", locale: "en" }) });
  const remove = useMut((id) => api.delete(`/admin/guides/${id}`), { invalidate: ["/guides"], success: "Deleted." });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>“Know your rights” guides</div>
      <Callout tone="warning">Only publish guides that a verified advocate has reviewed for accuracy. Guides are shown to the public as general information.</Callout>
      <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <TextInput label="Tag" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} />
          <TextInput label="Read time (min)" type="number" min="1" value={f.readMinutes} onChange={(e) => setF({ ...f, readMinutes: e.target.value })} />
          <Select label="Language" value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value })} options={[["en", "English"], ["hi", "Hindi"]]} />
        </div>
        <TextArea label="Body" rows={8} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} hint="At least 50 characters." />
        <Button onClick={() => create.mutate()} disabled={f.title.length < 5 || f.body.length < 50 || create.isPending} style={{ alignSelf: "flex-start" }}>Publish guide</Button>
      </Card>
      {(guides.data || []).map((g) => <Card key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12 }}><span>{g.title}</span><Button variant="ghost" onClick={() => window.confirm(`Delete “${g.title}”?`) && remove.mutate(g.id)}>Delete</Button></Card>)}
    </div>
  );
}

const RULESET_EXAMPLE = JSON.stringify({
  categoryId: "food",
  categoryName: "Packaged food",
  declarations: [{ key: "net_quantity", label: "Net quantity", ruleRef: "<cite the rule>", required: true, formatPattern: "\\d+\\s?(g|kg|ml|l)" }],
  claimRules: [{ pattern: "100% natural", verdict: "needs_substantiation", ruleRef: "<cite the rule>", substantiationRequired: true, saferPhrasing: "<safer wording>" }],
}, null, 2);

function Rulesets() {
  const categories = useGet("/pack/categories");
  const [json, setJson] = useState(RULESET_EXAMPLE);
  const [error, setError] = useState("");
  const publish = useMut(() => {
    let body;
    try { body = JSON.parse(json); } catch { throw new Error("That isn't valid JSON."); }
    return api.put("/admin/pack-rulesets", body);
  }, { invalidate: ["/pack"], success: "Ruleset published as a new version. Approved packs affected by the change were flagged for re-check.", onSuccess: () => setError("") });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Pack-compliance rulesets</div>
      <Callout tone="warning">Rulesets encode regulatory requirements. Have them prepared and checked by a qualified compliance advocate — the example below is a shape, not real law. Publishing creates a new version and re-flags affected approved packs.</Callout>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{(categories.data || []).map((c) => <Pill key={c.categoryId} active={false}>{c.categoryName} · v{c.currentVersion}</Pill>)}</div>
      <TextArea label="Ruleset (JSON)" rows={14} value={json} onChange={(e) => setJson(e.target.value)} style={{ fontFamily: "var(--font-mono)" }} />
      {error && <Callout tone="danger">{error}</Callout>}
      <Button onClick={() => publish.mutate(undefined, { onError: (e) => setError(e.message) })} disabled={publish.isPending} style={{ alignSelf: "flex-start" }}>Publish new version</Button>
    </div>
  );
}

function Usage() {
  const usage = useGet("/admin/usage");
  const calls = usage.data?.callsSinceStart || {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 700 }}>Paid-API usage since this server started</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Object.keys(calls).length === 0 ? <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>No calls yet.</span> : Object.entries(calls).map(([k, v]) => <Card key={k} style={{ padding: 12 }}><div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{v}</div><div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{k}</div></Card>)}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>In-memory counters (reset on restart): Indian Kanoon and OpenRouter (chat + embeddings) bill per call; Qdrant has a free tier.</div>
    </div>
  );
}

export function Catalogue() {
  const [tab, setTab] = useState("Services");
  return (
    <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Catalogue & rules" subtitle="Everything customer-facing that isn't user-generated is managed here — nothing is hard-coded." />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{["Services", "Guides", "Pack rulesets", "Usage"].map((t) => <Pill key={t} active={tab === t} onClick={() => setTab(t)}>{t}</Pill>)}</div>
      {tab === "Services" && <Services />}
      {tab === "Guides" && <Guides />}
      {tab === "Pack rulesets" && <Rulesets />}
      {tab === "Usage" && <Usage />}
    </div>
  );
}
