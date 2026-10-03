import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Pill, Badge, Button, QueryBoundary, EmptyState } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { Field, Select, inputStyle } from "../components/forms";
import { fmtDate } from "../lib/format";

const KINDS = ["Notices", "Agreements", "Evidence", "Invoices", "Other"];

function ShareControl({ doc }) {
  const matters = useGet("/matters", undefined, { staleTime: 60000 });
  const consultations = useGet("/consultations", undefined, { staleTime: 60000 });
  const [advocateId, setAdvocateId] = useState("");
  const share = useMut((b) => api.post(`/documents/${doc.id}/share`, { advocateId: b.advocateId, share: b.share }), { invalidate: ["/documents", "/matters"], success: (_, v) => (v.share ? "Shared with that advocate only." : "Access revoked. The advocate can no longer open this document.") });

  // Only advocates this account actually works with can be chosen.
  const options = new Map();
  for (const m of matters.data || []) if (m.account_id === doc.account_id && m.advocate) options.set(m.advocate.id, m.advocate.user?.full_name);
  for (const c of consultations.data || []) if (c.account_id === doc.account_id && c.advocate) options.set(c.advocate.id, c.advocate.user?.full_name);
  const sharedWith = (doc.shared_with || []).filter((id) => options.has(id));

  if (options.size === 0) return <span style={{ fontSize: 11.5, color: "var(--color-label)" }}>Private — sharing is available once you work with an advocate</span>;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {sharedWith.map((id) => (
        <button key={id} onClick={() => share.mutate({ advocateId: id, share: false })} style={{ border: "none", background: "none", cursor: "pointer" }}><Badge tone="success">Shared with Adv. {options.get(id)?.replace(/^Adv\.?\s*/i, "")} ✕</Badge></button>
      ))}
      <select value={advocateId} onChange={(e) => { if (e.target.value) share.mutate({ advocateId: e.target.value, share: true }); setAdvocateId(""); }} aria-label="Share with" style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontSize: 12 }}>
        <option value="">Share with…</option>
        {[...options].filter(([id]) => !sharedWith.includes(id)).map(([id, name]) => <option key={id} value={id}>Adv. {name?.replace(/^Adv\.?\s*/i, "")}</option>)}
      </select>
    </div>
  );
}

export function Documents() {
  const { user, activeAccount } = useAuth();
  const [filter, setFilter] = useState("All");
  const [kind, setKind] = useState("Evidence");
  const docs = useGet("/documents");
  const upload = useMut((file) => {
    const f = new FormData();
    f.set("accountId", activeAccount.id);
    f.set("kind", kind);
    f.set("file", file);
    return api.upload("/documents", f);
  }, { invalidate: ["/documents"], success: "Uploaded. Stays private until you share it." });
  const download = useMut(async (d) => { const { url } = await api.get(`/documents/${d.id}/download`); window.open(url, "_blank", "noopener"); });
  const remove = useMut((d) => api.delete(`/documents/${d.id}`), { invalidate: ["/documents", "/matters"], success: "Deleted." });

  const rows = (docs.data || []).filter((d) => (d.owned ? d.account_id === activeAccount?.id : true) && (filter === "All" || d.kind === filter));
  const canUpload = Boolean(activeAccount);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Documents" subtitle="Stored privately and encrypted at rest. Only you — and an advocate you choose to share a document with — can open it. Platform staff cannot browse your files through the product." />

      {canUpload && (
        <Card style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", border: "1.5px dashed var(--color-border)" }}>
          <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value)} options={KINDS} style={{ minWidth: 150 }} />
          <Field label="Upload a document (PDF, DOC/DOCX, TXT, JPG, PNG · up to 25 MB)" style={{ flex: 1, minWidth: 240 }}>
            <input type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" disabled={upload.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} style={inputStyle} />
          </Field>
          {upload.isPending && <span style={{ fontSize: 12 }}>Uploading…</span>}
        </Card>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{["All", ...KINDS].map((k) => <Pill key={k} active={filter === k} onClick={() => setFilter(k)}>{k}</Pill>)}</div>

      <QueryBoundary query={docs} isEmpty={() => rows.length === 0} empty={<EmptyState title="No documents" body={user?.role === "advocate" ? "Documents clients share with you appear here." : "Upload a document to get started."} />}>
        {() => (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((d) => (
              <Card key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.filename}</div>
                  <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{Math.max(1, Math.round((d.size_bytes || 0) / 1024))} KB · {d.kind} · {fmtDate(d.created_at)}{d.sharedWithMe && !d.owned ? " · shared with you" : ""}</div>
                  {d.virus_scan_status === "pending" && <div style={{ fontSize: 11, color: "var(--color-label)" }}>Not virus-scanned — open files from people you don't know with care.</div>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {d.owned && <ShareControl doc={d} />}
                  <Button variant="outline" onClick={() => download.mutate(d)} disabled={download.isPending}>Download</Button>
                  {d.owned && <Button variant="ghost" onClick={() => window.confirm(`Delete “${d.filename}”?`) && remove.mutate(d)}>Delete</Button>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
