import { useAppState } from "../state/AppState";
import { DOCUMENTS } from "../data/mockData";
import { Card, Pill, Badge, EmptyState } from "../components/ui";

const KINDS = ["All", "Notices", "Agreements", "Evidence", "Invoices"];

export function Documents() {
  const { state, act } = useAppState();
  const all = [...state.uploads, ...DOCUMENTS];
  const filtered = state.docFilter === "All" ? all : all.filter((d) => d.kind === state.docFilter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Documents</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>End-to-end encrypted. Never visible to platform staff.</div>
      </div>

      <label style={{ display: "block", cursor: "pointer" }}>
        <Card style={{ border: "1.5px dashed var(--color-border)", textAlign: "center" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Click to upload a document</div>
          <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>PDF, DOCX or JPG, up to 25MB</div>
        </Card>
        <input type="file" hidden onChange={act.upload} />
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {KINDS.map((k) => <Pill key={k} active={state.docFilter === k} onClick={() => act.setDocFilter(k)}>{k}</Pill>)}
      </div>

      {filtered.length === 0 && <EmptyState title="No documents" body="No documents match this filter." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((d) => {
          const shared = state.shared[d.id] !== undefined ? state.shared[d.id] : d.shared;
          return (
            <Card key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{d.meta} · {d.kind}</div>
              </div>
              <button onClick={() => act.toggleShare(d.id, !shared)} style={{ border: "none", background: "none", cursor: "pointer" }}>
                <Badge tone={shared ? "success" : "neutral"}>{shared ? "Shared — click to revoke" : "Private — click to share"}</Badge>
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
