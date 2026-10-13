import type { UsageDto } from "@vidhira/contracts";
import { Card } from "@/components/ui";

export function UsageTab({ usage }: { usage: UsageDto }) {
  const calls = usage.callsSinceStart;
  const entries = Object.entries(calls);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 700 }}>Paid-API usage since this server started</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {entries.length === 0 ? (
          <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>No calls yet.</span>
        ) : (
          entries.map(([k, v]) => (
            <Card key={k} style={{ padding: 12 }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{v}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{k}</div>
            </Card>
          ))
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>
        In-memory counters (reset on restart): Indian Kanoon and OpenRouter (chat + embeddings) bill per call; Qdrant has a free tier.
      </div>
    </div>
  );
}
