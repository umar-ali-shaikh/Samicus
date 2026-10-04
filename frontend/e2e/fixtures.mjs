// API fixtures for the UI smoke test: realistic response shapes (matching the backend routes)
// so every screen can be rendered in a real browser without a live Supabase/Qdrant.
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = Date.now();
const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
const H = 3600 * 1000;

export const IDS = { user: uuid(1), account: uuid(2), bizAccount: uuid(3), adv: uuid(10), advUser: uuid(11), matter: uuid(20), thread: uuid(30), area: uuid(40), situation: uuid(41), template: uuid(50), clause: uuid(51), draft: uuid(52), doc: uuid(60), consult: uuid(70), intake: uuid(71), service: uuid(80), question: uuid(90), guide: uuid(91) };

export const personas = {
  client: { role: "client", name: "Meera Raghavan" },
  advocate: { role: "advocate", name: "Rohan Iyer" },
  admin: { role: "admin", name: "Priya Ops" },
  founder: { role: "founder", name: "Samir Founder" },
};

const area = { id: IDS.area, name: "Contract & commercial recovery" };
const advocateRow = (extra = {}) => ({
  id: IDS.adv, user: { full_name: "Rohan Iyer", avatar_url: null }, city: "Bengaluru", years_of_practice: 11, bar_council: "Bar Council of Karnataka", enrolment_number: "KAR/1000/2010",
  availability_state: "available", scheduled_fee: 3200, instant_fee: 2500, accepts_urgent: true, verification_status: "verified",
  practice_areas: [area], sub_specialisations: ["Vendor recovery"], languages: ["en", "hi"], consultation_modes: ["video", "phone"], jurisdictions: [{ state: "Karnataka", forum: "City Civil Court" }],
  education: ["National Law School"], relevant_experience: ["Recovered dues for an FMCG business"], keywords: [], weekly_schedule: { days: [1, 2, 3, 4, 5, 6], start: "09:00", end: "19:00", slotMinutes: 60 },
  whyMatched: "Matched on verified status — ordered by availability and experience, never by payment or rating.", ...extra,
});

function slots() {
  const out = [];
  for (let d = 1; d <= 3; d++) {
    const date = new Date(now + d * 24 * H).toISOString().slice(0, 10);
    out.push({ date, slots: ["09:00", "10:00", "11:00"].map((time, i) => ({ time, startsAt: new Date(`${date}T${time}:00+05:30`).toISOString(), full: i === 1 })) });
  }
  return out;
}

const consultation = (extra = {}) => ({
  id: IDS.consult, intake_id: IDS.intake, advocate_id: IDS.adv, account_id: IDS.account, mode: "video", scheduled_start: iso(26 * H), state: "scheduled", fee_total: 3500, paid_at: null, notes: null, converted_matter_id: null, csat_rating: null,
  advocate: { id: IDS.adv, city: "Bengaluru", user: { full_name: "Rohan Iyer" } }, account: { display_name: "Meera Raghavan (000002)" }, intake: { kind: "scheduled", practice_area: area }, ...extra,
});

const matter = {
  id: IDS.matter, reference: "SM-BLR-2026-88010", account_id: IDS.account, advocate_id: IDS.adv, title: "Contract & commercial recovery matter", stage: "engagement_confirmed", next_action: "File rejoinder", forum: "Commercial Court",
  opened_at: iso(-20 * 24 * H), engaged_at: iso(-10 * 24 * H), advocate: { id: IDS.adv, city: "Bengaluru", user: { full_name: "Rohan Iyer", avatar_url: null } }, practice_area: area, account: { display_name: "Meera Raghavan (000002)", type: "individual" },
};

export function handle(method, path, persona, body) {
  const role = persona.role;
  const p = path.replace(/^\/api/, "");
  const m = (re) => re.exec(p);

  if (p === "/config") return { payments: { enabled: false }, research: { enabled: true }, legalAssistant: { enabled: true }, video: { provider: "jitsi" } };
  if (p === "/me") {
    const user = { id: role === "advocate" ? IDS.advUser : IDS.user, email: `${persona.name.split(" ")[0].toLowerCase()}@example.com`, full_name: persona.name, role, avatar_url: null, city: "Pune", state: "Maharashtra", phone: null };
    return { user, accounts: [{ id: IDS.account, display_name: `${persona.name} (000002)`, type: "individual", myRole: "owner", seat_limit: 1 }, ...(role === "client" ? [{ id: IDS.bizAccount, display_name: "Verdanta Foods", type: "business", myRole: "owner", seat_limit: 10 }] : [])], advocate: role === "advocate" ? { id: IDS.adv, verification_status: "verified", bar_council: "Bar Council of Karnataka", enrolment_number: "KAR/1000/2010", availability_state: "available", accepts_urgent: true } : null, provider: "google" };
  }
  if (p === "/threads") return [{ id: IDS.thread, matter: { title: matter.title, reference: matter.reference }, counterparts: [{ id: IDS.advUser, full_name: "Rohan Iyer" }], lastMessage: { body: "Please share the purchase order.", sentAt: iso(-H), mine: false }, unread: 2 }];
  if (m(/^\/threads\/[^/]+\/messages$/)) return method === "POST" ? { id: uuid(999), body: body.body, mine: true, sent_at: iso(0) } : [{ id: uuid(901), body: "Please share the purchase order.", mine: false, sent_at: iso(-H) }, { id: uuid(902), body: "Uploading now.", mine: true, sent_at: iso(-H / 2), read_at: iso(-H / 3) }];
  if (p === "/situations") return [{ id: IDS.situation, label_en: "Vendor won't pay / contract breach", label_hi: "अनुबंध उल्लंघन", mapped_practice_area_id: IDS.area, mapped_practice_area: area }];
  if (p === "/specialisations") return [{ ...area, advocateCount: 1 }];
  if (p === "/matters") return [{ ...matter, mySide: role === "advocate" ? "advocate" : "client" }];
  if (m(/^\/matters\/[^/]+$/)) return {
    matter, side: role === "advocate" ? "advocate" : "client",
    timeline: [{ id: uuid(1), title: "Matter opened", body: "Advocate accepted your request.", occurred_at: iso(-20 * 24 * H), actor_type: "advocate" }],
    tasks: [{ id: uuid(2), label: "Upload purchase order", owner_type: "client", due_at: iso(3 * 24 * H), completed_at: null, is_statutory_deadline: false }, { id: uuid(3), label: "Draft rejoinder", owner_type: "advocate", due_at: null, completed_at: iso(-H) }],
    hearings: [{ id: uuid(4), listed_at: iso(14 * 24 * H), forum: "Commercial Court", court_hall: "4", purpose: "Arguments" }],
    documents: [{ id: IDS.doc, filename: "purchase-order.pdf", kind: "Evidence", size_bytes: 120000, shared_with: [IDS.adv], created_at: iso(-5 * 24 * H) }],
    access: [{ id: uuid(5), subject_name: "Finance Head", subject_role: "Fees only", scope: ["fees"] }],
    feeProposals: [{ id: uuid(6), created_at: iso(-12 * 24 * H), scope_text: "Recovery of dues incl. notice and filing.", milestones: [{ label: "Demand notice", amount: 15000 }, { label: "Filing", amount: 45000 }], exclusions: ["Appeal"], accepted_at: iso(-10 * 24 * H), valid_until: null, statutory_estimate: "₹8,000 court fee" }],
    invoices: [{ id: uuid(7), created_at: iso(-9 * 24 * H), status: "due", total: 17700, invoice_line_items: [{ id: uuid(8), position: 0, label: "Demand notice", amount: 15000, category: "professional" }, { id: uuid(9), position: 1, label: "Platform fee", amount: 99, category: "platform" }] }],
  };
  if (p === "/consultations") return [consultation(), consultation({ id: uuid(72), state: "completed", scheduled_start: iso(-48 * H), csat_rating: null })];
  if (p === "/tasks/mine") return [{ id: uuid(2), label: "Upload purchase order", matter_id: IDS.matter, matter: { title: matter.title }, due_at: iso(3 * 24 * H) }];
  if (p === "/advocates") return [advocateRow()];
  if (m(/^\/advocates\/[^/]+\/slots$/)) return slots();
  if (m(/^\/advocates\/[^/]+$/)) return advocateRow();
  if (p === "/documents") return [{ id: IDS.doc, account_id: IDS.account, filename: "lease-agreement.pdf", kind: "Agreements", size_bytes: 220000, shared_with: [], virus_scan_status: "pending", created_at: iso(-3 * 24 * H), owned: true, sharedWithMe: false }];
  if (p === "/services") return [{ id: IDS.service, category: "Notices", name: "Legal notice drafting", description: "A demand notice drafted by a verified advocate.", professional_fee: 1499, government_fee: 0, gov: 0, timeline_days: 3, includes: ["Initial review"], required_documents: ["Government ID"], deliverables: ["Signed PDF"], fees: { fee: 1499, platformFee: 99, gst: 288, total: 1886 } }];
  if (p === "/service-orders") return [{ id: uuid(81), status: "started", paid_at: null, created_at: iso(-H), service: { name: "Legal notice drafting" } }];
  if (p === "/doc-templates") return [{ id: IDS.template, category: "rental", name: "Rental Agreement", blurb: "An 11-month leave-and-license agreement.", pages: 4, draft_fee: 0, review_fee: 1499, version: 1 }];
  if (m(/^\/doc-templates\/[^/]+$/)) return { template: { id: IDS.template, name: "Rental Agreement", review_fee: 1499, stamp_duty_note: "Stamp duty depends on the state.", field_schema: [{ key: "landlordName", label: "Landlord name", placeholder: "Landlord Name", required: true }] }, clauses: [{ id: IDS.clause, title: "Lock-in period", rationale_note: "A lock-in protects occupancy planning.", disposition: "recommended", favors: "balanced" }] };
  if (p === "/drafts") return method === "POST" ? { id: IDS.draft, template_id: IDS.template, field_values: {}, selected_clause_ids: [], custom_clauses: [], status: "draft" } : [{ id: IDS.draft, status: "draft", template: { name: "Rental Agreement" } }];
  if (m(/^\/drafts\/[^/]+\/preview$/)) return { blocks: [{ n: 1, heading: "Parties", text: "This agreement is made between Landlord Name and Tenant Name.", reviewAdvised: false }], flaggedFields: [] };
  if (m(/^\/drafts\/[^/]+$/)) return method === "PATCH" ? { id: IDS.draft, template_id: IDS.template, field_values: {}, selected_clause_ids: [], custom_clauses: [], status: "draft" } : { id: IDS.draft, template_id: IDS.template, field_values: {}, selected_clause_ids: [], custom_clauses: [], status: "draft" };
  if (p === "/contract-reviews") return [{ id: uuid(100), contract_type: "rental", clauses_identified: 12, status: "done", created_at: iso(-24 * H), document: { filename: "lease.pdf" } }];
  if (m(/^\/contract-reviews\/[^/]+$/)) return { id: uuid(100), contract_type: "rental", counterparty_name: "Landlord", clauses_identified: 12, notes: "2 of 12 clauses were compared.", created_at: iso(-24 * H), document: { filename: "lease.pdf" }, findings: [{ id: uuid(101), position: 0, clause_type: "Security deposit", clause_ref: "Clause 2", extracted_text: "Deposit of ten months' rent.", favors: "counterparty", deviation_note: "Higher than market baseline.", recommended_ask: "Reduce to 2–3 months.", why_it_matters: "Ties up cash.", similarity: 0.82, library_entry: { title: "Security deposit" } }] };
  if (p === "/pack/categories") return [{ categoryId: "food", categoryName: "Packaged food", currentVersion: 1, declarations: [{ key: "net_quantity", label: "Net quantity", ruleRef: "Rule X", required: true }] }];
  if (p === "/pack/portfolio") return [{ id: uuid(110), sku: "SKU1", product_name: "Granola", ruleset_version: 1, status: "warn", declaration_results: [{ key: "net_quantity", label: "Net quantity", status: "pass", ruleRef: "Rule X", extractedValue: "500 g" }], claim_results: [{ text: "100% natural", verdict: "needs_substantiation", why: "Needs substantiation", saferPhrasing: "Made with natural ingredients" }], created_at: iso(-H), approved_at: null }];
  if (p === "/pack/drift") return [];
  if (p === "/questions") return [{ id: IDS.question, body: "Can a landlord evict without notice?", practice_area: "Property & tenancy", city: "Pune", created_at: iso(-5 * 24 * H), answers: [{ id: uuid(92), body: "Generally a notice is required.", helpful_count: 3, advocate: { user: { full_name: "Rohan Iyer" } } }] }];
  if (p === "/questions/mine") return [];
  if (p === "/guides") return [{ id: IDS.guide, tag: "Arrest", title: "Your rights on arrest", read_minutes: 4 }];
  if (m(/^\/guides\/[^/]+$/)) return { id: IDS.guide, title: "Your rights on arrest", body: "You have the right to be informed of the grounds of arrest.", reviewed_at: iso(-30 * 24 * H) };
  if (p === "/plans") return [];
  if (p === "/payments/history") return [];
  if (p === "/complaints/mine") return [];
  if (m(/^\/accounts\/[^/]+\/members$/)) return [{ id: uuid(120), role: "owner", user: { id: IDS.user, full_name: persona.name, email: "x@example.com" } }];
  if (m(/^\/accounts\/[^/]+\/legal-spend$/)) return { openMatters: 1, totals: { professional: 60000, government: 8000, platform: 99, total: 70000, paid: 40000 } };
  if (p === "/corpus/status") return { bySource: [{ source: "supreme_court", count: 3 }], chunkCount: 120, vectorIndex: { enabled: true, points: 120 } };
  if (m(/^\/corpus\/chunks\/([^/]+)$/)) {
    const [, id] = m(/^\/corpus\/chunks\/([^/]+)$/);
    return {
      id,
      document_id: IDS.doc,
      ordinal: 0,
      text: "Agreement in restraint of trade is void.",
      paragraph_class: "reasoning",
      document: { id: IDS.doc, title: "Golikari v Century", source: "supreme_court", canonical_url: "https://indiankanoon.org/doc/1/" },
      context: [{ id, ordinal: 0, text: "Agreement in restraint of trade is void.", paragraph_class: "reasoning" }],
    };
  }
  if (m(/^\/legal-assistant\/session\//)) return { turns: [] };
  if (p === "/legal-assistant/ask") return { outcome: "answered", understanding: { searchQuery: "q", topic: "tenancy", language: "english" }, emergency: { flag: false }, sections: { summary: "Per [1], a tenant may recover a deposit.", immediateActions: [], stepByStep: [], yourRights: [], applicableLaws: [], caseLaw: [], whereToGetHelp: [], gaps: [], followUpQuestions: [], confidence: "medium" }, sources: [{ tid: 1, title: "X vs Y", docsource: "Delhi High Court", url: "https://indiankanoon.org/doc/1/" }], retrieval: { mode: "knowledge_base", passages: 3, servedFromKnowledgeBase: true }, disclaimer: "..." };
  if (p === "/research/retrieve") return { retrievalId: uuid(130), threshold: 0.55, chunks: [{ chunkId: uuid(131), score: 0.78, kept: true, text: "Agreement in restraint of trade is void.", paragraphClass: "reasoning", documentTitle: "Golikari v Century", source: "supreme_court", url: "https://indiankanoon.org/doc/1/" }, { chunkId: uuid(132), score: 0.4, kept: false, text: "Unrelated.", paragraphClass: "facts", documentTitle: "Other", source: "high_court" }] };
  if (p === "/research/answer") return { outcome: "answered", segments: [{ chunkId: uuid(131), text: "Agreement in restraint of trade is void.", documentTitle: "Golikari v Century", score: 0.78 }], discardedCount: 1 };
  if (p === "/case-law/search") return { found: 1, docs: [{ tid: 1, title: "X vs Y", headline: "<b>deposit</b> dispute", docsource: "Delhi High Court" }] };

  // advocate
  if (p === "/advocate/requests") return [{ id: IDS.intake, practice_area: area, kind: "instant", urgency: "today", mode: "video", language: "en", city: "Pune", state: "Maharashtra", created_at: iso(-300000), conflict_status: "pending" }];
  if (p === "/advocate/draft-reviews") return [{ id: uuid(140), status: "pending", submitted_at: iso(-H), draft: { id: IDS.draft, template: { name: "Rental Agreement" } } }];
  if (p === "/advocate/profile") return advocateRow();

  // admin / founder
  if (p === "/admin/stats") return { pendingVerification: 1, verifiedAdvocates: 4, pendingModeration: 2, openComplaints: 1, conflictFlags30d: 0, unassignedServiceOrders: 1 };
  if (p === "/admin/verification-cases") return [{ id: uuid(150), created_at: iso(-H), checks: [{ type: "bar_council_enrolment", status: "pending" }], advocate: { id: IDS.adv, bar_council: "Bar Council of Delhi", enrolment_number: "D/123/2018", enrolment_year: 2018, city: "Delhi", years_of_practice: 8, education: ["DU Law"], user: { full_name: "Anil Kumar", email: "anil@example.com" }, advocate_practice_areas: [{ practice_area: area }] } }];
  if (p === "/admin/moderation") return { questions: [{ id: uuid(151), body: "What is bail?", practice_area: "Criminal defence", city: "Pune" }], answers: [{ id: uuid(152), body: "Bail is release from custody pending trial.", question: { body: "What is bail?" }, advocate: { user: { full_name: "Rohan Iyer" } } }] };
  if (p === "/admin/service-orders") return [{ id: uuid(153), status: "started", paid_at: iso(-H), created_at: iso(-2 * H), notes: null, service: { name: "Legal notice drafting" }, account: { display_name: "Meera (000002)" }, advocate: null }];
  if (p === "/admin/usage") return { callsSinceStart: { indianKanoon: 4, openrouter: 8, openrouter_embeddings: 12, qdrant: 20 } };
  if (p === "/admin/complaints") return { kpis: [{ label: "Open", value: 1 }], complaints: [{ id: uuid(154), ref: "CMP-2026-12345", title: "Late deliverable", description: "The draft was delayed by two days.", category: "deliverable_delay", status: "open", severity: "medium", owner: null, root_cause: null, corrective_action: null, created_at: iso(-H) }] };
  const a = m(/^\/admin\/analytics\/(\w+)$/);
  if (a) {
    const payloads = {
      founder: { briefing: "4 new requests in the last 7 days.", groups: [{ group: "Demand", metrics: [{ label: "Requests today", value: 1 }, { label: "Money", value: 1500, money: true }, { label: "CSAT", value: null, suffix: "/5" }] }] },
      fdemand: { daily: [0, 1, 2], dailyLabels: ["a", "b", "c"], charts: [{ title: "Requests by city", rows: [["Pune", 2]] }] },
      fservices: { rows: [{ service: "AI legal assistant", enquiries: 3, started: 3, completed: 2, abandoned: 1, conversion: 100, revenue: null, asp: null, csat: null }] },
      ffunnel: { stages: [{ stage: "Registered users", count: 10 }, { stage: "Made a request", count: 4 }], delivered: 1, note: "n" },
      frevenue: { kpis: [{ label: "GMV", value: 5000, money: true }], monthly: [{ month: "2026-10", gmv: 5000 }], byKind: [{ kind: "consultation", amount: 5000 }] },
      fcorp: { accounts: [{ name: "Verdanta Foods (abc123)", plan: null, seats: 2, seatLimit: 10, openMatters: 1, totalMatters: 2, legalSpend: 5000, outstanding: 0, lastActivity: iso(-H) }] },
      fadv: { rows: [{ name: "Rohan Iyer", status: "available", received: 3, accepted: 2, declined: 1, completed: 1, converted: 1, feesBilled: 5000, csat: 4.5, ratings: 2 }] },
      fai: { kpis: [{ label: "Assistant questions (90d)", value: 5 }], knowledgeBase: { enabled: true, points: 120 }, gaps: [{ topic: "tenancy", asked: 3, example: "deposit?" }] },
    };
    return { tab: a[1], refreshedAt: iso(0), payload: payloads[a[1]] || {} };
  }
  return undefined;
}
