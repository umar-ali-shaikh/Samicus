// Navigation per role. "view" is derived from the signed-in user's role (never chosen from a
// dev switcher): client | lawyer | admin | founder.
import {
  faHouse,
  faUserTie,
  faPhone,
  faRobot,
  faBookOpen,
  faGavel,
  faFileLines,
  faFileContract,
  faClipboardCheck,
  faBriefcase,
  faCalendarCheck,
  faFolderOpen,
  faFolder,
  faMessage,
  faGraduationCap,
  faUser,
  faChartLine,
  faFileCircleCheck,
  faShieldHalved,
  faCartShopping,
  faList,
  faTriangleExclamation,
  faGaugeHigh,
  faFilter,
  faIndianRupeeSign,
  faBuilding,
} from "@fortawesome/free-solid-svg-icons";

export const CLIENT_NAV = (isBusiness) => [
  { tab: "home", label: "Home", icon: faHouse },
  { tab: "find", label: "Find a lawyer", icon: faUserTie },
  { tab: "talknow", label: "Talk now", icon: faPhone },
  { tab: "legalassistant", label: "AI Legal Assistant", icon: faRobot },
  { tab: "research", label: "Research library", icon: faBookOpen },
  { tab: "caselaw", label: "Case law search", icon: faGavel },
  { tab: "draft", label: "Draft a document", icon: faFileLines },
  { tab: "review", label: "Contract review", icon: faFileContract },
  ...(isBusiness ? [{ tab: "pack", label: "Pack compliance", icon: faClipboardCheck }] : []),
  { tab: "services", label: "Services", icon: faBriefcase },
  { tab: "consultations", label: "Consultations", icon: faCalendarCheck },
  { tab: "matters", label: "My matters", icon: faFolderOpen },
  { tab: "documents", label: "Documents", icon: faFolder },
  { tab: "messages", label: "Messages", icon: faMessage },
  { tab: "learn", label: "Ask & learn", icon: faGraduationCap },
  { tab: "profile", label: "Profile", icon: faUser },
];

export const LAWYER_NAV = [
  { tab: "lawyer", label: "Dashboard", icon: faChartLine },
  { tab: "consultations", label: "Consultations", icon: faCalendarCheck },
  { tab: "matters", label: "Matters", icon: faFolderOpen },
  { tab: "messages", label: "Client messages", icon: faMessage },
  { tab: "documents", label: "Shared documents", icon: faFolder },
  { tab: "draftreviews", label: "Draft reviews", icon: faFileCircleCheck },
  { tab: "learn", label: "Ask & learn", icon: faGraduationCap },
  { tab: "legalassistant", label: "AI Legal Assistant", icon: faRobot },
  { tab: "caselaw", label: "Case law search", icon: faGavel },
  { tab: "profile", label: "Profile & verification", icon: faUser },
];

export const ADMIN_NAV = [
  { tab: "admin", label: "Verification queue", icon: faClipboardCheck },
  { tab: "moderation", label: "Moderation", icon: faShieldHalved },
  { tab: "orders", label: "Service orders", icon: faCartShopping },
  { tab: "catalogue", label: "Catalogue & rules", icon: faList },
  { tab: "complaints", label: "Complaints", icon: faTriangleExclamation },
  { tab: "find", label: "Listed advocates", icon: faUserTie },
  { tab: "profile", label: "Profile", icon: faUser },
];

export const FOUNDER_NAV = [
  { tab: "founder", label: "Command Centre", icon: faGaugeHigh },
  { tab: "fdemand", label: "Demand", icon: faChartLine },
  { tab: "fservices", label: "Service performance", icon: faBriefcase },
  { tab: "ffunnel", label: "User funnel", icon: faFilter },
  { tab: "frevenue", label: "Revenue", icon: faIndianRupeeSign },
  { tab: "fcorp", label: "Corporate accounts", icon: faBuilding },
  { tab: "fadv", label: "Advocate performance", icon: faUserTie },
  { tab: "fai", label: "AI performance", icon: faRobot },
  { tab: "fcomplaints", label: "Complaints", icon: faTriangleExclamation },
  { tab: "profile", label: "Profile", icon: faUser },
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
