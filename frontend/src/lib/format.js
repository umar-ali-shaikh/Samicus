export const inr = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : `₹${Number(n).toLocaleString("en-IN")}`);

// Defense-in-depth for plain-text titles (Indian Kanoon case titles, rendered as {title}
// text everywhere, never dangerouslySetInnerHTML): the backend already strips the <b>
// Indian Kanoon wraps its matched search term in before a title ever reaches the API
// response (services/indianKanoon.js), but a title cached/ingested before that fix shipped
// can still carry it — this is the client-side backstop, reused wherever a title is shown.
export const stripHtmlTags = (text) => String(text ?? "").replace(/<[^>]+>/g, "").trim();

export function fmtDate(d, opts = { day: "numeric", month: "short", year: "numeric" }) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", opts);
}

export function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(d) {
  if (!d) return "";
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDate(d);
}

export function initials(name = "") {
  const parts = name.replace(/^Adv\.?\s*/i, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export const PLATFORM_FEE = 99;
export const GST_RATE = 0.18;
/** Same maths as the server (services/matching.js computeFees) — display only; the server is authoritative. */
export function computeFees(fee) {
  const f = Number(fee) || 0;
  const gst = Math.round((f + PLATFORM_FEE) * GST_RATE);
  return { fee: f, platformFee: PLATFORM_FEE, gst, total: f + PLATFORM_FEE + gst };
}

export const STAGES = ["intake", "lawyer_matched", "consultation", "engagement_confirmed", "action_in_progress", "resolution"];
export const STAGE_LABEL = {
  intake: "Intake", lawyer_matched: "Lawyer matched", consultation: "Consultation", engagement_confirmed: "Engagement confirmed",
  action_in_progress: "Action in progress", resolution: "Resolution", closed: "Closed", archived: "Archived",
};
export const stageProgress = (stage) => (stage === "closed" || stage === "archived" ? 100 : ((STAGES.indexOf(stage) + 1) / STAGES.length) * 100);

export const LANGUAGES = [
  ["en", "English"], ["hi", "Hindi"], ["mr", "Marathi"], ["kn", "Kannada"], ["ta", "Tamil"], ["te", "Telugu"],
  ["bn", "Bengali"], ["gu", "Gujarati"], ["pa", "Punjabi"], ["ml", "Malayalam"], ["ur", "Urdu"],
];
export const languageName = (code) => LANGUAGES.find(([c]) => c === code)?.[1] || code;

export const MODES = [["video", "Video call"], ["phone", "Phone call"], ["chat", "Secure chat"], ["in_person", "In person"]];
export const modeName = (m) => MODES.find(([v]) => v === m)?.[1] || m;

export const URGENCY = [
  ["today", "I need help today", "Response targeted under 2 hours"],
  ["48h", "Within 48 hours", "Standard fast-track"],
  ["week", "This week", "Standard scheduling"],
  ["deadline", "I have a deadline", "Tell your advocate the date on the call"],
];

export const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Chandigarh", "Puducherry",
];
