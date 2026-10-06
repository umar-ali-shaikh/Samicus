// Navigation per role. "view" is derived from the signed-in user's role (never chosen from a
// dev switcher): client | lawyer | admin | founder.
export const CLIENT_NAV = (isBusiness) => [
  { tab: "home", label: "Home" },
  { tab: "find", label: "Find a lawyer" },
  { tab: "talknow", label: "Talk now" },
  { tab: "legalassistant", label: "AI Legal Assistant" },
  { tab: "research", label: "Research library" },
  { tab: "caselaw", label: "Case law search" },
  { tab: "draft", label: "Draft a document" },
  { tab: "review", label: "Contract review" },
  ...(isBusiness ? [{ tab: "pack", label: "Pack compliance" }] : []),
  { tab: "services", label: "Services" },
  { tab: "consultations", label: "Consultations" },
  { tab: "matters", label: "My matters" },
  { tab: "documents", label: "Documents" },
  { tab: "messages", label: "Messages" },
  { tab: "learn", label: "Ask & learn" },
  { tab: "profile", label: "Profile" },
];

export const LAWYER_NAV = [
  { tab: "lawyer", label: "Dashboard" },
  { tab: "consultations", label: "Consultations" },
  { tab: "matters", label: "Matters" },
  { tab: "messages", label: "Client messages" },
  { tab: "documents", label: "Shared documents" },
  { tab: "draftreviews", label: "Draft reviews" },
  { tab: "learn", label: "Ask & learn" },
  { tab: "legalassistant", label: "AI Legal Assistant" },
  { tab: "caselaw", label: "Case law search" },
  { tab: "profile", label: "Profile & verification" },
];

export const ADMIN_NAV = [
  { tab: "admin", label: "Verification queue" },
  { tab: "moderation", label: "Moderation" },
  { tab: "orders", label: "Service orders" },
  { tab: "catalogue", label: "Catalogue & rules" },
  { tab: "complaints", label: "Complaints" },
  { tab: "find", label: "Listed advocates" },
  { tab: "profile", label: "Profile" },
];

export const FOUNDER_NAV = [
  { tab: "founder", label: "Command Centre" },
  { tab: "fdemand", label: "Demand" },
  { tab: "fservices", label: "Service performance" },
  { tab: "ffunnel", label: "User funnel" },
  { tab: "frevenue", label: "Revenue" },
  { tab: "fcorp", label: "Corporate accounts" },
  { tab: "fadv", label: "Advocate performance" },
  { tab: "fai", label: "AI performance" },
  { tab: "fcomplaints", label: "Complaints" },
  { tab: "profile", label: "Profile" },
];

export const FOUNDER_TABS = new Set(["founder", "fdemand", "fservices", "ffunnel", "frevenue", "fcorp", "fadv", "fai", "fcomplaints"]);

// Old/alternate hash spellings that should resolve to their current tab instead of
// TabRouter falling through to a blank screen (see TabRouter's Screen-undefined -> null
// case) — e.g. a bookmarked or externally-linked #asklearn should land on "Ask & learn".
export const TAB_ALIASES = { asklearn: "learn" };

export const DEFAULT_TAB = { client: "home", lawyer: "lawyer", admin: "admin", founder: "founder" };

export function viewFor(user, actAsClient) {
  if (!user) return "client";
  if (user.role === "founder") return "founder";
  if (user.role === "admin") return "admin";
  if (user.role === "advocate" && !actAsClient) return "lawyer";
  return "client";
}
