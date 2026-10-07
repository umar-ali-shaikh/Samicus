"use client";

import { useState } from "react";
import type { ConsultationListItemDto } from "@vidhira/contracts";
import { Pill, Callout, EmptyState } from "@/components/ui";
import { ConsultationRow } from "@/components/consultations/ConsultationRow";

const OPEN = ["scheduled", "reminder_sent", "in_progress"];

function scope(list: ConsultationListItemDto[], filter: string): ConsultationListItemDto[] {
  const isOpen = (c: ConsultationListItemDto) => OPEN.includes(c.state) && (c.scheduled_start ? new Date(c.scheduled_start).getTime() : 0) > Date.now() - 3 * 3600 * 1000;
  const rows = list.filter((c) => (filter === "Upcoming" ? isOpen(c) : !isOpen(c)));
  return rows.sort((a, b) => {
    const at = a.scheduled_start ? new Date(a.scheduled_start).getTime() : new Date(a.created_at).getTime();
    const bt = b.scheduled_start ? new Date(b.scheduled_start).getTime() : new Date(b.created_at).getTime();
    return filter === "Upcoming" ? at - bt : bt - at;
  });
}

// Ported from frontend/src/screens/Consultations.jsx. The original also scoped the list to the
// client's currently-active account; apps/web has no multi-account switcher in its shell yet,
// so a client here sees consultations across all accounts they belong to.
export function ConsultationsClient({ consultations, advocateMode }: { consultations: ConsultationListItemDto[]; advocateMode: boolean }) {
  const [filter, setFilter] = useState<"Upcoming" | "Past">("Upcoming");
  const rows = scope(consultations, filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 800 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Consultations</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Rooms open 15 minutes before the scheduled time. Video and phone calls run on Jitsi Meet; recording is off.</p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {(["Upcoming", "Past"] as const).map((f) => (
          <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f}
          </Pill>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title={`No ${filter.toLowerCase()} consultations`}
          body={advocateMode ? "Booked consultations appear here." : "Book an advocate from Find a lawyer or use Talk now."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((c) => (
            <ConsultationRow key={c.id} c={c} side={advocateMode ? "advocate" : "client"} />
          ))}
        </div>
      )}
      {!advocateMode && <Callout tone="neutral">Cancelling is possible until 4 hours before the start time.</Callout>}
    </div>
  );
}
