export const CLIENT_NAV = (isBusiness) => [
  { tab: "home", label: "Home" },
  { tab: "find", label: "Find a lawyer" },
  { tab: "talknow", label: "Talk now" },
  { tab: "research", label: "Research (Vidhira)" },
  { tab: "legalassistant", label: "AI Legal Assistant" },
  { tab: "caselaw", label: "Case law search" },
  { tab: "draft", label: "Draft a document" },
  { tab: "review", label: "Contract review" },
  ...(isBusiness ? [{ tab: "pack", label: "Pack compliance" }] : []),
  { tab: "services", label: "Services" },
  { tab: "matters", label: "My matters" },
  { tab: "documents", label: "Documents" },
  { tab: "messages", label: "Messages" },
  { tab: "learn", label: "Ask & learn" },
  { tab: "profile", label: "Profile" },
];

export const LAWYER_NAV = [
  { tab: "lawyer", label: "Lawyer dashboard" },
  { tab: "matters", label: "Matters" },
  { tab: "messages", label: "Client messages", badge: 4 },
  { tab: "documents", label: "Documents" },
  { tab: "profile", label: "Profile & verification" },
];

export const ADMIN_NAV = [
  { tab: "admin", label: "Verification queue" },
  { tab: "find", label: "Listed advocates" },
  { tab: "services", label: "Service catalogue" },
];

export const FOUNDER_NAV = [
  { tab: "founder", label: "Command Centre" },
  { tab: "fdemand", label: "Service demand" },
  { tab: "fservices", label: "Service performance" },
  { tab: "ffunnel", label: "User funnel" },
  { tab: "frevenue", label: "Revenue" },
  { tab: "fcorp", label: "Corporate accounts" },
  { tab: "fadv", label: "Advocate performance" },
  { tab: "fai", label: "AI performance" },
  { tab: "fcomplaints", label: "Complaints", badge: 2 },
];
