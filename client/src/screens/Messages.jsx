import { useState } from "react";
import { useAppState } from "../state/AppState";
import { THREADS } from "../data/mockData";
import { Card, Button } from "../components/ui";
import { useIsMobile } from "../shell/useIsMobile";

export function Messages() {
  const { state, act } = useAppState();
  const isMobile = useIsMobile();
  const [body, setBody] = useState("");
  const [showThread, setShowThread] = useState(false);
  const thread = THREADS.find((t) => t.id === state.threadId) || THREADS[0];
  const extraSent = state.sent.filter((m) => m.threadId === thread.id);

  const listPane = (
    <div style={{ width: isMobile ? "100%" : 260, flex: isMobile ? undefined : "none", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
      {THREADS.map((t) => (
        <button
          key={t.id}
          onClick={() => { act.setThread(t.id); setShowThread(true); }}
          style={{ textAlign: "left", padding: 12, borderRadius: 10, border: `1px solid ${state.threadId === t.id ? "var(--color-navy)" : "var(--color-border)"}`, background: "#fff", cursor: "pointer" }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>{t.who}</div>
          <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{t.preview}</div>
        </button>
      ))}
    </div>
  );

  const conversationPane = (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      {isMobile && (
        <button onClick={() => setShowThread(false)} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--color-rust)", fontSize: 12.5, cursor: "pointer", padding: 0 }}>← All conversations</button>
      )}
      <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Not visible to platform staff.</div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {[...thread.msgs, ...extraSent].map((m, i) => (
          <div key={i} style={{ alignSelf: m.me ? "flex-end" : "flex-start", maxWidth: "80%" }}>
            <Card style={{ background: m.me ? "var(--color-navy)" : "#fff", color: m.me ? "#fff" : "var(--color-ink)", padding: "10px 14px" }}>{m.body}</Card>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { act.send(body); setBody(""); } }} placeholder="Type a message…" style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 10, border: "1px solid var(--color-border)" }} />
        <Button onClick={() => { act.send(body); setBody(""); }}>Send</Button>
      </div>
    </div>
  );

  if (isMobile) {
    return <div style={{ display: "flex", flexDirection: "column", minHeight: "60vh" }}>{showThread ? conversationPane : listPane}</div>;
  }

  return (
    <div style={{ display: "flex", gap: 16, minHeight: "60vh" }}>
      {listPane}
      {conversationPane}
    </div>
  );
}
