import { useAppState } from "../state/AppState";
import { LAWYERS, FIRMS, SPECIALISATIONS } from "../data/mockData";
import { Card, Callout, VerifiedBadge, Button, Pill, EmptyState } from "../components/ui";

export function Find() {
  const { state, act } = useAppState();

  const filtered = LAWYERS.filter((a) => {
    if (state.availableOnly && !a.available) return false;
    if (!state.search) return true;
    const hay = `${a.name} ${a.area} ${a.subs.join(" ")} ${a.keywords}`.toLowerCase();
    return hay.includes(state.search.toLowerCase());
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Find a lawyer</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Results are ordered by relevance only — no paid placement or bidding.</div>
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Browse by specialisation</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
          {SPECIALISATIONS.map((s) => (
            <button key={s.id} onClick={() => act.pickSpecialisation(s.label)} style={{ textAlign: "left", padding: 10, borderRadius: 9, border: "1px solid var(--color-border)", background: "#fff", cursor: "pointer" }}>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{s.label}</div>
              <div style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>{s.count} advocates</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Search by name, area or keyword" value={state.search} onChange={(e) => act.setSearch(e.target.value)} style={{ flex: 1, minWidth: 220, padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }} />
        <Pill active={state.availableOnly} onClick={act.toggleAvailableOnly}>Available today only</Pill>
        <button onClick={act.resetFilters} style={{ background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12.5 }}>Reset</button>
      </div>

      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{filtered.length} advocates found</div>
      {filtered.length === 0 && <EmptyState title="No advocates match" body="Try widening your filters." />}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((a) => (
          <Card key={a.id}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ fontWeight: 700 }}>{a.name}</div><VerifiedBadge />
                </div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{a.area} · {a.subs.join(", ")}</div>
                <div style={{ fontSize: 12, color: "var(--color-label)" }}>{a.years} yrs · {a.courts} · {a.langs.join(", ")} · {a.modes.join(", ")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>₹{a.fee}</div>
                <div style={{ fontSize: 11.5, color: a.available ? "#0F7A55" : "var(--color-text-muted)" }}>{a.available ? "Available today" : "Offline"}</div>
              </div>
            </div>
            <Callout tone="neutral" style={{ marginTop: 10 }}>{a.whyMatch}</Callout>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <Button onClick={() => act.openBooking(a.id)}>Book consultation</Button>
              <Button variant="outline" onClick={() => act.talkNowWith(a.id)}>Talk now</Button>
              <Button variant="outline" onClick={() => act.openQuote(a.id)}>Ask for fee proposal</Button>
              <Button variant="outline" onClick={() => act.openLawyer(a.id)}>Full profile</Button>
            </div>
          </Card>
        ))}
      </div>

      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, marginBottom: 10 }}>Chambers & firms</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FIRMS.map((f) => (
            <Card key={f.id} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }} onClick={() => act.openFirm(f.name)}>
              <div>
                <div style={{ fontWeight: 700 }}>{f.name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{f.city} · {f.size} · {f.areas}</div>
              </div>
              <div style={{ fontSize: 13 }}>from ₹{f.fee}</div>
            </Card>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--color-navy)", color: "#fff", borderRadius: 14, padding: 16, textAlign: "center" }}>
        <Button variant="outline" style={{ background: "transparent", color: "#fff", borderColor: "#2A3854" }} onClick={() => act.go("learn")}>Ask a free question</Button>
      </div>
    </div>
  );
}
