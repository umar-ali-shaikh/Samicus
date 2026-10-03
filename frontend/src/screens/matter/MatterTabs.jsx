import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useConfig, useMut } from "../../api/hooks";
import { api } from "../../lib/api";
import { payFor } from "../../lib/payments";
import { Card, Badge, Callout, Button, EmptyState } from "../../components/ui";
import { Select, TextInput, TextArea, Field, inputStyle } from "../../components/forms";
import { fmtDate, fmtDateTime, inr } from "../../lib/format";

const KINDS = ["Notices", "Agreements", "Evidence", "Invoices", "Other"];

export function Timeline({ data }) {
  if (!data.timeline.length) return <EmptyState title="No activity yet" body="Updates to this matter appear here as they happen." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.timeline.map((ev) => (
        <div key={ev.id} style={{ display: "flex", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-navy)", marginTop: 6, flex: "none" }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{ev.title}</div>
            {ev.body && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{ev.body}</div>}
            <div style={{ fontSize: 11, color: "var(--color-label)" }}>{fmtDateTime(ev.occurred_at)} · {ev.actor_type}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TasksAndHearings({ data, matterId }) {
  const side = data.side;
  const toggle = useMut(({ id, completed }) => api.post(`/matters/${matterId}/tasks/${id}/complete`, { completed }), { invalidate: ["/matters", "/tasks/mine"] });
  const addTask = useMut((b) => api.post(`/matters/${matterId}/tasks`, b), { invalidate: ["/matters", "/tasks/mine"], success: "Task added." });
  const addHearing = useMut((b) => api.post(`/matters/${matterId}/hearings`, b), { invalidate: ["/matters"], success: "Hearing listed." });
  const [task, setTask] = useState({ label: "", ownerType: "client", dueAt: "" });
  const [hearing, setHearing] = useState({ listedAt: "", forum: "", courtHall: "", purpose: "" });
  const upcoming = data.hearings.filter((h) => new Date(h.listed_at) >= new Date(Date.now() - 86400000));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.tasks.length === 0 && <EmptyState title="No tasks" body={side === "advocate" ? "Add the first task for your client below." : "Your advocate will add tasks here."} />}
      {data.tasks.map((t) => {
        const mine = t.owner_type === side;
        return (
          <Card key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
            <input type="checkbox" checked={Boolean(t.completed_at)} disabled={!mine || toggle.isPending} onChange={(e) => toggle.mutate({ id: t.id, completed: e.target.checked })} aria-label={t.label} />
            <div style={{ flex: 1, textDecoration: t.completed_at ? "line-through" : "none" }}>
              <div style={{ fontSize: 13.5 }}>{t.label}</div>
              <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{t.due_at ? `Due ${fmtDate(t.due_at)} · ` : ""}{t.owner_type === "client" ? "Client" : "Advocate"}{t.is_statutory_deadline ? " · statutory deadline" : ""}</div>
            </div>
          </Card>
        );
      })}

      {upcoming.map((h) => (
        <Callout key={h.id} tone="warning" title="Hearing listed">{fmtDateTime(h.listed_at)} · {h.forum}{h.court_hall ? ` · Hall ${h.court_hall}` : ""}{h.purpose ? ` · ${h.purpose}` : ""}</Callout>
      ))}

      {side === "advocate" && (
        <>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Add a task</div>
            <TextInput label="Task" value={task.label} onChange={(e) => setTask({ ...task, label: e.target.value })} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <Select label="For" value={task.ownerType} onChange={(e) => setTask({ ...task, ownerType: e.target.value })} options={[["client", "Client"], ["advocate", "Advocate"]]} />
              <TextInput label="Due (optional)" type="date" value={task.dueAt} onChange={(e) => setTask({ ...task, dueAt: e.target.value })} />
            </div>
            <Button onClick={() => addTask.mutate({ label: task.label, ownerType: task.ownerType, ...(task.dueAt ? { dueAt: new Date(`${task.dueAt}T18:00:00+05:30`).toISOString() } : {}) }, { onSuccess: () => setTask({ label: "", ownerType: "client", dueAt: "" }) })} disabled={task.label.trim().length < 2 || addTask.isPending} style={{ alignSelf: "flex-start" }}>Add task</Button>
          </Card>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>List a hearing</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <TextInput label="Date & time" type="datetime-local" value={hearing.listedAt} onChange={(e) => setHearing({ ...hearing, listedAt: e.target.value })} />
              <TextInput label="Forum" value={hearing.forum} onChange={(e) => setHearing({ ...hearing, forum: e.target.value })} />
              <TextInput label="Court hall" value={hearing.courtHall} onChange={(e) => setHearing({ ...hearing, courtHall: e.target.value })} />
              <TextInput label="Purpose" value={hearing.purpose} onChange={(e) => setHearing({ ...hearing, purpose: e.target.value })} />
            </div>
            <Button onClick={() => addHearing.mutate({ listedAt: new Date(`${hearing.listedAt}:00+05:30`).toISOString(), forum: hearing.forum || undefined, courtHall: hearing.courtHall || undefined, purpose: hearing.purpose || undefined }, { onSuccess: () => setHearing({ listedAt: "", forum: "", courtHall: "", purpose: "" }) })} disabled={!hearing.listedAt || addHearing.isPending} style={{ alignSelf: "flex-start" }}>List hearing</Button>
          </Card>
        </>
      )}
    </div>
  );
}

export function MatterDocuments({ data, matterId }) {
  const { activeAccount } = useAuth();
  const [kind, setKind] = useState("Evidence");
  const advocateId = data.matter.advocate?.id || data.matter.advocate_id;
  const upload = useMut((file) => {
    const f = new FormData();
    f.set("accountId", data.matter.account_id);
    f.set("matterId", matterId);
    f.set("kind", kind);
    f.set("file", file);
    return api.upload("/documents", f);
  }, { invalidate: ["/matters", "/documents"], success: "Uploaded. Stays private until you share it." });
  const share = useMut(({ id, share: s }) => api.post(`/documents/${id}/share`, { advocateId, share: s }), { invalidate: ["/matters", "/documents"], success: (_, v) => (v.share ? "Shared with your advocate." : "Access revoked.") });
  const download = useMut(async (d) => { const { url } = await api.get(`/documents/${d.id}/download`); window.open(url, "_blank", "noopener"); });
  void activeAccount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.documents.length === 0 && <EmptyState title="No documents" body={data.side === "advocate" ? "Documents your client shares with you appear here." : "Upload documents for this matter below."} />}
      {data.documents.map((d) => {
        const shared = (d.shared_with || []).includes(advocateId);
        return (
          <Card key={d.id} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.filename}</div>
              <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{d.kind} · {Math.max(1, Math.round((d.size_bytes || 0) / 1024))} KB · {fmtDate(d.created_at)}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Button variant="outline" onClick={() => download.mutate(d)}>Download</Button>
              {data.side === "client" && (
                <button onClick={() => share.mutate({ id: d.id, share: !shared })} style={{ border: "none", background: "none", cursor: "pointer" }}>
                  <Badge tone={shared ? "success" : "neutral"}>{shared ? "Shared — click to revoke" : "Private — click to share"}</Badge>
                </button>
              )}
            </div>
          </Card>
        );
      })}
      {data.side === "client" && (
        <Card style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value)} options={KINDS} style={{ minWidth: 140 }} />
          <Field label="File (PDF, DOC/DOCX, TXT, JPG, PNG · 25 MB max)">
            <input type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" disabled={upload.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} style={inputStyle} />
          </Field>
        </Card>
      )}
    </div>
  );
}

function ProposalForm({ matterId }) {
  const [scope, setScope] = useState("");
  const [rows, setRows] = useState([{ label: "", amount: "" }]);
  const [exclusions, setExclusions] = useState("");
  const send = useMut((b) => api.post(`/matters/${matterId}/fee-proposals`, b), { invalidate: ["/matters"], success: "Fee proposal sent to your client.", onSuccess: () => { setScope(""); setRows([{ label: "", amount: "" }]); setExclusions(""); } });
  const valid = scope.trim().length >= 10 && rows.every((r) => r.label.trim().length >= 2 && Number(r.amount) >= 0 && r.amount !== "");
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Send a fee proposal</div>
      <TextArea label="Scope of work" rows={3} value={scope} onChange={(e) => setScope(e.target.value)} />
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          <TextInput label={i === 0 ? "Milestone" : undefined} value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={{ flex: 2 }} placeholder="e.g. Demand notice" />
          <TextInput label={i === 0 ? "Amount (₹)" : undefined} type="number" min="0" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} style={{ flex: 1 }} />
        </div>
      ))}
      <button onClick={() => setRows([...rows, { label: "", amount: "" }])} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12.5 }}>+ Add milestone</button>
      <TextInput label="Exclusions (comma-separated)" value={exclusions} onChange={(e) => setExclusions(e.target.value)} placeholder="e.g. Appeal or execution proceedings" />
      <Button onClick={() => send.mutate({ scopeText: scope.trim(), milestones: rows.map((r) => ({ label: r.label.trim(), amount: Number(r.amount) })), exclusions: exclusions.split(",").map((s) => s.trim()).filter(Boolean) })} disabled={!valid || send.isPending} style={{ alignSelf: "flex-start" }}>Send proposal</Button>
    </Card>
  );
}

function InvoiceForm({ matterId }) {
  const [items, setItems] = useState([{ label: "", amount: "", category: "professional" }]);
  const create = useMut((b) => api.post(`/matters/${matterId}/invoices`, b), { invalidate: ["/matters"], success: "Invoice raised.", onSuccess: () => setItems([{ label: "", amount: "", category: "professional" }]) });
  const valid = items.every((i) => i.label.trim().length >= 2 && Number(i.amount) > 0);
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Raise an invoice</div>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TextInput label={i === 0 ? "Item" : undefined} value={it.label} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={{ flex: "2 1 160px" }} />
          <Select label={i === 0 ? "Type" : undefined} value={it.category} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} options={[["professional", "Professional fee"], ["government", "Government / court fee"]]} style={{ flex: "1 1 150px" }} />
          <TextInput label={i === 0 ? "Amount (₹)" : undefined} type="number" min="1" value={it.amount} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} style={{ flex: "1 1 100px" }} />
        </div>
      ))}
      <button onClick={() => setItems([...items, { label: "", amount: "", category: "professional" }])} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12.5 }}>+ Add line</button>
      <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>The platform fee and 18% GST are added automatically and itemised separately.</div>
      <Button onClick={() => create.mutate({ items: items.map((i) => ({ label: i.label.trim(), amount: Number(i.amount), category: i.category })) })} disabled={!valid || create.isPending} style={{ alignSelf: "flex-start" }}>Raise invoice</Button>
    </Card>
  );
}

export function Fees({ data, matterId }) {
  const { user } = useAuth();
  const config = useConfig();
  const paymentsOn = config.data?.payments?.enabled;
  const accept = useMut((pid) => api.post(`/matters/${matterId}/fee-proposals/${pid}/accept`), { invalidate: ["/matters"], success: "Engagement confirmed." });
  const pay = useMut((inv) => payFor("invoice", inv.id, { user, description: "Matter invoice" }), { invalidate: ["/matters"], success: (ok) => (ok ? "Payment received." : "") });
  const settle = useMut((inv) => api.post(`/matters/${matterId}/invoices/${inv.id}/settle-offline`), { invalidate: ["/matters"], success: "Recorded as paid." });
  const side = data.side;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {data.feeProposals.length === 0 && data.invoices.length === 0 && <EmptyState title="No fees yet" body={side === "advocate" ? "Send a fee proposal to confirm the engagement." : "Your advocate's fee proposal and invoices will appear here."} />}

      {data.feeProposals.map((p) => {
        const expired = p.valid_until && new Date(p.valid_until) < new Date();
        return (
          <Card key={p.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Fee proposal · {fmtDate(p.created_at)}</div>
              <Badge tone={p.accepted_at ? "success" : expired ? "danger" : "warning"}>{p.accepted_at ? "Accepted" : expired ? "Expired" : "Awaiting acceptance"}</Badge>
            </div>
            <div style={{ fontSize: 13 }}>{p.scope_text}</div>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <tbody>
                {p.milestones.map((m, i) => <tr key={i}><td style={{ padding: "4px 0" }}>{m.label}</td><td style={{ textAlign: "right" }}>{inr(m.amount)}</td></tr>)}
                <tr style={{ borderTop: "1px solid var(--color-border)", fontWeight: 700 }}><td style={{ padding: "6px 0" }}>Total professional fees</td><td style={{ textAlign: "right" }}>{inr(p.milestones.reduce((s, m) => s + Number(m.amount), 0))}</td></tr>
              </tbody>
            </table>
            {p.statutory_estimate && <div style={{ fontSize: 12 }}>Statutory/court charges: {p.statutory_estimate}</div>}
            {p.exclusions?.length > 0 && <Callout tone="warning">Not included: {p.exclusions.join("; ")}. The advocate makes no representation about the outcome.</Callout>}
            {side === "client" && !p.accepted_at && !expired && <Button onClick={() => accept.mutate(p.id)} disabled={accept.isPending} style={{ alignSelf: "flex-start" }}>Accept & confirm engagement</Button>}
          </Card>
        );
      })}

      {data.invoices.map((inv) => (
        <Card key={inv.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>Invoice · {fmtDate(inv.created_at)}</div>
            <Badge tone={inv.status === "paid" ? "success" : "warning"}>{inv.status}</Badge>
          </div>
          {(inv.invoice_line_items || []).sort((a, b) => a.position - b.position).map((li) => (
            <div key={li.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span>{li.label} <Badge tone={li.category === "government" ? "warning" : "neutral"}>{li.category}</Badge></span><span>{inr(li.amount)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}><span>Total incl. GST</span><span>{inr(inv.total)}</span></div>
          {inv.status !== "paid" && side === "client" && (paymentsOn ? <Button onClick={() => pay.mutate(inv)} disabled={pay.isPending} style={{ alignSelf: "flex-start" }}>Pay {inr(inv.total)}</Button> : <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Online payment isn't enabled — settle this directly with your advocate.</div>)}
          {inv.status !== "paid" && side === "advocate" && !paymentsOn && <Button variant="outline" onClick={() => settle.mutate(inv)} disabled={settle.isPending} style={{ alignSelf: "flex-start" }}>Mark as paid (received directly)</Button>}
        </Card>
      ))}
      <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Court fees, professional fees and the platform fee are always itemised separately.</div>

      {side === "advocate" && <><ProposalForm matterId={matterId} /><InvoiceForm matterId={matterId} /></>}
    </div>
  );
}

export function Access({ data, matterId }) {
  const [form, setForm] = useState({ email: "", role: "Viewer", scope: ["documents"] });
  const grant = useMut((b) => api.post(`/matters/${matterId}/access`, b), { invalidate: ["/matters"], success: "Access granted.", onSuccess: () => setForm({ email: "", role: "Viewer", scope: ["documents"] }) });
  const revoke = useMut((gid) => api.delete(`/matters/${matterId}/access/${gid}`), { invalidate: ["/matters"], success: "Revoked immediately. The audit log keeps a record." });
  const toggle = (s) => setForm((f) => ({ ...f, scope: f.scope.includes(s) ? f.scope.filter((x) => x !== s) : [...f.scope, s] }));
  const advocateName = data.matter.advocate?.user?.full_name;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ fontWeight: 600, fontSize: 13.5 }}>Adv. {advocateName?.replace(/^Adv\.?\s*/i, "")}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Engaged advocate · sees only documents you share</div></div>
      </Card>
      {data.access.map((g) => (
        <Card key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{g.subject_name}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{g.subject_role} · {g.scope.join(", ")}</div></div>
          <Button variant="outline" onClick={() => revoke.mutate(g.id)} disabled={revoke.isPending}>Revoke</Button>
        </Card>
      ))}
      <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Share this matter with someone</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <TextInput label="Their email (must have a Samicus account)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <TextInput label="Their role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Finance head" />
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          {["documents", "messages", "tasks", "fees"].map((s) => <label key={s} style={{ display: "flex", gap: 6 }}><input type="checkbox" checked={form.scope.includes(s)} onChange={() => toggle(s)} /> {s}</label>)}
        </div>
        <Button onClick={() => grant.mutate(form)} disabled={!form.email || form.scope.length === 0 || grant.isPending} style={{ alignSelf: "flex-start" }}>Grant access</Button>
      </Card>
    </div>
  );
}
