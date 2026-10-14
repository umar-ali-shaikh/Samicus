/**
 * Typed route/role manifest -- the single source of truth consumed by apps/web's
 * src/proxy.ts (coarse role gate) and cross-checked against apps/api's requireRole usage
 * (see docs/architecture/01-target-architecture.md section 5).
 *
 * `roles` is deliberately coarse: "which app roles may ever load this URL", not a full
 * authorization decision -- apps/api re-checks role AND object-level ownership on every
 * actual data request regardless (see services/access.ts's loadMatterForUser etc.), so this
 * manifest getting an edge case wrong can only ever cause a wrong redirect, never a data leak.
 * Role sets below are cross-checked against each page's backing apps/api route(s)'
 * requireRole() calls as of Phase 5 -- re-verify here if a route's role requirement changes.
 */

export type Role = "client" | "advocate" | "admin" | "founder";

export interface RouteManifestEntry {
  /** Next.js App Router path, e.g. "/matters/[matterId]". */
  path: string;
  /** Roles permitted to view this route. Empty array means public. */
  roles: readonly Role[];
  navLabel?: string;
  navIcon?: string;
  /** Optional feature flag name gating this route's visibility in nav. */
  featureFlag?: string;
}

const CLIENT: readonly Role[] = ["client"];
const ADVOCATE: readonly Role[] = ["advocate"];
const CLIENT_ADVOCATE: readonly Role[] = ["client", "advocate"];
const ADMIN_FOUNDER: readonly Role[] = ["admin", "founder"];
const ALL_ROLES: readonly Role[] = ["client", "advocate", "admin", "founder"];

export const routeManifest: readonly RouteManifestEntry[] = [
  // --- Public (auth flows) ---
  { path: "/login", roles: [] },
  { path: "/signup", roles: [] },
  { path: "/reset-password", roles: [] },
  { path: "/verify-email", roles: [] },

  // --- Client ---
  { path: "/dashboard", roles: CLIENT },
  { path: "/talk-now", roles: CLIENT },
  { path: "/research", roles: CLIENT },
  { path: "/research/[queryId]", roles: CLIENT },
  { path: "/research/judgments/[docId]", roles: CLIENT },
  { path: "/drafts", roles: CLIENT },
  { path: "/drafts/new", roles: CLIENT },
  { path: "/drafts/[draftId]", roles: CLIENT },
  { path: "/contract-review", roles: CLIENT },
  { path: "/contract-review/[reviewId]", roles: CLIENT },
  { path: "/pack-compliance", roles: CLIENT },
  { path: "/services", roles: CLIENT },
  { path: "/services/[serviceId]", roles: CLIENT },
  { path: "/advocates/[advocateId]", roles: CLIENT },
  { path: "/advocates/[advocateId]/book", roles: CLIENT },

  // --- Client + advocate (same URL, role-specific content/data) ---
  { path: "/assistant", roles: CLIENT_ADVOCATE },
  { path: "/case-law", roles: CLIENT_ADVOCATE },
  { path: "/consultations", roles: CLIENT_ADVOCATE },
  { path: "/matters", roles: CLIENT_ADVOCATE },
  { path: "/matters/[matterId]", roles: CLIENT_ADVOCATE },
  { path: "/documents", roles: CLIENT_ADVOCATE },
  { path: "/messages", roles: CLIENT_ADVOCATE },
  { path: "/messages/[threadId]", roles: CLIENT_ADVOCATE },
  { path: "/learn", roles: CLIENT_ADVOCATE },
  { path: "/learn/guides/[guideId]", roles: CLIENT_ADVOCATE },

  // --- Client + admin (GET /advocates has no role restriction beyond requireAuth) ---
  { path: "/advocates", roles: ["client", "admin"] },

  // --- Advocate ---
  { path: "/lawyer", roles: ADVOCATE },
  { path: "/lawyer/draft-reviews", roles: ADVOCATE },
  { path: "/lawyer/draft-reviews/[reviewId]", roles: ADVOCATE },

  // --- Admin (+ founder where apps/api's route actually allows it) ---
  // GET /admin/verification-cases inherits admin/router.ts's router-level requireRole("admin","founder").
  { path: "/admin/verification", roles: ADMIN_FOUNDER },
  // GET /admin/moderation has its own stricter requireRole("admin") override (learn/router.ts).
  { path: "/admin/moderation", roles: ["admin"] },
  // GET /admin/service-orders has its own stricter requireRole("admin") override (services/router.ts).
  { path: "/admin/orders", roles: ["admin"] },
  // Catalogue management (services/guides/pack-rulesets) -- an admin tool per docs/SETUP.md's
  // admin checklist; its mutation endpoints are all requireRole("admin") only.
  { path: "/admin/catalogue", roles: ["admin"] },
  // GET /admin/complaints inherits the router-level admin+founder gate, no stricter override --
  // admin/router.ts's own comment: "shared by trust & safety (admin) and the founder".
  { path: "/admin/complaints", roles: ADMIN_FOUNDER },

  // --- Founder (requireRole("founder") only -- not shared with admin, unlike /admin/*) ---
  { path: "/founder", roles: ["founder"] },
  { path: "/founder/[tab]", roles: ["founder"] },

  // --- Every role ---
  { path: "/profile", roles: ALL_ROLES },
];

export function findRoute(path: string): RouteManifestEntry | undefined {
  return routeManifest.find((entry) => entry.path === path);
}

export function routesForRole(role: Role): readonly RouteManifestEntry[] {
  return routeManifest.filter((entry) => entry.roles.length === 0 || entry.roles.includes(role));
}
