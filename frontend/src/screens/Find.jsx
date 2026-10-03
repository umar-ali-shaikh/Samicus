import { useState } from "react";
import { useUI } from "../state/UIState";
import { useGet } from "../api/hooks";
import { Card, Callout, VerifiedBadge, Button, Pill, QueryBoundary, EmptyState, AvatarTile } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { inr, initials, languageName, modeName } from "../lib/format";
import { useAuth } from "../auth/AuthProvider";

export function AdvocateRow({ a, onBook, onProfile }) {
  const fee = a.scheduled_fee ?? a.instant_fee;
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 12 }}>
          {a.user?.avatar_url ? <img src={a.user.avatar_url} alt="" width={40} height={40} referrerPolicy="no-referrer" style={{ borderRadius: 13 }} /> : <AvatarTile initials={initials(a.user?.full_name)} />}
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700 }}>Adv. {a.user?.full_name?.replace(/^Adv\.?\s*/i, "")}</div><VerifiedBadge />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{(a.practice_areas || []).map((p) => p.name).join(", ")}{a.sub_specialisations?.length ? ` · ${a.sub_specialisations.join(", ")}` : ""}</div>
            <div style={{ fontSize: 12, color: "var(--color-label)" }}>
              {[a.city, a.years_of_practice != null && `${a.years_of_practice} yrs`, (a.languages || []).map(languageName).join(", "), (a.consultation_modes || []).map(modeName).join(", ")].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{fee != null ? inr(fee) : "Fee on request"}</div>
          <div style={{ fontSize: 11.5, color: a.availability_state === "available" ? "#0F7A55" : "var(--color-text-muted)" }}>{a.availability_state === "available" ? "Available now" : a.availability_state === "busy" ? "Busy" : "Offline"}</div>
        </div>
      </div>
      {a.whyMatched && <Callout tone="neutral" style={{ marginTop: 10 }}>{a.whyMatched}</Callout>}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {onBook && <Button onClick={() => onBook(a)}>Book consultation</Button>}
        <Button variant="outline" onClick={() => onProfile(a)}>Full profile</Button>
      </div>
    </Card>
  );
}

export function Find() {
  const { user } = useAuth();
  const { openModal, param } = useUI();
  const [q, setQ] = useState("");
  const [issue, setIssue] = useState(param || "");
  const [availableOnly, setAvailableOnly] = useState(false);
  const areas = useGet("/specialisations", undefined, { staleTime: 10 * 60 * 1000 });
  const advocates = useGet("/advocates", { q: q.trim() || undefined, issue: issue || undefined, available_today: availableOnly ? "true" : undefined });
  const canBook = user?.role !== "admin" && user?.role !== "founder";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeader title="Find a lawyer" subtitle="Every advocate listed here has been verified against Bar Council enrolment. Results are ordered by availability and experience only — no paid placement or bidding." />

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Browse by specialisation</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(areas.data || []).map((s) => (
            <Pill key={s.id} active={issue === s.id} onClick={() => setIssue(issue === s.id ? "" : s.id)}>{s.name} · {s.advocateCount}</Pill>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Search by name, city or keyword" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220, padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }} />
        <Pill active={availableOnly} onClick={() => setAvailableOnly(!availableOnly)}>Available now only</Pill>
        <button onClick={() => { setQ(""); setIssue(""); setAvailableOnly(false); }} style={{ background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12.5 }}>Reset</button>
      </div>

      <QueryBoundary query={advocates} empty={<EmptyState title="No advocates match" body="Try widening your filters. New advocates appear here as soon as their enrolment is verified." />}>
        {(list) => (
          <>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{list.length} advocate{list.length === 1 ? "" : "s"} found</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {list.map((a) => (
                <AdvocateRow key={a.id} a={a} onBook={canBook ? (x) => openModal("booking", { advocateId: x.id }) : undefined} onProfile={(x) => openModal("lawyer", { advocateId: x.id })} />
              ))}
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
