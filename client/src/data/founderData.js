// Static mock data for the founder-only Command Centre, mirroring Command Centre.dc.html.

export const SECTIONS = {
  founder: ["Business Command Centre", "Every figure below is aggregated. Matter contents and privileged messages stay closed unless access is requested and recorded."],
  fdemand: ["Service demand", "Where the requests come from, when they arrive, and which services carry them."],
  fservices: ["Service-wise performance", "Eight services, measured the same way. Enquiry to delivery, with what it earns and what it costs in time."],
  ffunnel: ["User funnel", "Visitors through to repeat users. Click any stage to see why people left it."],
  frevenue: ["Revenue analytics", "Gross transaction value, what the platform keeps, and where it comes from."],
  fcorp: ["Corporate accounts", "Usage, consumption and renewal risk for every corporate customer."],
  fadv: ["Advocate performance", "Internal quality and responsiveness. Never a ranking, never shown to clients."],
  fai: ["AI performance", "How often Samicus answered, how often it said no, and what it could not answer at all."],
  fcomplaints: ["Complaint analytics", "Every complaint linked to the consultation, contract, scan, payment or matter that caused it."],
};

export const BRIEFING = "Requests grew 8% week-on-week, led by Contract & commercial recovery. Insufficient-authority responses on Vidhira ticked up on Karnataka rent-law questions — flagged for corpus expansion. Two corporate accounts (Kesar Naturals, Bluecrest Devices) are trending into the WATCH band on renewal risk.";

export const ASK = [
  { q: "How many urgent consultations did we handle this month?", a: "312 urgent consultations were completed this month, with a median response time of 3m 40s.", f: [{ k: "Urgent consultations", v: "312" }] },
  { q: "What is our platform revenue this month?", a: "Net platform revenue this month is ₹18.4 lakh, a 6% increase over last month.", f: [{ k: "Net platform revenue", v: "₹18.4L" }] },
  { q: "How many advocates are verified?", a: "148 advocates are currently verified and listable.", f: [{ k: "Verified advocates", v: "148" }] },
  { q: "What is our CSAT this month?", a: "Overall CSAT is 4.6 out of 5 across all services.", f: [{ k: "CSAT", v: "4.6/5" }] },
];

export const KPI_GROUPS = [
  { group: "Demand", metrics: [{ label: "Requests today", value: 214 }, { label: "Requests this week", value: 1480 }, { label: "Urgent consultations", value: 312 }, { label: "Research questions", value: 1840 }, { label: "Insufficient-authority count", value: 62, invert: true }] },
  { group: "Users and supply", metrics: [{ label: "Registered users", value: "24,810" }, { label: "Active individuals", value: "6,240" }, { label: "Active corporate accounts", value: 38 }, { label: "Verified advocates", value: 148 }, { label: "Open matters", value: 612 }] },
  { group: "Product usage", metrics: [{ label: "Contract reviews", value: 96 }, { label: "Documents drafted", value: 340 }, { label: "Pack scans", value: 58 }, { label: "Avg. response time", value: "6m" }, { label: "Repeat-user rate", value: "28%" }] },
  { group: "Money and satisfaction", metrics: [{ label: "Net platform revenue", value: "₹18.4L" }, { label: "Professional revenue", value: "₹1.2Cr" }, { label: "Pending payments", value: "₹3.1L", invert: true }, { label: "CSAT", value: "4.6/5" }, { label: "Advocate payouts due", value: "₹24L" }] },
];

export const DEMAND_DAILY = Array.from({ length: 30 }, (_, i) => 150 + Math.round(40 * Math.sin(i / 4)) + i);

export const DEMAND_CHARTS = [
  { title: "Requests by day of week", rows: [["Mon", 210], ["Tue", 240], ["Wed", 260], ["Thu", 230], ["Fri", 280], ["Sat", 150], ["Sun", 120]] },
  { title: "Highest-demand services", rows: [["Legal research", 2400], ["Advocate consultations", 1800], ["Contract drafting", 620], ["Pack compliance", 210]] },
  { title: "City / state distribution", rows: [["Bengaluru", 44], ["Mumbai", 26], ["Delhi NCR", 18], ["Other", 12]] },
  { title: "Individual vs corporate split", rows: [["Individual", 68], ["Corporate", 32]] },
];

export const SERVICE_ROWS = [
  { service: "Legal research", enquiries: 2400, started: 2400, completed: 2210, abandoned: 190, conv: 92, revenue: 0, asp: 0, time: "0.1h", csat: 4.7 },
  { service: "Advocate consultations", enquiries: 1800, started: 1500, completed: 1380, abandoned: 120, conv: 77, revenue: 3800000, asp: 2753, time: "1h", csat: 4.5 },
  { service: "Contract drafting", enquiries: 620, started: 540, completed: 480, abandoned: 60, conv: 77, revenue: 900000, asp: 1875, time: "24h", csat: 4.4 },
  { service: "Contract review", enquiries: 340, started: 300, completed: 270, abandoned: 30, conv: 79, revenue: 540000, asp: 2000, time: "12h", csat: 4.3 },
  { service: "Pack compliance", enquiries: 210, started: 190, completed: 165, abandoned: 25, conv: 79, revenue: 990000, asp: 6000, time: "6h", csat: 4.6 },
  { service: "Legal notices", enquiries: 480, started: 440, completed: 410, abandoned: 30, conv: 85, revenue: 615000, asp: 1500, time: "3h", csat: 4.5 },
  { service: "Matter management", enquiries: 612, started: 612, completed: 590, abandoned: 22, conv: 96, revenue: 0, asp: 0, time: "—", csat: 4.4 },
  { service: "Fixed-fee services", enquiries: 340, started: 300, completed: 275, abandoned: 25, conv: 81, revenue: 820000, asp: 2982, time: "5h", csat: 4.5 },
];

export const FUNNEL_STAGES = [
  { stage: "Visitors", count: 92000, reasons: [] },
  { stage: "Registered users", count: 24800, reasons: [{ reason: "OTP-screen abandonment", share: 40, evidence: "40% of drop-offs exit within 10s of the OTP screen loading." }] },
  { stage: "Service selected", count: 15200, reasons: [{ reason: "Fee sticker shock", share: 30, evidence: "Users who view 2+ services before selecting drop off 30% more." }] },
  { stage: "Payment started", count: 11000, reasons: [] },
  { stage: "Payment completed", count: 9600, reasons: [{ reason: "UPI collect timeouts", share: 55, evidence: "55% of failed payments show a UPI collect request expiring unactioned." }] },
  { stage: "Service delivered", count: 9200, reasons: [] },
  { stage: "Repeat user", count: 2600, reasons: [{ reason: "No follow-up nudge", share: 45, evidence: "Users with no post-delivery contact are 45% less likely to return." }] },
];

export const REV_KPIS = [
  ["Gross transaction value", "₹4.2Cr"], ["Net platform revenue", "₹18.4L"], ["Take rate", "12%"],
  ["Advocate payouts", "₹2.4Cr"], ["Government fees", "₹34L"], ["Refunds", "₹2.1L"],
  ["Subscription revenue", "₹8.2L"], ["Corporate revenue", "₹1.1Cr"], ["MRR", "₹14L"],
  ["ARPU", "₹740"], ["LTV:CAC ratio", "3.4x"], ["Outstanding invoices", "₹6.8L"],
];

export const REV_MONTHLY = [12, 14, 13, 16, 18, 18.4];

export const CORP = [
  { name: "Verdanta Foods", plan: "Business retainer", seats: 8, revenue: "₹12.4L", renewal: "15 Nov 2026", score: 82, band: "healthy", metrics: { users: 8, contracts: 34, drafts: 19, scans: 22, matters: 2, approvals: 1, alerts: 0, used: "61%" }, risk: "Healthy usage across drafting and pack compliance; renewal in 60 days with no red flags." },
  { name: "Kesar Naturals", plan: "Business retainer", seats: 5, revenue: "₹6.0L", renewal: "3 Oct 2026", score: 66, band: "watch", metrics: { users: 5, contracts: 10, drafts: 6, scans: 4, matters: 1, approvals: 1, alerts: 1, used: "40%" }, risk: "Pack-scan usage dropped 40% this quarter and one compliance alert is unresolved — needs a check-in before renewal." },
  { name: "Northline Distribution", plan: "Business retainer", seats: 6, revenue: "₹7.2L", renewal: "20 Dec 2026", score: 78, band: "healthy", metrics: { users: 6, contracts: 18, drafts: 9, scans: 5, matters: 1, approvals: 0, alerts: 0, used: "55%" }, risk: "Steady contract-review usage; no action needed." },
  { name: "Auroma Fragrances", plan: "Business retainer", seats: 5, revenue: "₹5.4L", renewal: "8 Nov 2026", score: 71, band: "watch", metrics: { users: 5, contracts: 8, drafts: 4, scans: 6, matters: 0, approvals: 0, alerts: 0, used: "22%" }, risk: "Seat utilisation is low relative to plan size — a downsell risk if usage doesn't pick up." },
  { name: "Bluecrest Devices", plan: "Business retainer", seats: 5, revenue: "₹6.0L", renewal: "1 Oct 2026", score: 54, band: "at_risk", metrics: { users: 5, contracts: 6, drafts: 2, scans: 3, matters: 1, approvals: 1, alerts: 1, used: "18%" }, risk: "No logins in 21 days and a pending compliance alert — needs a founder call this week, not a renewal email." },
];

export const ADV_ROWS = [
  { name: "Adv. Rohan Iyer", status: "Available now", received: 40, accepted: 34, declined: 6, response: "8m", completed: 30, converted: 22, fees: "₹1,80,000", csat: 4.6 },
  { name: "Adv. Aparna Kulkarni", status: "In consultation", received: 52, accepted: 48, declined: 4, response: "4m", completed: 45, converted: 30, fees: "₹2,40,000", csat: 4.8 },
  { name: "Adv. Harpreet Singh", status: "Offline", received: 28, accepted: 20, declined: 8, response: "18m", completed: 18, converted: 10, fees: "₹90,000", csat: 4.1 },
  { name: "Adv. Meenal Deshpande", status: "Available now", received: 22, accepted: 19, declined: 3, response: "12m", completed: 17, converted: 9, fees: "₹85,000", csat: 4.5 },
];

export const AI_KPIS = [
  ["Total questions", 1840], ["Answered in full", "68%"], ["Partial answers", "22%"], ["Refused", 0],
  ["Insufficient authority", "10%"], ["Citation opening rate", "44%"], ["Reported citation issues", 6],
  ["Corrections issued", 2], ["Avg answer time", "1.4s"], ["Cost per answer", "₹0.42"],
  ["Human-review requests", 18], ["Answered by advocate", 12],
];

export const KNOWLEDGE_GAPS = [
  { topic: "Karnataka Rent Act coverage", asked: 71, missing: "Karnataka Rent Act not indexed", source: "Karnataka Rent Act bare text + amendments", priority: "index_first" },
  { topic: "POSH Act procedural timelines", asked: 34, missing: "Internal Committee timeline provisions", source: "POSH Act 2013 rules", priority: "high" },
  { topic: "State-specific stamp duty tables", asked: 22, missing: "Per-state stamp duty schedules", source: "State stamp acts", priority: "medium" },
];

export const CMP_KPIS = [
  ["Received", 42], ["Open", "12 (3 past 72h)"], ["Resolved", "26 (62%)"], ["Escalated", 4],
  ["Avg resolution time", "36h"], ["Repeat complaints", 3], ["Refunds issued", "₹18,400 (6)"], ["Per 100 services", 1.8],
];

export const COMPLAINTS = [
  { ref: "CMP-2026-0091", title: "Contract review delivered 2 days late", category: "Deliverable delay", status: "resolved", severity: "medium", service: "Contract review", owner: "Ops", cause: "Advocate overload during a public holiday week", action: "Added a backup reviewer to the rotation", refund: "₹500" },
  { ref: "CMP-2026-0102", title: "Vidhira cited an amended provision", category: "Citation accuracy", status: "open", severity: "high", service: "Legal research", owner: "Trust & Verification", cause: "Corpus lag on a recent amendment", action: "Re-indexing affected acts", refund: "₹0" },
  { ref: "CMP-2026-0110", title: "Advocate response time exceeded SLA", category: "Supply gap", status: "escalated", severity: "high", service: "Advocate consultations", owner: "Adv. Harpreet Singh", cause: "High request volume, low availability window", action: "Escalated to advocate for availability review", refund: "₹0" },
  { ref: "CMP-2026-0115", title: "Payment captured twice", category: "Payment", status: "resolved", severity: "low", service: "Payments", owner: "Ops", cause: "Gateway retry on timeout", action: "Refund issued, gateway retry logic patched", refund: "₹1,500" },
];
