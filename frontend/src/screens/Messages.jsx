import { useEffect, useRef, useState } from "react";
import { useUI } from "../state/UIState";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Button, QueryBoundary, EmptyState, Loading, Badge } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { useIsMobile } from "../shell/useIsMobile";
import { fmtDateTime, timeAgo } from "../lib/format";

function nameOf(thread) {
  return thread.counterparts.map((c) => c.full_name).join(", ") || "Conversation";
}

export function Messages() {
  const { param, go } = useUI();
  const isMobile = useIsMobile();
  const threads = useGet("/threads", undefined, { refetchInterval: 10000 });
  const [selectedId, setSelectedId] = useState(param || null);
  const [showThread, setShowThread] = useState(Boolean(param));
  const list = threads.data || [];
  const selected = list.find((t) => t.id === selectedId) || (isMobile ? null : list[0]);

  useEffect(() => { if (param) { setSelectedId(param); setShowThread(true); } }, [param]);

  const listPane = (
    <div style={{ width: isMobile ? "100%" : 280, flex: isMobile ? undefined : "none", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
      {list.map((t) => (
        <button key={t.id} onClick={() => { setSelectedId(t.id); setShowThread(true); go("messages", t.id); }} style={{ textAlign: "left", padding: 12, borderRadius: 10, border: `1px solid ${selected?.id === t.id ? "var(--color-navy)" : "var(--color-border)"}`, background: "#fff", cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{nameOf(t)}</div>
            {t.unread > 0 && <Badge tone="danger">{t.unread}</Badge>}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-label)" }}>{t.matter?.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.lastMessage ? `${t.lastMessage.mine ? "You: " : ""}${t.lastMessage.body}` : "No messages yet"}
          </div>
          {t.lastMessage && <div style={{ fontSize: 10.5, color: "var(--color-label)" }}>{timeAgo(t.lastMessage.sentAt)}</div>}
        </button>
      ))}
    </div>
  );

  const conversation = selected ? <Conversation thread={selected} onBack={isMobile ? () => setShowThread(false) : null} /> : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Messages" subtitle="One conversation per matter, between you and your advocate. Not visible to platform staff through the product." />
      <QueryBoundary query={threads} isEmpty={() => list.length === 0} empty={<EmptyState title="No conversations yet" body="A conversation opens automatically when an advocate accepts your request or opens a matter with you." />}>
        {() => isMobile ? <div style={{ minHeight: "60vh" }}>{showThread && conversation ? conversation : listPane}</div> : <div style={{ display: "flex", gap: 16, minHeight: "60vh" }}>{listPane}{conversation}</div>}
      </QueryBoundary>
    </div>
  );
}

function Conversation({ thread, onBack }) {
  const [body, setBody] = useState("");
  const bottom = useRef(null);
  const messages = useGet(`/threads/${thread.id}/messages`, undefined, { refetchInterval: 5000, staleTime: 0 });
  const send = useMut((text) => api.post(`/threads/${thread.id}/messages`, { body: text }), { invalidate: [`/threads`], onSuccess: () => setBody("") });

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages.data?.length]);

  const submit = () => { if (body.trim() && !send.isPending) send.mutate(body.trim()); };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      {onBack && <button onClick={onBack} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--color-rust)", fontSize: 12.5, cursor: "pointer", padding: 0 }}>← All conversations</button>}
      <div style={{ fontWeight: 700 }}>{nameOf(thread)} <span style={{ fontWeight: 400, color: "var(--color-text-muted)", fontSize: 12 }}>· {thread.matter?.title}</span></div>
      <div style={{ flex: 1, minHeight: 280, maxHeight: "55vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.isPending && <Loading />}
        {(messages.data || []).map((m) => (
          <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
            <Card style={{ background: m.mine ? "var(--color-navy)" : "#fff", color: m.mine ? "#fff" : "var(--color-ink)", padding: "10px 14px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</Card>
            <div style={{ fontSize: 10.5, color: "var(--color-label)", textAlign: m.mine ? "right" : "left", marginTop: 2 }}>{fmtDateTime(m.sent_at)}{m.mine && m.read_at ? " · read" : ""}</div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder="Type a message…" maxLength={5000} style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 10, border: "1px solid var(--color-border)" }} />
        <Button onClick={submit} disabled={!body.trim() || send.isPending}>Send</Button>
      </div>
    </div>
  );
}
