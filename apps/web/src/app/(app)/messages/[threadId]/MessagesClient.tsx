"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { MessageDto, ThreadListItemDto } from "@vidhira/contracts";
import { Card, Button, Badge, Loading } from "@/components/ui";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { getThreadMessagesAction, sendMessageAction } from "@/server/messagesActions";

const POLL_MS = 5000;

function nameOf(thread: ThreadListItemDto): string {
  return thread.counterparts.map((c) => c.full_name).join(", ") || "Conversation";
}

function ThreadList({ threads, activeId }: { threads: ThreadListItemDto[]; activeId: string }) {
  return (
    <div style={{ width: 280, flex: "none", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
      {threads.map((t) => (
        <Link key={t.id} href={`/messages/${t.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div
            style={{
              textAlign: "left",
              padding: 12,
              borderRadius: 10,
              border: `1px solid ${activeId === t.id ? "var(--color-navy)" : "var(--color-border)"}`,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{nameOf(t)}</div>
              {t.unread > 0 && <Badge tone="danger">{t.unread}</Badge>}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-label)" }}>{t.matter?.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.lastMessage ? `${t.lastMessage.mine ? "You: " : ""}${t.lastMessage.body}` : "No messages yet"}
            </div>
            {t.lastMessage && <div style={{ fontSize: 10.5, color: "var(--color-label)" }}>{timeAgo(t.lastMessage.sentAt)}</div>}
          </div>
        </Link>
      ))}
    </div>
  );
}

function Conversation({ thread, initialMessages }: { thread: ThreadListItemDto; initialMessages: MessageDto[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    const t = setInterval(async () => {
      const fresh = await getThreadMessagesAction(thread.id);
      setMessages(fresh);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [thread.id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function submit() {
    const text = body.trim();
    if (!text || isPending) return;
    setError(undefined);
    startTransition(async () => {
      const result = await sendMessageAction(thread.id, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      setMessages((m) => [...m, result.message]);
    });
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ fontWeight: 700 }}>
        {nameOf(thread)} <span style={{ fontWeight: 400, color: "var(--color-text-muted)", fontSize: 12 }}>· {thread.matter?.title}</span>
      </div>
      <div style={{ flex: 1, minHeight: 280, maxHeight: "55vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
            <Card style={{ background: m.mine ? "var(--color-navy)" : "#fff", color: m.mine ? "#fff" : "var(--color-ink)", padding: "10px 14px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {m.body}
            </Card>
            <div style={{ fontSize: 10.5, color: "var(--color-label)", textAlign: m.mine ? "right" : "left", marginTop: 2 }}>
              {fmtDateTime(m.sent_at)}
              {m.mine && m.read_at ? " · read" : ""}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {error && <div style={{ fontSize: 12, color: "#C0392B" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Type a message…"
          maxLength={5000}
          style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 10, border: "1px solid var(--color-border)" }}
        />
        <Button onClick={submit} disabled={!body.trim() || isPending} style={{ width: "auto" }}>
          Send
        </Button>
      </div>
    </div>
  );
}

// Ported from frontend/src/screens/Messages.jsx. The original adapts to a single-pane mobile
// view via a JS viewport check (useIsMobile); apps/web keeps the list and conversation panes
// always side by side (same simplification as the matters pill bar) rather than add
// client-only viewport detection for a first pass.
export function MessagesClient({ threads, activeThreadId, initialMessages }: { threads: ThreadListItemDto[]; activeThreadId: string; initialMessages: MessageDto[] }) {
  const active = threads.find((t) => t.id === activeThreadId);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Messages</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>One conversation per matter, between you and your advocate. Not visible to platform staff through the product.</p>
      </div>
      <div style={{ display: "flex", gap: 16, minHeight: "60vh" }}>
        <ThreadList threads={threads} activeId={activeThreadId} />
        {active ? <Conversation key={active.id} thread={active} initialMessages={initialMessages} /> : <Loading />}
      </div>
    </div>
  );
}
