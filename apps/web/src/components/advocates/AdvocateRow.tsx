import Link from "next/link";
import type { DirectoryItemDto } from "@vidhira/contracts";
import { Card, Callout, VerifiedBadge, Button, AvatarTile } from "@/components/ui";
import { inr, initials, languageName, modeName } from "@/lib/format";

// Ported from frontend/src/screens/Find.jsx's AdvocateRow -- same copy and layout.
export function AdvocateRow({ a }: { a: DirectoryItemDto }) {
  const fee = a.scheduled_fee ?? a.instant_fee;
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 12 }}>
          {a.user?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- external avatar from Supabase/Google, not an optimizable local asset
            <img src={a.user.avatar_url} alt="" width={40} height={40} referrerPolicy="no-referrer" style={{ borderRadius: 13 }} />
          ) : (
            <AvatarTile initials={initials(a.user?.full_name)} />
          )}
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700 }}>Adv. {a.user?.full_name?.replace(/^Adv\.?\s*/i, "")}</div>
              <VerifiedBadge />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
              {a.practice_areas.map((p) => p.name).join(", ")}
              {a.sub_specialisations.length ? ` · ${a.sub_specialisations.join(", ")}` : ""}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-label)" }}>
              {[a.city, a.years_of_practice != null && `${a.years_of_practice} yrs`, a.languages.map(languageName).join(", "), a.consultation_modes.map(modeName).join(", ")]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{fee != null ? inr(fee) : "Fee on request"}</div>
          <div style={{ fontSize: 11.5, color: a.availability_state === "available" ? "#0F7A55" : "var(--color-text-muted)" }}>
            {a.availability_state === "available" ? "Available now" : a.availability_state === "busy" ? "Busy" : "Offline"}
          </div>
        </div>
      </div>
      {a.whyMatched && <Callout tone="neutral" style={{ marginTop: 10 }}>{a.whyMatched}</Callout>}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <Link href={`/advocates/${a.id}`}>
          <Button variant="outline">Full profile</Button>
        </Link>
        <Link href={`/advocates/${a.id}/book`}>
          <Button>Book consultation</Button>
        </Link>
      </div>
    </Card>
  );
}
