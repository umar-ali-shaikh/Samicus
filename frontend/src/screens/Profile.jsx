import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Button, Callout, Badge, Loading, QueryBoundary } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { Select, TextInput, TextArea } from "../components/forms";
import { ApplyAdvocate, AdvocateProfileEditor, VerificationStatus } from "./profile/AdvocateForms";
import { inr, fmtDate, STATES } from "../lib/format";

const cleanName = (n = "") => n.replace(/\s*\([0-9a-f]{6}\)$/, "");

function PersonalDetails() {
  const { user, provider, refresh } = useAuth();
  const [f, setF] = useState({ fullName: user.full_name || "", city: user.city || "", state: user.state || "", phone: user.phone || "" });
  const save = useMut(() => api.patch("/me", { fullName: f.fullName, city: f.city, state: f.state, phone: f.phone }), { success: "Profile updated.", onSuccess: refresh });
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Your details</div>
        <div style={{ display: "flex", gap: 6 }}><Badge tone="success">Email verified</Badge><Badge>{provider === "google" ? "Signed in with Google" : "Email & password"}</Badge></div>
      </div>
      <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{user.email}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <TextInput label="Full name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        <TextInput label="Phone (optional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <TextInput label="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <Select label="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} placeholder="—" options={STATES} />
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending || f.fullName.trim().length < 2} style={{ alignSelf: "flex-start" }}>Save</Button>
    </Card>
  );
}

function Members({ account }) {
  const canManage = ["owner", "admin"].includes(account.myRole);
  const members = useGet(`/accounts/${account.id}/members`);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const add = useMut(() => api.post(`/accounts/${account.id}/members`, { email, role }), { invalidate: [`/accounts/${account.id}/members`], success: "Member added. They get access when they sign in with that email.", onSuccess: () => setEmail("") });
  const remove = useMut((mid) => api.delete(`/accounts/${account.id}/members/${mid}`), { invalidate: [`/accounts/${account.id}/members`], success: "Removed." });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>Members · {account.seat_limit} seats</div>
      <QueryBoundary query={members}>
        {(list) => list.map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
            <span>{m.user?.full_name} <span style={{ color: "var(--color-text-muted)" }}>· {m.user?.email}</span></span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Badge>{m.role}</Badge>{canManage && m.role !== "owner" && <button onClick={() => remove.mutate(m.id)} style={{ background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12 }}>Remove</button>}</span>
          </div>
        ))}
      </QueryBoundary>
      {canManage && account.type !== "individual" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <TextInput label="Invite by email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)} options={["admin", "member", "finance", "viewer"]} />
          <Button onClick={() => add.mutate()} disabled={!email || add.isPending}>Add</Button>
        </div>
      )}
    </div>
  );
}

function Accounts() {
  const { accounts, activeAccount, setActiveAccountId, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ type: "business", displayName: "", gstin: "", billingAddress: "" });
  const create = useMut(() => api.post("/accounts", { type: f.type, displayName: f.displayName, gstin: f.gstin || undefined, billingAddress: f.billingAddress || undefined }), {
    success: "Account created.", onSuccess: async (a) => { await refresh(); setActiveAccountId(a.id); setOpen(false); },
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Accounts</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {accounts.map((a) => (
          <Card key={a.id} onClick={() => setActiveAccountId(a.id)} style={{ cursor: "pointer", flex: "1 1 180px", border: `1.5px solid ${activeAccount?.id === a.id ? "var(--color-navy)" : "var(--color-border)"}` }}>
            <div style={{ fontWeight: 700 }}>{cleanName(a.display_name)}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", textTransform: "capitalize" }}>{a.type} · {a.myRole}</div>
          </Card>
        ))}
      </div>
      {activeAccount && <Card><Members account={activeAccount} /></Card>}
      {open ? (
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <Select label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={[["business", "Business"], ["family", "Family"]]} />
            <TextInput label="Name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
            {f.type === "business" && <TextInput label="GSTIN (optional)" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} />}
          </div>
          {f.type === "business" && <TextArea label="Billing address (optional)" rows={2} value={f.billingAddress} onChange={(e) => setF({ ...f, billingAddress: e.target.value })} />}
          <div style={{ display: "flex", gap: 8 }}><Button onClick={() => create.mutate()} disabled={f.displayName.trim().length < 2 || create.isPending}>Create account</Button><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
        </Card>
      ) : <Button variant="outline" onClick={() => setOpen(true)} style={{ alignSelf: "flex-start" }}>+ Add a business or family account</Button>}
    </div>
  );
}

function Plans() {
  const plans = useGet("/plans");
  if (!plans.data?.length) return null;
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Plans</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {plans.data.map((p) => (
          <Card key={p.id}><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{inr(p.price_monthly)}/mo</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{p.audience}</div></Card>
        ))}
      </div>
    </div>
  );
}

function Payments() {
  const history = useGet("/payments/history");
  if (!history.data?.length) return null;
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Payments</div>
      <Card>
        {history.data.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
            <span style={{ textTransform: "capitalize" }}>{p.kind.replace("_", " ")} · {fmtDate(p.paid_at || p.created_at)}</span>
            <span>{inr(p.amount_paise / 100)} <Badge tone={p.status === "paid" ? "success" : "neutral"}>{p.status}</Badge></span>
          </div>
        ))}
      </Card>
    </div>
  );
}

const CATEGORIES = [["advocate_conduct", "Advocate conduct"], ["deliverable_delay", "Delay in a deliverable"], ["payment", "Payment / billing"], ["citation_accuracy", "Incorrect AI answer or citation"], ["compliance_coverage", "Compliance coverage gap"], ["other", "Something else"]];

function Complaints() {
  const mine = useGet("/complaints/mine");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", category: "other" });
  const submit = useMut(() => api.post("/complaints", f), { invalidate: ["/complaints"], success: "Complaint filed. We'll follow up by email.", onSuccess: () => { setOpen(false); setF({ title: "", description: "", category: "other" }); } });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 700 }}>Report a problem</div>
      {(mine.data || []).map((c) => <Card key={c.id} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: 12 }}><div><div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{c.ref} · {fmtDate(c.created_at)}</div></div><Badge tone={c.status === "resolved" ? "success" : "warning"}>{c.status}</Badge></Card>)}
      {open ? (
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Select label="What is it about?" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={CATEGORIES} />
          <TextInput label="Summary" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <TextArea label="What happened?" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} hint="At least 20 characters." />
          <div style={{ display: "flex", gap: 8 }}><Button onClick={() => submit.mutate()} disabled={f.title.trim().length < 5 || f.description.trim().length < 20 || submit.isPending}>Submit</Button><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
        </Card>
      ) : <Button variant="outline" onClick={() => setOpen(true)} style={{ alignSelf: "flex-start" }}>File a complaint</Button>}
    </div>
  );
}

function Privacy() {
  const { signOut } = useAuth();
  const { showToast } = useUI();
  const [confirming, setConfirming] = useState(false);
  const exportData = useMut(async () => {
    const res = await api.post("/privacy/export");
    const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "samicus-my-data.json" });
    document.body.appendChild(a); a.click(); a.remove();
  }, { success: "Your data export has been downloaded." });
  const del = useMut(() => api.post("/privacy/delete"), { onSuccess: async () => { showToast("Your account was deleted."); await signOut(); } });
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <Button variant="outline" onClick={() => exportData.mutate()} disabled={exportData.isPending}>Download my data</Button>
      {confirming ? (
        <>
          <span style={{ fontSize: 12.5 }}>This cannot be undone.</span>
          <Button variant="danger" onClick={() => del.mutate()} disabled={del.isPending}>{del.isPending ? "Deleting…" : "Yes, delete my account"}</Button>
          <Button variant="outline" onClick={() => setConfirming(false)}>Keep it</Button>
        </>
      ) : <Button variant="danger" onClick={() => setConfirming(true)}>Delete account</Button>}
    </div>
  );
}

export function Profile() {
  const { user, advocate } = useAuth();
  const [applying, setApplying] = useState(false);
  const { refresh } = useAuth();
  const isStaff = user.role === "admin" || user.role === "founder";
  if (!user) return <Loading />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 900 }}>
      <PageHeader title="Profile & settings" />
      <PersonalDetails />

      {advocate && <VerificationStatus advocate={advocate} />}
      {advocate && <AdvocateProfileEditor />}
      {!advocate && !isStaff && (applying ? <ApplyAdvocate onDone={() => { setApplying(false); refresh(); }} /> : (
        <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div><div style={{ fontWeight: 700 }}>Are you an advocate?</div><div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Apply to be listed. Your Bar Council enrolment is verified by our trust team before you appear to clients.</div></div>
          <Button onClick={() => setApplying(true)}>Apply to list</Button>
        </Card>
      ))}

      {!isStaff && <Accounts />}
      {!isStaff && <Plans />}
      {!isStaff && <Payments />}
      {!isStaff && <Complaints />}

      <Callout tone="neutral" title="Trust, privacy & ethics">
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>Every advocate is checked against Bar Council enrolment before being listed.</li>
          <li>A conflict check clears before your facts are shared with a matched advocate.</li>
          <li>Match ordering is neutral — never influenced by payment or advertising.</li>
          <li>Documents are stored privately; an advocate sees only what you explicitly share.</li>
          <li>Engagement terms are confirmed in writing (a fee proposal you accept) before work begins.</li>
          <li>In an emergency, call 112 — Samicus does not replace emergency services.</li>
        </ul>
      </Callout>

      <Privacy />
    </div>
  );
}
