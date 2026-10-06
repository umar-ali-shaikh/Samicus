// Founder Command Centre figures — everything is computed live from the operational tables.
// Nothing is hard-coded; where the data to compute a figure does not exist yet, the figure is
// null and the UI shows "—" rather than an invented number.
//
// Volume note: these read bounded row sets and aggregate in Node, which is fine for the
// early-stage scale this targets. Move to SQL views/materialised views as volume grows.
import { getSupabase } from "../../config/db.js";
import { knowledgeBaseStats } from "../rag/retrieve.js";

const ROW_CAP = 20000;
const DAY = 24 * 3600 * 1000;

const sb = () => getSupabase();

async function rows(table, columns, apply = (q) => q) {
  const { data, error } = await apply(sb().from(table).select(columns)).limit(ROW_CAP);
  if (error) throw error;
  return data;
}

async function count(table, apply = (q) => q) {
  const { count: n, error } = await apply(sb().from(table).select("*", { count: "exact", head: true }));
  if (error) throw error;
  return n || 0;
}

const IST = 5.5 * 3600 * 1000;
const istDay = (d) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10);
const sum = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
const avg = (xs) => (xs.length ? sum(xs) / xs.length : null);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);
const since = (days) => new Date(Date.now() - days * DAY).toISOString();

async function paidOrders() {
  return rows("payment_orders", "kind, amount_paise, paid_at, created_by", (q) => q.eq("status", "paid"));
}

async function platformFeesPaid() {
  const [consults, lines, serviceOrders] = await Promise.all([
    rows("consultations", "fee_platform", (q) => q.not("paid_at", "is", null)),
    rows("invoice_line_items", "amount, invoice:invoices!inner(status)", (q) => q.eq("category", "platform").eq("invoice.status", "paid")),
    count("service_orders", (q) => q.not("paid_at", "is", null)),
  ]);
  return sum(consults.map((c) => c.fee_platform)) + sum(lines.map((l) => l.amount)) + serviceOrders * 99;
}

export async function overview() {
  const [
    requestsToday, requestsWeek, requestsPrevWeek, urgent30, assistantTurns30, noEvidence30, researchQueries30,
    users, activeUsers30, businessAccounts, verifiedAdvocates, openMatters, contractReviews, drafts, packScans,
    paid, platform, dueInvoices, csat,
  ] = await Promise.all([
    count("intake_requests", (q) => q.gte("created_at", since(1))),
    count("intake_requests", (q) => q.gte("created_at", since(7))),
    count("intake_requests", (q) => q.gte("created_at", since(14)).lt("created_at", since(7))),
    count("intake_requests", (q) => q.eq("kind", "urgent").gte("created_at", since(30))),
    count("legal_assistant_turns", (q) => q.gte("created_at", since(30))),
    count("legal_assistant_turns", (q) => q.gte("created_at", since(30)).eq("result->>outcome", "general_guidance")),
    count("research_queries", (q) => q.gte("created_at", since(30))),
    count("users"),
    count("users", (q) => q.gte("last_login_at", since(30))),
    count("accounts", (q) => q.eq("type", "business")),
    count("advocates", (q) => q.eq("verification_status", "verified")),
    count("matters", (q) => q.not("stage", "in", "(closed,archived)")),
    count("contract_reviews"),
    count("document_drafts"),
    count("pack_scans"),
    paidOrders(),
    platformFeesPaid(),
    rows("invoices", "total", (q) => q.in("status", ["due", "overdue"])),
    rows("consultations", "csat_rating", (q) => q.not("csat_rating", "is", null)),
  ]);

  const gmv = sum(paid.map((p) => p.amount_paise)) / 100;
  const growth = requestsPrevWeek ? Math.round(((requestsWeek - requestsPrevWeek) / requestsPrevWeek) * 100) : null;
  const csatAvg = round1(avg(csat.map((c) => c.csat_rating)));

  const briefing = [
    `${requestsWeek} new request${requestsWeek === 1 ? "" : "s"} in the last 7 days${growth === null ? "" : ` (${growth >= 0 ? "+" : ""}${growth}% vs the week before)`}.`,
    `${assistantTurns30} AI legal-assistant question${assistantTurns30 === 1 ? "" : "s"} in 30 days${assistantTurns30 ? `, ${noEvidence30} without enough sources` : ""}.`,
    `${openMatters} open matter${openMatters === 1 ? "" : "s"}, ${verifiedAdvocates} verified advocate${verifiedAdvocates === 1 ? "" : "s"}.`,
  ].join(" ");

  return {
    briefing,
    groups: [
      { group: "Demand", metrics: [
        { label: "Requests today", value: requestsToday },
        { label: "Requests this week", value: requestsWeek },
        { label: "Urgent requests (30d)", value: urgent30 },
        { label: "Research & assistant questions (30d)", value: assistantTurns30 + researchQueries30 },
        { label: "Answers with insufficient sources (30d)", value: noEvidence30, invert: true },
      ] },
      { group: "Users and supply", metrics: [
        { label: "Registered users", value: users },
        { label: "Active users (30d)", value: activeUsers30 },
        { label: "Business accounts", value: businessAccounts },
        { label: "Verified advocates", value: verifiedAdvocates },
        { label: "Open matters", value: openMatters },
      ] },
      { group: "Product usage", metrics: [
        { label: "Contract reviews", value: contractReviews },
        { label: "Documents drafted", value: drafts },
        { label: "Pack scans", value: packScans },
      ] },
      { group: "Money and satisfaction", metrics: [
        { label: "Gross transaction value", value: gmv, money: true },
        { label: "Platform fees collected", value: platform, money: true },
        { label: "Invoices awaiting payment", value: sum(dueInvoices.map((i) => i.total)), money: true, invert: true },
        { label: "CSAT", value: csatAvg, suffix: "/5", note: `${csat.length} rating${csat.length === 1 ? "" : "s"}` },
      ] },
    ],
  };
}

export async function demand() {
  const intakes = await rows("intake_requests", "created_at, city, account:accounts(type)", (q) => q.gte("created_at", since(30)));
  const daily = new Map();
  for (let i = 29; i >= 0; i--) daily.set(istDay(Date.now() - i * DAY), 0);
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  const city = new Map();
  const split = new Map();
  for (const r of intakes) {
    const day = istDay(r.created_at);
    if (daily.has(day)) daily.set(day, daily.get(day) + 1);
    weekday[new Date(`${day}T12:00:00Z`).getUTCDay()]++;
    const c = r.city || "Not stated";
    city.set(c, (city.get(c) || 0) + 1);
    const t = r.account?.type === "business" ? "Business" : "Individual / family";
    split.set(t, (split.get(t) || 0) + 1);
  }
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const [assistant, research, reviews, drafts, orders, scans, consultations] = await Promise.all([
    count("legal_assistant_turns", (q) => q.gte("created_at", since(30))),
    count("research_queries", (q) => q.gte("created_at", since(30))),
    count("contract_reviews", (q) => q.gte("created_at", since(30))),
    count("document_drafts", (q) => q.gte("created_at", since(30))),
    count("service_orders", (q) => q.gte("created_at", since(30))),
    count("pack_scans", (q) => q.gte("created_at", since(30))),
    count("consultations", (q) => q.gte("created_at", since(30))),
  ]);
  const top = (m, n = 8) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    daily: [...daily.values()],
    dailyLabels: [...daily.keys()],
    charts: [
      { title: "Requests by day of week (30d)", rows: [1, 2, 3, 4, 5, 6, 0].map((d) => [names[d], weekday[d]]) },
      { title: "Service usage (30d)", rows: [["AI legal assistant", assistant], ["Research library", research], ["Advocate consultations", consultations], ["Document drafts", drafts], ["Contract reviews", reviews], ["Fixed-fee orders", orders], ["Pack scans", scans]].sort((a, b) => b[1] - a[1]) },
      { title: "Requests by city (30d)", rows: top(city) },
      { title: "Account type (30d)", rows: top(split) },
    ],
  };
}

export async function services() {
  const [consultations, orders, drafts, reviews, scans, turns, serviceDefs] = await Promise.all([
    rows("consultations", "state, fee_total, paid_at, csat_rating"),
    rows("service_orders", "service_id, status, paid_at, created_at"),
    rows("document_drafts", "status"),
    rows("contract_reviews", "status"),
    rows("pack_scans", "status"),
    rows("legal_assistant_turns", "outcome:result->>outcome"),
    rows("services", "id, name, professional_fee, government_fee"),
  ]);

  const line = (service, enquiries, started, completed, abandoned, revenue, csat) => ({
    service, enquiries, started, completed, abandoned,
    conversion: pct(started, enquiries), revenue: revenue || null, asp: revenue && started ? Math.round(revenue / started) : null, csat: round1(csat),
  });

  const paidConsults = consultations.filter((c) => c.paid_at);
  const out = [
    line("AI legal assistant", turns.length, turns.length, turns.filter((t) => t.outcome === "answered").length, turns.filter((t) => t.outcome === "general_guidance").length, 0, null),
    line("Advocate consultations", consultations.length, consultations.filter((c) => c.state !== "cancelled").length, consultations.filter((c) => ["completed", "notes_published"].includes(c.state)).length, consultations.filter((c) => c.state === "cancelled").length, sum(paidConsults.map((c) => c.fee_total)), avg(consultations.filter((c) => c.csat_rating).map((c) => c.csat_rating))),
    line("Document drafting", drafts.length, drafts.length, drafts.filter((d) => d.status !== "draft").length, drafts.filter((d) => d.status === "draft").length, 0, null),
    line("Contract review", reviews.length, reviews.length, reviews.filter((r) => r.status === "done").length, reviews.filter((r) => r.status === "failed").length, 0, null),
    line("Pack compliance", scans.length, scans.length, scans.filter((s) => s.status !== "scanning").length, 0, 0, null),
  ];
  for (const svc of serviceDefs) {
    const mine = orders.filter((o) => o.service_id === svc.id);
    const paid = mine.filter((o) => o.paid_at);
    out.push(line(svc.name, mine.length, paid.length, mine.filter((o) => o.status === "delivered").length, mine.filter((o) => o.status === "abandoned" || (!o.paid_at && Date.now() - new Date(o.created_at) > 7 * DAY)).length, paid.length * Number(svc.professional_fee), null));
  }
  return { rows: out };
}

export async function funnel() {
  const [users, intakes, consultations, orders, paid] = await Promise.all([
    count("users"),
    rows("intake_requests", "created_by"),
    rows("consultations", "state, intake:intake_requests(created_by)"),
    rows("service_orders", "account_id, status, paid_at"),
    paidOrders(),
  ]);
  const requested = new Set(intakes.map((i) => i.created_by));
  const booked = new Set(consultations.map((c) => c.intake?.created_by).filter(Boolean));
  const payers = new Set(paid.map((p) => p.created_by));
  const perPayer = new Map();
  for (const p of paid) perPayer.set(p.created_by, (perPayer.get(p.created_by) || 0) + 1);
  const delivered = consultations.filter((c) => ["completed", "notes_published"].includes(c.state)).length + orders.filter((o) => o.status === "delivered").length;
  return {
    stages: [
      { stage: "Registered users", count: users },
      { stage: "Made a request", count: requested.size },
      { stage: "Booked a consultation", count: booked.size },
      { stage: "Paid online", count: payers.size },
      { stage: "Repeat payers (2+ payments)", count: [...perPayer.values()].filter((n) => n >= 2).length },
    ],
    delivered,
    note: "Drop-off reasons are not tracked yet — only counts are shown.",
  };
}

export async function revenue() {
  const [paid, platform, dueInvoices, platformByMonth] = await Promise.all([
    paidOrders(),
    platformFeesPaid(),
    rows("invoices", "total", (q) => q.in("status", ["due", "overdue"])),
    rows("consultations", "fee_platform, paid_at", (q) => q.not("paid_at", "is", null)),
  ]);
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }
  const gmvByMonth = new Map(months.map((m) => [m, 0]));
  for (const p of paid) {
    const m = new Date(p.paid_at).toISOString().slice(0, 7);
    if (gmvByMonth.has(m)) gmvByMonth.set(m, gmvByMonth.get(m) + p.amount_paise / 100);
  }
  const byKind = new Map();
  for (const p of paid) byKind.set(p.kind, (byKind.get(p.kind) || 0) + p.amount_paise / 100);
  void platformByMonth;
  const gmv = sum(paid.map((p) => p.amount_paise)) / 100;
  return {
    kpis: [
      { label: "Gross transaction value", value: gmv, money: true },
      { label: "Platform fees collected", value: platform, money: true },
      { label: "Paid orders", value: paid.length },
      { label: "Average order value", value: paid.length ? Math.round(gmv / paid.length) : null, money: true },
      { label: "Invoices awaiting payment", value: sum(dueInvoices.map((i) => i.total)), money: true },
    ],
    monthly: months.map((m) => ({ month: m, gmv: Math.round(gmvByMonth.get(m)) })),
    byKind: [...byKind.entries()].map(([kind, amount]) => ({ kind, amount: Math.round(amount) })),
  };
}

export async function corporate() {
  const accounts = await rows("accounts", "id, display_name, type, seat_limit, gstin, created_at, plan:plans(name)", (q) => q.eq("type", "business"));
  const ids = accounts.map((a) => a.id);
  if (ids.length === 0) return { accounts: [] };
  const [members, matters, intakes] = await Promise.all([
    rows("account_members", "account_id", (q) => q.in("account_id", ids).not("accepted_at", "is", null)),
    rows("matters", "id, account_id, stage, updated_at", (q) => q.in("account_id", ids)),
    rows("intake_requests", "account_id, created_at", (q) => q.in("account_id", ids)),
  ]);
  const matterIds = matters.map((m) => m.id);
  const invoices = matterIds.length ? await rows("invoices", "matter_id, total, status", (q) => q.in("matter_id", matterIds)) : [];
  return {
    accounts: accounts.map((a) => {
      const ms = matters.filter((m) => m.account_id === a.id);
      const mids = new Set(ms.map((m) => m.id));
      const inv = invoices.filter((i) => mids.has(i.matter_id));
      const lastActivity = [...ms.map((m) => m.updated_at), ...intakes.filter((i) => i.account_id === a.id).map((i) => i.created_at)].sort().pop() || null;
      return {
        name: a.display_name,
        plan: a.plan?.name || null,
        seats: members.filter((m) => m.account_id === a.id).length,
        seatLimit: a.seat_limit,
        openMatters: ms.filter((m) => !["closed", "archived"].includes(m.stage)).length,
        totalMatters: ms.length,
        legalSpend: sum(inv.map((i) => i.total)),
        outstanding: sum(inv.filter((i) => i.status !== "paid").map((i) => i.total)),
        lastActivity,
      };
    }),
  };
}

export async function advocates() {
  const advs = await rows("advocates", "id, availability_state, verification_status, user:users(full_name)", (q) => q.eq("verification_status", "verified"));
  const ids = advs.map((a) => a.id);
  if (ids.length === 0) return { rows: [] };
  const [matches, conflicts, matters, consultations, declines] = await Promise.all([
    rows("match_results", "advocate_id, intake_id", (q) => q.in("advocate_id", ids)),
    rows("conflict_checks", "advocate_id, intake_id", (q) => q.in("advocate_id", ids)),
    rows("matters", "id, advocate_id", (q) => q.in("advocate_id", ids)),
    rows("consultations", "advocate_id, state, csat_rating, converted_matter_id", (q) => q.in("advocate_id", ids)),
    rows("audit_logs", "actor_id", (q) => q.eq("action", "request_declined")),
  ]);
  const matterIds = matters.map((m) => m.id);
  const invoices = matterIds.length ? await rows("invoices", "matter_id, total", (q) => q.in("matter_id", matterIds)) : [];
  const advUsers = await rows("advocates", "id, user_id", (q) => q.in("id", ids));
  const userByAdv = new Map(advUsers.map((a) => [a.id, a.user_id]));
  return {
    rows: advs.map((a) => {
      const received = new Set([...matches, ...conflicts].filter((r) => r.advocate_id === a.id).map((r) => r.intake_id)).size;
      const mine = consultations.filter((c) => c.advocate_id === a.id);
      const mids = new Set(matters.filter((m) => m.advocate_id === a.id).map((m) => m.id));
      return {
        name: a.user?.full_name,
        status: a.availability_state,
        received,
        accepted: mids.size,
        declined: declines.filter((d) => d.actor_id === userByAdv.get(a.id)).length,
        completed: mine.filter((c) => ["completed", "notes_published"].includes(c.state)).length,
        converted: mine.filter((c) => c.converted_matter_id).length,
        feesBilled: sum(invoices.filter((i) => mids.has(i.matter_id)).map((i) => i.total)),
        csat: round1(avg(mine.filter((c) => c.csat_rating).map((c) => c.csat_rating))),
        ratings: mine.filter((c) => c.csat_rating).length,
      };
    }),
  };
}

export async function ai() {
  const [turns, researchTotal, researchNotFound, kb] = await Promise.all([
    rows("legal_assistant_turns", "question, created_at, outcome:result->>outcome, emergency:result->emergency, understanding:result->understanding", (q) => q.gte("created_at", since(90))),
    count("research_queries"),
    count("research_queries", (q) => q.eq("outcome", "not_found")),
    knowledgeBaseStats().catch(() => ({ enabled: false })),
  ]);
  const total = turns.length;
  const answered = turns.filter((t) => t.outcome === "answered").length;
  const none = turns.filter((t) => t.outcome === "general_guidance");
  const unparsed = turns.filter((t) => t.outcome === "unparsed").length;
  const emergencies = turns.filter((t) => t.emergency?.flag).length;
  const gaps = new Map();
  for (const t of none) {
    const topic = (t.understanding?.topic || "unclassified").toLowerCase();
    const g = gaps.get(topic) || { topic, asked: 0, example: t.question };
    g.asked++;
    gaps.set(topic, g);
  }
  return {
    kpis: [
      { label: "Assistant questions (90d)", value: total },
      { label: "Answered with sources", value: answered, note: pct(answered, total) === null ? null : `${pct(answered, total)}%` },
      { label: "General guidance only (no cited source)", value: none.length, note: pct(none.length, total) === null ? null : `${pct(none.length, total)}%` },
      { label: "Unstructured answers", value: unparsed },
      { label: "Emergency-flagged", value: emergencies },
      { label: "Research queries", value: researchTotal },
      { label: "Research with no result", value: researchNotFound },
      { label: "Knowledge-base passages", value: kb.enabled ? kb.points ?? 0 : null },
    ],
    knowledgeBase: kb,
    gaps: [...gaps.values()].sort((a, b) => b.asked - a.asked).slice(0, 15),
  };
}

export async function complaints() {
  const data = await rows("complaints", "id, ref, title, description, category, status, severity, service_involved, owner, root_cause, corrective_action, refund_amount, created_at");
  data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return {
    kpis: [
      { label: "Open", value: data.filter((c) => c.status === "open").length },
      { label: "Escalated", value: data.filter((c) => c.status === "escalated").length },
      { label: "Resolved", value: data.filter((c) => c.status === "resolved").length },
      { label: "High severity", value: data.filter((c) => c.severity === "high").length },
    ],
    complaints: data,
  };
}

export const TABS = { founder: overview, fdemand: demand, fservices: services, ffunnel: funnel, frevenue: revenue, fcorp: corporate, fadv: advocates, fai: ai, fcomplaints: complaints };
