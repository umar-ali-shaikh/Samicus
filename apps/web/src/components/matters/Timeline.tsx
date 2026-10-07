import type { TimelineEventDto } from "@vidhira/contracts";
import { EmptyState } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

// Ported from frontend/src/screens/matter/MatterTabs.jsx's Timeline.
export function Timeline({ events }: { events: TimelineEventDto[] }) {
  if (events.length === 0) return <EmptyState title="No activity yet" body="Updates to this matter appear here as they happen." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {events.map((ev) => (
        <div key={ev.id} style={{ display: "flex", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-navy)", marginTop: 6, flex: "none" }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{ev.title}</div>
            {ev.body && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{ev.body}</div>}
            <div style={{ fontSize: 11, color: "var(--color-label)" }}>
              {fmtDateTime(ev.occurred_at)} · {ev.actor_type}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
