/**
 * Typed route/role manifest -- the single source of truth consumed by apps/web's nav menus,
 * middleware.ts role gate, and link helpers, and cross-checked against apps/api's
 * requireRole usage (see docs/architecture/01-target-architecture.md section 5).
 *
 * The manifest itself is intentionally EMPTY in Phase 1. Populating it means deriving the
 * exact tab -> URL mapping from frontend/src/shell/navConfig.js (CLIENT_NAV, LAWYER_NAV,
 * ADMIN_NAV, FOUNDER_NAV, FOUNDER_TABS, TAB_ALIASES) one domain slice at a time, per
 * docs/MASTER-PROMPT.md's Phase 3 ordering -- inventing it up front risks missing or
 * misnaming a screen. See docs/architecture/00-inventory.md section 6 for the current
 * (pre-migration) nav config this manifest will replace.
 */

export type Role = "client" | "lawyer" | "advocate" | "admin" | "founder";

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

/**
 * Populated incrementally in Phase 3, one domain slice at a time. Keep this import-safe
 * (no side effects) so apps/web's middleware can import it at the edge.
 */
export const routeManifest: readonly RouteManifestEntry[] = [];

export function findRoute(path: string): RouteManifestEntry | undefined {
  return routeManifest.find((entry) => entry.path === path);
}

export function routesForRole(role: Role): readonly RouteManifestEntry[] {
  return routeManifest.filter((entry) => entry.roles.length === 0 || entry.roles.includes(role));
}
