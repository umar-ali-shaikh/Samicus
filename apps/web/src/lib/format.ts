// Ported subset of frontend/src/lib/format.js -- shared display formatting, no business logic.
export const inr = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : `₹${Number(n).toLocaleString("en-IN")}`;

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function initials(name = ""): string {
  const parts = name.replace(/^Adv\.?\s*/i, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "")).toUpperCase() || "?";
}

export const LANGUAGES: Array<[string, string]> = [
  ["en", "English"], ["hi", "Hindi"], ["mr", "Marathi"], ["kn", "Kannada"], ["ta", "Tamil"], ["te", "Telugu"],
  ["bn", "Bengali"], ["gu", "Gujarati"], ["pa", "Punjabi"], ["ml", "Malayalam"], ["ur", "Urdu"],
];
export const languageName = (code: string): string => LANGUAGES.find(([c]) => c === code)?.[1] || code;

export const MODES: Array<[string, string]> = [["video", "Video call"], ["phone", "Phone call"], ["chat", "Secure chat"], ["in_person", "In person"]];
export const modeName = (m: string): string => MODES.find(([v]) => v === m)?.[1] || m;

export const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Chandigarh", "Puducherry",
];

export const URGENCY: Record<string, string> = { today: "Today", "48h": "Within 48h", week: "This week", deadline: "Has a deadline" };
