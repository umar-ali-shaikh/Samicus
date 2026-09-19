import { useAppState } from "../state/AppState";
import { QNA, GUIDES } from "../data/mockData";
import { Card, Button, Badge } from "../components/ui";

export function Learn() {
  const { state, act } = useAppState();
  return (
    <div style={{ maxWidth: 800, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Ask & learn</div>

      <Card style={{ background: "var(--color-navy)", color: "#fff", display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea value={state.askText} onChange={(e) => act.setAsk(e.target.value)} rows={3} placeholder="Ask a general legal question — never post private facts or documents." style={{ padding: 12, borderRadius: 10, border: "1px solid #2A3854", background: "#18233A", color: "#fff" }} />
        <Button onClick={act.submitAsk} style={{ alignSelf: "flex-start" }}>Post anonymously</Button>
      </Card>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Answered by verified advocates</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {QNA.map((q) => (
            <Card key={q.id} style={{ cursor: "pointer" }} onClick={() => act.openQna(state.qnaOpen === q.id ? null : q.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{q.q}</div>
                <Badge>{q.area}</Badge>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{q.answers} answers · {q.views} views</div>
              {state.qnaOpen === q.id && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--color-text)" }}>
                  <strong>{q.by}:</strong> {q.a}
                  <div style={{ fontSize: 11, color: "var(--color-label)", marginTop: 4 }}>Does not create an advocate-client relationship.</div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Know your rights</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {GUIDES.map((g) => (
            <Card key={g.id} style={{ cursor: "pointer" }} onClick={() => act.openGuide(g.title)}>
              <Badge>{g.tag}</Badge>
              <div style={{ fontWeight: 600, marginTop: 6 }}>{g.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{g.mins} min read</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
