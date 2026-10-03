import "dotenv/config";
import { pathToFileURL } from "url";
import { getSupabase } from "../config/db.js";

const DEV_OTP_USER = { note: "All seeded users log in with their phone + the DEV_OTP from .env (default 000000)." };

let advocates_cache = [];

// Generic findOneAndUpdate-with-upsert equivalent: select by `match`, then update-or-
// insert. Doesn't depend on a DB-level unique constraint on `match`'s columns (several
// of the original Mongo upsert keys, e.g. matter title, aren't actually unique) — this
// mirrors Mongoose's findOneAndUpdate(filter, ..., {upsert:true}) semantics directly.
async function upsertOne(table, match, values) {
  const supabase = getSupabase();
  let query = supabase.from(table).select("*");
  for (const [k, v] of Object.entries(match)) query = query.eq(k, v);
  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { data, error } = await supabase.from(table).update(values).eq("id", existing.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from(table)
    .insert({ ...match, ...values })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Mongo's deleteMany({matchColumn: matchValue}) + insertMany([...]) idempotent-replace pattern.
async function replaceChildren(table, matchColumn, matchValue, rows) {
  const supabase = getSupabase();
  const { error: deleteError } = await supabase.from(table).delete().eq(matchColumn, matchValue);
  if (deleteError) throw deleteError;
  if (rows.length === 0) return [];
  const { data, error } = await supabase.from(table).insert(rows).select();
  if (error) throw error;
  return data;
}

async function syncAdvocateRelations(advocateId, { practiceAreaIds, languages, consultationModes, jurisdictions }) {
  await replaceChildren(
    "advocate_practice_areas",
    "advocate_id",
    advocateId,
    practiceAreaIds.map((id) => ({ advocate_id: advocateId, practice_area_id: id }))
  );
  await replaceChildren(
    "advocate_languages",
    "advocate_id",
    advocateId,
    languages.map((language) => ({ advocate_id: advocateId, language }))
  );
  await replaceChildren(
    "advocate_consultation_modes",
    "advocate_id",
    advocateId,
    consultationModes.map((mode) => ({ advocate_id: advocateId, mode }))
  );
  await replaceChildren(
    "advocate_jurisdictions",
    "advocate_id",
    advocateId,
    jurisdictions.map((j) => ({ advocate_id: advocateId, state: j.state, forum: j.forum }))
  );
}

async function seedPracticeAreasAndSituations() {
  const areaNames = [
    "Criminal defence", "Litigation & notices", "Property & tenancy", "Family",
    "Employment", "Motor accident & insurance", "Consumer", "Cyber & online fraud",
    "Immigration", "Contract & commercial recovery", "Trademark & IP", "Tax & banking", "General advisory",
  ];
  const areas = {};
  for (const name of areaNames) {
    areas[name] = await upsertOne("practice_areas", { name }, { name });
  }

  const situations = [
    ["Police called on me / questioning", "पुलिस ने पूछताछ की", "Criminal defence"],
    ["I've been arrested or detained", "मुझे गिरफ्तार किया गया", "Criminal defence"],
    ["I received a legal notice", "मुझे कानूनी नोटिस मिला", "Litigation & notices"],
    ["Landlord / tenant dispute", "मकान मालिक-किरायेदार विवाद", "Property & tenancy"],
    ["Divorce or custody matter", "तलाक या हिरासत", "Family"],
    ["Fired or workplace dispute", "नौकरी से निकाला गया", "Employment"],
    ["Road accident / insurance claim", "सड़क दुर्घटना दावा", "Motor accident & insurance"],
    ["Defective product / service", "दोषपूर्ण उत्पाद", "Consumer"],
    ["Online fraud / cybercrime", "ऑनलाइन धोखाधड़ी", "Cyber & online fraud"],
    ["Visa / immigration issue", "वीज़ा समस्या", "Immigration"],
    ["Vendor won't pay / contract breach", "अनुबंध उल्लंघन", "Contract & commercial recovery"],
    ["Trademark or IP concern", "ट्रेडमार्क समस्या", "Trademark & IP"],
    ["Tax notice or banking dispute", "कर सूचना", "Tax & banking"],
    ["Not sure / general advice", "सामान्य सलाह", "General advisory"],
  ];
  for (const [en, hi, area] of situations) {
    await upsertOne(
      "situations",
      { label_en: en },
      { label_en: en, label_hi: hi, mapped_practice_area_id: areas[area].id, urgency_default: "week" }
    );
  }
  return areas;
}

async function seedAdvocates(areas) {
  const LAWYERS = [
    { phone: "+919820000001", name: "Rohan Iyer", area: "Contract & commercial recovery", subs: ["Vendor recovery", "B2B disputes"], city: "Bengaluru", years: 11, forums: ["City Civil Court", "Commercial Court"], langs: ["en", "hi", "kn"], modes: ["video", "phone", "in_person"], instantFee: 2500, scheduledFee: 3200, acceptsUrgent: true },
    { phone: "+919820000002", name: "Aparna Kulkarni", area: "Criminal defence", subs: ["Bail", "Arrest defence"], city: "Mumbai", years: 14, forums: ["Sessions Court", "High Court"], langs: ["en", "hi", "mr"], modes: ["video", "phone"], instantFee: 3000, scheduledFee: 4200, acceptsUrgent: true },
    { phone: "+919820000003", name: "Meenal Deshpande", area: "Family", subs: ["Divorce", "Custody"], city: "Mumbai", years: 9, forums: ["Family Court"], langs: ["en", "hi", "mr"], modes: ["video", "in_person"], instantFee: 2200, scheduledFee: 3000, acceptsUrgent: false },
    { phone: "+919820000004", name: "Arvind Menon", area: "Property & tenancy", subs: ["Eviction", "Title disputes"], city: "Bengaluru", years: 16, forums: ["City Civil Court"], langs: ["en", "kn"], modes: ["video", "phone", "in_person"], instantFee: 2800, scheduledFee: 3600, acceptsUrgent: false },
    { phone: "+919820000005", name: "Harpreet Singh", area: "Employment", subs: ["Wrongful termination", "Non-compete"], city: "Delhi NCR", years: 8, forums: ["Labour Court", "High Court"], langs: ["en", "hi"], modes: ["video", "phone", "chat"], instantFee: 2400, scheduledFee: 3100, acceptsUrgent: true },
    { phone: "+919820000006", name: "Nisha Reddy", area: "Consumer", subs: ["Product liability", "Service deficiency"], city: "Bengaluru", years: 6, forums: ["Consumer Forum"], langs: ["en", "hi", "te"], modes: ["video", "chat"], instantFee: 1800, scheduledFee: 2400, acceptsUrgent: false },
    { phone: "+919820000007", name: "Devika Nair", area: "Trademark & IP", subs: ["Trademark filing", "Infringement"], city: "Delhi NCR", years: 10, forums: ["IP Office", "High Court"], langs: ["en", "hi"], modes: ["video", "phone"], instantFee: 2600, scheduledFee: 3400, acceptsUrgent: false },
    { phone: "+919820000008", name: "Sanjay Bhatt", area: "Tax & banking", subs: ["GST notices", "Banking recovery"], city: "Mumbai", years: 13, forums: ["Tribunal", "High Court"], langs: ["en", "hi"], modes: ["video", "phone", "in_person"], instantFee: 2900, scheduledFee: 3800, acceptsUrgent: false },
  ];

  const advocates = [];
  for (const l of LAWYERS) {
    const phone = l.phone;
    const user = await upsertOne(
      "users",
      { phone },
      { phone, full_name: `Adv. ${l.name}`, role: "advocate", city: l.city, kyc_status: "verified" }
    );
    const advocate = await upsertOne(
      "advocates",
      { user_id: user.id },
      {
        user_id: user.id,
        bar_council: `Bar Council of ${l.city.includes("Delhi") ? "Delhi" : l.city.includes("Mumbai") ? "Maharashtra & Goa" : "Karnataka"}`,
        enrolment_number: `${l.city.slice(0, 2).toUpperCase()}/${1000 + advocates.length}/${2010 + (advocates.length % 10)}`,
        enrolment_year: 2010 + (advocates.length % 10),
        verification_status: "verified",
        sub_specialisations: l.subs,
        years_of_practice: l.years,
        education: ["National Law School", "Bar Council enrolled advocate"],
        relevant_experience: [
          `Represented clients in ${l.subs[0].toLowerCase()} matters before ${l.forums[0]}.`,
          `Advised on ${l.subs[1]?.toLowerCase() || l.subs[0].toLowerCase()} for individual and corporate clients.`,
          `${l.years} years of continuous practice in ${l.area.toLowerCase()}.`,
        ],
        instant_fee: l.instantFee,
        scheduled_fee: l.scheduledFee,
        availability_state: "available",
        accepts_urgent: l.acceptsUrgent,
        chamber_address: `Chamber ${100 + advocates.length}, ${l.city} District Court Complex`,
        city: l.city,
        keywords: [l.area.toLowerCase(), ...l.subs.map((s) => s.toLowerCase())],
      }
    );
    await syncAdvocateRelations(advocate.id, {
      practiceAreaIds: [areas[l.area].id],
      languages: l.langs,
      consultationModes: l.modes,
      jurisdictions: l.forums.map((forum) => ({ state: l.city, forum })),
    });
    advocates.push(advocate);
  }
  return advocates;
}

async function seedClientsAndAccounts() {
  const meera = await upsertOne(
    "users",
    { phone: "+919811100001" },
    { phone: "+919811100001", full_name: "Meera Raghavan", role: "client", city: "Bengaluru", state: "Karnataka", kyc_status: "verified" }
  );
  const individualAccount = await upsertOne("accounts", { display_name: "Meera Raghavan" }, { type: "individual", display_name: "Meera Raghavan" });
  await upsertOne(
    "account_members",
    { account_id: individualAccount.id, user_id: meera.id },
    { account_id: individualAccount.id, user_id: meera.id, role: "owner", accepted_at: new Date().toISOString() }
  );

  const vfOwner = await upsertOne(
    "users",
    { phone: "+919811100002" },
    { phone: "+919811100002", full_name: "Ananya Verma", role: "client", city: "Bengaluru", state: "Karnataka", kyc_status: "verified" }
  );
  const businessAccount = await upsertOne(
    "accounts",
    { display_name: "Verdanta Foods" },
    { type: "business", display_name: "Verdanta Foods", gstin: "29ABCDE1234F1Z5", billing_address: "Whitefield, Bengaluru", seat_limit: 10 }
  );
  await upsertOne(
    "account_members",
    { account_id: businessAccount.id, user_id: vfOwner.id },
    { account_id: businessAccount.id, user_id: vfOwner.id, role: "owner", accepted_at: new Date().toISOString() }
  );

  const admin = await upsertOne(
    "users",
    { phone: "+919811100003" },
    { phone: "+919811100003", full_name: "Priya Ops (Trust & Verification)", role: "admin", kyc_status: "verified" }
  );
  const founder = await upsertOne(
    "users",
    { phone: "+919811100004" },
    { phone: "+919811100004", full_name: "Founder", role: "founder", kyc_status: "verified" }
  );

  return { meera, individualAccount, vfOwner, businessAccount, admin, founder };
}

async function seedServices(areas, advocates) {
  const SERVICES = [
    ["Notices", "Legal notice drafting", 1499, 0, 3, "A demand or cease-and-desist notice drafted and reviewed by a verified advocate.", advocates[0]],
    ["Agreements", "Agreement review", 1999, 0, 2, "Line-by-line review of an existing contract against a balanced baseline.", advocates[0]],
    ["Agreements", "Rental agreement drafting", 999, 200, 1, "State-compliant rental agreement with e-stamp support.", advocates[3]],
    ["Agreements", "Employment agreement drafting", 1499, 0, 2, "Offer letter + employment agreement with statutory clauses.", advocates[4]],
    ["IP", "Trademark search & filing", 4999, 4500, 20, "Search, class selection and filing with the Trademark Registry.", advocates[6]],
    ["Consumer", "Consumer complaint filing", 2499, 0, 5, "Complaint drafted and filed before the Consumer Forum.", advocates[5]],
    ["Notices", "Cheque-bounce notice (S.138)", 1299, 0, 2, "Statutory demand notice under Section 138, NI Act.", advocates[0]],
    ["Corporate", "Startup incorporation", 5999, 4999, 10, "Private limited company incorporation with MoA/AoA.", advocates[0]],
    ["Compliance", "Privacy policy drafting", 1999, 0, 3, "Website/app privacy policy compliant with the DPDP Act.", advocates[6]],
    ["Family", "Will drafting", 2999, 0, 5, "Legally valid will drafted with witness guidance.", advocates[2]],
    ["Family", "Divorce consultation", 1500, 0, 1, "Initial consultation on mutual consent or contested divorce.", advocates[2]],
    ["Property", "Property document review", 2499, 0, 4, "Title and encumbrance review before purchase.", advocates[3]],
  ];
  const created = [];
  for (const [category, name, fee, gov, days, blurb, advocate] of SERVICES) {
    const svc = await upsertOne(
      "services",
      { name },
      {
        category, name, description: blurb, professional_fee: fee, government_fee: gov, timeline_days: days,
        includes: ["Initial review", "One round of revisions", "Final delivery"],
        required_documents: ["Government ID", "Relevant existing documents"],
        deliverables: ["Signed PDF", "Editable draft"],
        default_advocate_id: advocate.id,
      }
    );
    created.push(svc);
  }
  return created;
}

async function seedMatters({ individualAccount, businessAccount, meera, vfOwner }, advocates) {
  const specs = [
    { account: businessAccount, advocate: advocates[0], title: "Vendor recovery — Northline Distribution", forum: "Bengaluru Commercial Court", stage: "action_in_progress", nextAction: "File rejoinder to vendor's reply" },
    { account: businessAccount, advocate: advocates[6], title: "Trademark opposition — house brand", forum: "Trademark Registry", stage: "consultation", nextAction: "Advocate to file counter-statement" },
    { account: individualAccount, advocate: advocates[3], title: "Tenant eviction notice response", forum: "Bengaluru City Civil Court", stage: "lawyer_matched", nextAction: "Schedule first consultation" },
    { account: individualAccount, advocate: advocates[5], title: "Defective appliance consumer complaint", forum: "Bengaluru Consumer Forum", stage: "resolution", nextAction: "Awaiting forum order" },
    { account: businessAccount, advocate: advocates[7], title: "GST demand notice response", forum: "GST Appellate Tribunal", stage: "engagement_confirmed", nextAction: "Submit reply within statutory deadline" },
  ];

  const matters = [];
  let seq = 8801;
  for (const spec of specs) {
    const matter = await upsertOne(
      "matters",
      { title: spec.title },
      {
        reference: `SM-BLR-2026-${seq++}`,
        account_id: spec.account.id,
        advocate_id: spec.advocate.id,
        title: spec.title,
        forum: spec.forum,
        stage: spec.stage,
        next_action: spec.nextAction,
        opened_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        engaged_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
      }
    );
    matters.push(matter);

    await replaceChildren("timeline_events", "matter_id", matter.id, [
      { matter_id: matter.id, type: "intake", title: "Matter opened", body: "Intake routed and advocate matched.", actor_type: "system", occurred_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
      { matter_id: matter.id, type: "engagement", title: "Engagement confirmed", body: "Fee proposal accepted by client.", actor_type: "advocate", actor_id: spec.advocate.id, occurred_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString() },
      { matter_id: matter.id, type: "update", title: spec.nextAction, body: "Advocate is preparing the next filing.", actor_type: "advocate", actor_id: spec.advocate.id, occurred_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() },
    ]);

    await replaceChildren("tasks", "matter_id", matter.id, [
      { matter_id: matter.id, label: "Upload supporting documents", owner_type: "client", due_at: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString() },
      { matter_id: matter.id, label: "Review and sign engagement letter", owner_type: "client", due_at: new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString(), is_statutory_deadline: false },
    ]);

    const hearingRows =
      spec.stage === "action_in_progress" || spec.stage === "engagement_confirmed"
        ? [{ matter_id: matter.id, forum: spec.forum, court_hall: "Hall 4", listed_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(), purpose: "Next hearing" }]
        : [];
    await replaceChildren("hearings", "matter_id", matter.id, hearingRows);

    await replaceChildren("matter_access_grants", "matter_id", matter.id, [
      {
        matter_id: matter.id,
        subject_id: spec.advocate.id,
        subject_type: "advocate",
        subject_name: "Adv. matched to matter",
        subject_role: "Engaged advocate",
        scope: ["documents", "messages", "tasks", "fees"],
        granted_at: new Date().toISOString(),
      },
    ]);

    const ownerUserId = spec.account.id === individualAccount.id ? meera.id : vfOwner.id;

    const supabase = getSupabase();
    const { error: deleteThreadError } = await supabase.from("message_threads").delete().eq("matter_id", matter.id);
    if (deleteThreadError) throw deleteThreadError;
    const { data: thread, error: threadError } = await supabase.from("message_threads").insert({ matter_id: matter.id }).select().single();
    if (threadError) throw threadError;
    const { error: participantsError } = await supabase.from("thread_participants").insert([
      { thread_id: thread.id, participant_id: ownerUserId },
      { thread_id: thread.id, participant_id: spec.advocate.user_id },
    ]);
    if (participantsError) throw participantsError;

    await replaceChildren("messages", "thread_id", thread.id, [
      {
        thread_id: thread.id,
        sender_id: spec.advocate.user_id,
        body: `Hello, I've reviewed the matter and ${spec.nextAction.toLowerCase()}. I'll update you once it's done.`,
        sent_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      },
      {
        thread_id: thread.id,
        sender_id: ownerUserId,
        body: "Thank you, please let me know if you need anything from my side.",
        sent_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
      },
    ]);
  }
  return matters;
}

async function seedDraftingTemplates() {
  const rental = await upsertOne(
    "doc_templates",
    { name: "Rental Agreement" },
    {
      category: "rental", name: "Rental Agreement", jurisdiction: "Karnataka", version: 1, blurb: "An 11-month leave-and-license agreement.", pages: 4,
      base_sections: [
        { key: "parties", heading: "Parties", bodyTemplate: "This agreement is made between {{landlordName}} (\"Landlord\") and {{tenantName}} (\"Tenant\") for the premises at {{propertyAddress}}." },
        { key: "term", heading: "Term & Rent", bodyTemplate: "The term is 11 months from {{startDate}} at a monthly rent of Rs. {{monthlyRent}}, payable by the 5th of each month." },
      ],
      field_schema: [
        { key: "landlordName", label: "Landlord name", placeholder: "Landlord Name", required: true },
        { key: "tenantName", label: "Tenant name", placeholder: "Tenant Name", required: true },
        { key: "propertyAddress", label: "Property address", placeholder: "Property Address", wide: true, required: true },
        { key: "startDate", label: "Start date", placeholder: "1 October 2026" },
        { key: "monthlyRent", label: "Monthly rent", placeholder: "25,000" },
      ],
      stamp_duty_note: "Karnataka: stamp duty is 0.5% of average annual rent, capped as per the Karnataka Stamp Act.",
      draft_fee: 0, review_fee: 1499,
    }
  );
  await replaceChildren("clause_library", "template_id", rental.id, [
    { template_id: rental.id, title: "Security deposit — 10 months' rent", body_template: "The Tenant shall pay a refundable security deposit of Rs. {{securityDeposit}} adjustable against damages.", rationale_note: "Higher deposits shift risk to the tenant; the ordinary Bengaluru market position is 2-3 months for residential.", disposition: "review_advised", risk_side: "client", favors: "drafter", requires_fields: ["securityDeposit"] },
    { template_id: rental.id, title: "Lock-in period — 6 months", body_template: "Neither party may terminate this agreement before {{lockInMonths}} months from the start date.", rationale_note: "A lock-in protects the landlord's occupancy planning; balanced practice caps it at 6 months.", disposition: "recommended", risk_side: "mutual", favors: "balanced" },
    { template_id: rental.id, title: "Maintenance charges borne by tenant", body_template: "The Tenant shall bear monthly maintenance/society charges in addition to rent.", rationale_note: "Common in Bengaluru apartment leases; shifts a routine cost to the tenant.", disposition: "optional", risk_side: "client", favors: "drafter" },
  ]);

  const employment = await upsertOne(
    "doc_templates",
    { name: "Employment Agreement" },
    {
      category: "employment", name: "Employment Agreement", jurisdiction: "Karnataka", version: 1, blurb: "Standard employment agreement with statutory clauses.", pages: 6,
      base_sections: [
        { key: "parties", heading: "Parties & Role", bodyTemplate: "This agreement is between {{employerName}} and {{employeeName}}, appointed as {{designation}} effective {{startDate}}." },
        { key: "compensation", heading: "Compensation", bodyTemplate: "The Employee shall be paid a gross annual compensation of Rs. {{annualCTC}}, payable monthly." },
      ],
      field_schema: [
        { key: "employerName", label: "Employer name", placeholder: "Employer Pvt Ltd", required: true },
        { key: "employeeName", label: "Employee name", placeholder: "Employee Name", required: true },
        { key: "designation", label: "Designation", placeholder: "Software Engineer" },
        { key: "startDate", label: "Start date", placeholder: "1 November 2026" },
        { key: "annualCTC", label: "Annual CTC", placeholder: "12,00,000" },
      ],
      stamp_duty_note: "Karnataka: nominal stamp duty on employment agreements.",
      draft_fee: 0, review_fee: 1499,
    }
  );
  await replaceChildren("clause_library", "template_id", employment.id, [
    { template_id: employment.id, title: "Post-resignation non-compete (12 months)", body_template: "The Employee shall not join a competing business for 12 months after resignation within {{restrictedTerritory}}.", rationale_note: "Section 27, Indian Contract Act 1872 renders post-employment restraints void in India — this clause is not enforceable as drafted and is included only where the employer insists.", disposition: "review_advised", risk_side: "client", favors: "drafter", requires_fields: ["restrictedTerritory"] },
    { template_id: employment.id, title: "Confidentiality — indefinite", body_template: "The Employee shall keep confidential information secret indefinitely, including after termination.", rationale_note: "Confidentiality obligations (as opposed to non-competes) are enforceable indefinitely and are standard.", disposition: "recommended", risk_side: "mutual", favors: "balanced" },
    { template_id: employment.id, title: "Non-solicitation of clients (12 months)", body_template: "The Employee shall not solicit the Employer's clients for 12 months after termination.", rationale_note: "Narrower than a non-compete and more likely to be enforced as a reasonable restraint on trade secrets/goodwill.", disposition: "recommended", risk_side: "mutual", favors: "balanced" },
  ]);

  const nda = await upsertOne(
    "doc_templates",
    { name: "Mutual NDA" },
    {
      category: "nda", name: "Mutual NDA", jurisdiction: "India", version: 1, blurb: "A mutual non-disclosure agreement for commercial discussions.", pages: 3,
      base_sections: [
        { key: "parties", heading: "Parties", bodyTemplate: "This mutual non-disclosure agreement is between {{partyA}} and {{partyB}}, effective {{effectiveDate}}." },
        { key: "purpose", heading: "Purpose", bodyTemplate: "The parties wish to exchange confidential information for the purpose of {{purpose}}." },
      ],
      field_schema: [
        { key: "partyA", label: "Party A", placeholder: "Company A Pvt Ltd", required: true },
        { key: "partyB", label: "Party B", placeholder: "Company B Pvt Ltd", required: true },
        { key: "effectiveDate", label: "Effective date", placeholder: "1 October 2026" },
        { key: "purpose", label: "Purpose", placeholder: "evaluating a potential business relationship", wide: true },
      ],
      draft_fee: 0, review_fee: 1499,
    }
  );
  await replaceChildren("clause_library", "template_id", nda.id, [
    { template_id: nda.id, title: "Term — 3 years", body_template: "Confidentiality obligations survive for {{termYears}} years from disclosure.", rationale_note: "3 years is the common market position for commercial (non-trade-secret) NDAs.", disposition: "recommended", risk_side: "mutual", favors: "balanced" },
    { template_id: nda.id, title: "Unilateral carve-out for Party A", body_template: "Party A's obligations under this agreement are waived where disclosure is made to its affiliates.", rationale_note: "Favors Party A by narrowing only their obligations, not Party B's — a deviation from the mutual baseline.", disposition: "review_advised", risk_side: "counterparty", favors: "drafter" },
  ]);

  const notice = await upsertOne(
    "doc_templates",
    { name: "Demand Notice" },
    {
      category: "notice", name: "Demand Notice", jurisdiction: "India", version: 1, blurb: "A formal demand / cease-and-desist notice.", pages: 2,
      base_sections: [
        { key: "recipient", heading: "To", bodyTemplate: "To: {{recipientName}}, {{recipientAddress}}" },
        { key: "demand", heading: "Demand", bodyTemplate: "You are hereby called upon to {{demandAction}} within {{noticePeriodDays}} days of receipt of this notice, failing which our client shall be constrained to initiate appropriate legal proceedings without further notice." },
      ],
      field_schema: [
        { key: "recipientName", label: "Recipient name", placeholder: "Recipient Name", required: true },
        { key: "recipientAddress", label: "Recipient address", placeholder: "Recipient Address", wide: true },
        { key: "demandAction", label: "Demand", placeholder: "pay the outstanding amount of Rs. 1,00,000", wide: true, required: true },
        { key: "noticePeriodDays", label: "Notice period (days)", placeholder: "15" },
      ],
      draft_fee: 0, review_fee: 1499,
    }
  );
  await replaceChildren("clause_library", "template_id", notice.id, [
    { template_id: notice.id, title: "Reservation of rights", body_template: "This notice is issued without prejudice to any other right or remedy available to our client under law.", rationale_note: "Standard boilerplate protecting the sender's other legal options.", disposition: "recommended", risk_side: "mutual", favors: "balanced" },
  ]);

  return { rental, employment, nda, notice };
}

async function seedVidhiraCorpus() {
  const contractAct1872 = await upsertOne(
    "corpus_documents",
    { citation: "Indian Contract Act 1872, s.27" },
    { source: "bare_act", citation: "Indian Contract Act 1872, s.27", title: "Section 27 — Agreement in restraint of trade, void", act_name: "Indian Contract Act 1872", section_number: "27", treatment: "IN FORCE", canonical_url: "https://www.indiacode.nic.in" }
  );
  const golikari = await upsertOne(
    "corpus_documents",
    { citation: "Niranjan Shankar Golikari v. Century Spg. Mfg. Co. (1967) 2 SCR 378" },
    { source: "supreme_court", citation: "Niranjan Shankar Golikari v. Century Spg. Mfg. Co. (1967) 2 SCR 378", title: "Niranjan Shankar Golikari v. Century Spinning & Manufacturing Co.", court: "Supreme Court of India", decided_on: "1967-03-08", treatment: "GOOD LAW · FOLLOWED" }
  );
  const murgai = await upsertOne(
    "corpus_documents",
    { citation: "Superintendence Company of India v. Krishan Murgai (1981) 2 SCC 246" },
    { source: "supreme_court", citation: "Superintendence Company of India v. Krishan Murgai (1981) 2 SCC 246", title: "Superintendence Company of India v. Krishan Murgai", court: "Supreme Court of India", decided_on: "1980-08-06", treatment: "GOOD LAW · FOLLOWED" }
  );
  const percept = await upsertOne(
    "corpus_documents",
    { citation: "Percept D'Mark (India) Pvt Ltd v. Zaheer Khan (2006) 4 SCC 227" },
    { source: "supreme_court", citation: "Percept D'Mark (India) Pvt Ltd v. Zaheer Khan (2006) 4 SCC 227", title: "Percept D'Mark (India) Pvt Ltd v. Zaheer Khan", court: "Supreme Court of India", decided_on: "2006-02-20", treatment: "GOOD LAW · FOLLOWED" }
  );

  const docIds = [contractAct1872.id, golikari.id, murgai.id, percept.id];
  const supabase = getSupabase();
  const { error: deleteError } = await supabase.from("corpus_chunks").delete().in("document_id", docIds);
  if (deleteError) throw deleteError;
  const { error } = await supabase.from("corpus_chunks").insert([
    {
      document_id: contractAct1872.id, ordinal: 1, paragraph_class: "provision", section_label: "s.27",
      text: "Every agreement by which any one is restrained from exercising a lawful profession, trade or business of any kind, is to that extent void.",
      keywords: ["restraint", "trade", "void", "non-compete", "noncompete", "profession", "employment", "employer", "post-resignation", "resign", "resignation", "job", "quit", "s.27", "section", "27"],
      deep_link: "https://www.indiacode.nic.in/contract-act-1872#s27",
    },
    {
      document_id: golikari.id, ordinal: 1, paragraph_class: "holding", section_label: "para 24",
      text: "A restrictive covenant operative during the term of employment is generally valid, whereas a covenant that restrains the employee's freedom after the termination of employment is void under Section 27, unless it falls within a recognised exception.",
      keywords: ["restraint", "employment", "employer", "non-compete", "noncompete", "post-resignation", "resign", "resignation", "job", "during", "term", "exclusivity", "s.27"],
      deep_link: "https://indiankanoon.org/doc/golikari",
    },
    {
      document_id: murgai.id, ordinal: 1, paragraph_class: "holding", section_label: "para 16",
      text: "A negative covenant restraining an employee from competing after the termination of employment is void under Section 27 of the Indian Contract Act, and this is so even where the covenant is limited as to time, place or space.",
      keywords: ["negative", "covenant", "non-compete", "noncompete", "post-resignation", "resign", "resignation", "job", "employer", "employment", "void", "s.27"],
      deep_link: "https://indiankanoon.org/doc/murgai",
    },
    {
      document_id: percept.id, ordinal: 1, paragraph_class: "holding", section_label: "para 45",
      text: "Section 27 makes no distinction between a partial and a total restraint of trade — a restraint operating after the term of the contract is void even if reasonable, save the exceptions expressly carved out by the Act.",
      keywords: ["section 27", "partial", "total", "restraint", "reasonable", "non-compete", "post-resignation", "resign", "employer", "job"],
      deep_link: "https://indiankanoon.org/doc/percept",
    },
    {
      document_id: golikari.id, ordinal: 2, paragraph_class: "petitioner_arguments", section_label: "para 9",
      text: "The employee argued that any restriction on future employment, however brief, offends the constitutional right to livelihood and must be struck down in its entirety.",
      keywords: ["employee", "argued", "livelihood", "constitutional"],
      deep_link: "https://indiankanoon.org/doc/golikari-arg",
    },
  ]);
  if (error) throw error;
}

async function seedPackRuleset() {
  await upsertOne(
    "pack_rulesets",
    { category_id: "food", version: 1 },
    {
      category_id: "food", category_name: "Packaged Food", version: 1, effective_from: "2025-01-01",
      declarations: [
        { key: "net_quantity", ruleRef: "LM(PC) Rules 2011, r.6", required: true, formatPattern: "\\d+\\s?(g|kg|ml|l)" },
        { key: "mrp", ruleRef: "LM(PC) Rules 2011, r.18", required: true, formatPattern: "(Rs\\.?|₹)\\s?\\d+" },
        { key: "fssai_license", ruleRef: "FSSAI Act 2006, s.31", required: true, formatPattern: "\\d{14}" },
        { key: "best_before", ruleRef: "FSS (Packaging & Labelling) Regs 2011", required: true, formatPattern: "\\d{2}/\\d{4}" },
      ],
      claim_rules: [
        { pattern: "100% natural", verdict: "needs_substantiation", ruleRef: "CCPA Guidelines 2022, s.4", substantiationRequired: true, saferPhrasing: "Made with natural ingredients", saferRationale: "\"100% natural\" is rarely defensible for processed food; a qualified claim survives scrutiny." },
        { pattern: "no side effects", verdict: "high_risk", ruleRef: "ASCI Code, Ch. III", substantiationRequired: true, saferPhrasing: "" },
      ],
    }
  );
}

async function seedAnalyticsSnapshots(advocates) {
  await upsertOne(
    "analytics_snapshots",
    { tab: "founder" },
    {
      tab: "founder", refreshed_at: new Date().toISOString(),
      payload: {
        briefing: "Requests grew 8% week-on-week, led by Contract & commercial recovery. Insufficient-authority responses on Vidhira ticked up on Karnataka rent-law questions — flagged for corpus expansion. Two corporate accounts (Kesar Naturals, Bluecrest Devices) are trending into the WATCH band on renewal risk.",
        ask: [
          { q: "How many urgent consultations did we handle this month?", a: "312 urgent consultations were completed this month, with a median response time of 3m 40s.", f: [{ k: "Urgent consultations", v: "312" }] },
          { q: "What is our platform revenue this month?", a: "Net platform revenue this month is Rs. 18.4 lakh, a 6% increase over last month.", f: [{ k: "Net platform revenue", v: "₹18.4L" }] },
          { q: "How many advocates are verified?", a: "148 advocates are currently verified and listable.", f: [{ k: "Verified advocates", v: "148" }] },
        ],
        kpiGroups: [
          { group: "Demand", metrics: [{ label: "Requests today", value: 214, delta: [3, 8, 12, 15] }, { label: "Urgent consultations", value: 312, delta: [1, 4, 9, 6] }, { label: "Research questions", value: 1840, delta: [5, 11, 20, 18] }, { label: "Insufficient-authority count", value: 62, delta: [10, 15, 22, 9], invert: true }] },
          { group: "Users and supply", metrics: [{ label: "Registered users", value: 24810, delta: [1, 3, 9, 22] }, { label: "Verified advocates", value: 148, delta: [0, 2, 5, 30] }, { label: "Open matters", value: 612, delta: [2, 6, 10, 14] }] },
          { group: "Product usage", metrics: [{ label: "Contract reviews", value: 96, delta: [4, 9, 15, 20] }, { label: "Documents drafted", value: 340, delta: [6, 12, 19, 25] }, { label: "Pack scans", value: 58, delta: [8, 14, 21, 30] }] },
          { group: "Money and satisfaction", metrics: [{ label: "Net platform revenue", value: "₹18.4L", delta: [2, 6, 11, 19] }, { label: "Pending payments", value: "₹3.1L", delta: [5, 8, 12, 4], invert: true }, { label: "CSAT", value: "4.6/5", delta: [0, 1, 2, 3] }] },
        ],
      },
    }
  );

  await upsertOne(
    "analytics_snapshots",
    { tab: "fdemand" },
    { tab: "fdemand", refreshed_at: new Date().toISOString(), payload: { dailyRequests: Array.from({ length: 30 }, (_, i) => 150 + Math.round(40 * Math.sin(i / 4)) + i) } }
  );

  await upsertOne(
    "analytics_snapshots",
    { tab: "fservices" },
    {
      tab: "fservices", refreshed_at: new Date().toISOString(),
      payload: {
        rows: [
          { service: "Legal research", enquiries: 2400, started: 2400, completed: 2210, abandoned: 190, conversionPct: 92, revenue: 0, asp: 0, avgTimeHrs: 0.1, csat: 4.7 },
          { service: "Advocate consultations", enquiries: 1800, started: 1500, completed: 1380, abandoned: 120, conversionPct: 77, revenue: 3800000, asp: 2753, avgTimeHrs: 1, csat: 4.5 },
          { service: "Contract drafting", enquiries: 620, started: 540, completed: 480, abandoned: 60, conversionPct: 77, revenue: 900000, asp: 1875, avgTimeHrs: 24, csat: 4.4 },
          { service: "Contract review", enquiries: 340, started: 300, completed: 270, abandoned: 30, conversionPct: 79, revenue: 540000, asp: 2000, avgTimeHrs: 12, csat: 4.3 },
          { service: "Pack compliance", enquiries: 210, started: 190, completed: 165, abandoned: 25, conversionPct: 79, revenue: 990000, asp: 6000, avgTimeHrs: 6, csat: 4.6 },
        ],
      },
    }
  );

  await upsertOne(
    "analytics_snapshots",
    { tab: "ffunnel" },
    {
      tab: "ffunnel", refreshed_at: new Date().toISOString(),
      payload: {
        stages: [
          { stage: "Visitors", count: 92000, dropPct: 0 },
          { stage: "Registered users", count: 24800, dropPct: 73, reasons: [{ reason: "OTP-screen abandonment", sharePct: 40, evidence: "40% of drop-offs exit within 10s of the OTP screen loading." }] },
          { stage: "Service selected", count: 15200, dropPct: 39 },
          { stage: "Payment started", count: 11000, dropPct: 28 },
          { stage: "Payment completed", count: 9600, dropPct: 13, reasons: [{ reason: "UPI collect timeouts", sharePct: 55, evidence: "55% of failed payments show a UPI collect request expiring unactioned." }] },
          { stage: "Service delivered", count: 9200, dropPct: 4 },
          { stage: "Repeat user", count: 2600, dropPct: 72 },
        ],
      },
    }
  );

  await upsertOne(
    "analytics_snapshots",
    { tab: "frevenue" },
    { tab: "frevenue", refreshed_at: new Date().toISOString(), payload: { gtv: 42000000, netPlatformRevenue: 1840000, takeRatePct: 12, advocatePayouts: 24000000, monthly: [12, 14, 13, 16, 18, 18.4] } }
  );

  await upsertOne(
    "analytics_snapshots",
    { tab: "fai" },
    { tab: "fai", refreshed_at: new Date().toISOString(), payload: { totalQuestions: 1840, answeredFullPct: 68, partialPct: 22, refusedCount: 0, insufficientAuthorityPct: 10 } }
  );
}

async function seedCorporateHealthAndComplaints(businessAccount) {
  await upsertOne(
    "corporate_account_health",
    { account_id: businessAccount.id, name: "Verdanta Foods" },
    {
      account_id: businessAccount.id, name: "Verdanta Foods", plan: "Business retainer", seats: 8, revenue_12mo: 1240000,
      renewal_date: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(), score: 82, band: "healthy",
      metric_users: 8, metric_contracts_uploaded: 34, metric_drafts_generated: 19, metric_pack_scans: 22, metric_open_matters: 2, metric_pending_approvals: 1, metric_compliance_alerts: 0, metric_subscription_used_pct: 61,
      risk_narrative: "Healthy usage across drafting and pack compliance; renewal in 60 days with no red flags.",
    }
  );
  for (const [name, score, band, narrative] of [
    ["Kesar Naturals", 66, "watch", "Pack-scan usage dropped 40% this quarter and one compliance alert is unresolved — needs a check-in before renewal."],
    ["Northline Distribution", 78, "healthy", "Steady contract-review usage; no action needed."],
    ["Auroma Fragrances", 71, "watch", "Seat utilisation is low relative to plan size — a downsell risk if usage doesn't pick up."],
    ["Bluecrest Devices", 54, "at_risk", "No logins in 21 days and a pending compliance alert — needs a founder call this week, not a renewal email."],
  ]) {
    await upsertOne(
      "corporate_account_health",
      { name },
      {
        account_id: businessAccount.id, name, plan: "Business retainer", seats: 5, revenue_12mo: 600000,
        renewal_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(), score, band,
        metric_users: 5, metric_contracts_uploaded: 10, metric_drafts_generated: 6, metric_pack_scans: 4, metric_open_matters: 1, metric_pending_approvals: 1,
        metric_compliance_alerts: band === "healthy" ? 0 : 1, metric_subscription_used_pct: 40,
        risk_narrative: narrative,
      }
    );
  }

  await upsertOne(
    "complaints",
    { ref: "CMP-2026-0091" },
    { ref: "CMP-2026-0091", title: "Contract review delivered 2 days late", category: "deliverable_delay", status: "resolved", severity: "medium", service_involved: "Contract review", owner: "Ops", root_cause: "Advocate overload during a public holiday week", corrective_action: "Added a backup reviewer to the rotation", refund_amount: 500 }
  );
  await upsertOne(
    "complaints",
    { ref: "CMP-2026-0102" },
    { ref: "CMP-2026-0102", title: "Vidhira cited an amended provision", category: "citation_accuracy", status: "open", severity: "high", service_involved: "Legal research", owner: "Trust & Verification", root_cause: "Corpus lag on a recent amendment", corrective_action: "Re-indexing affected acts", refund_amount: 0 }
  );

  await upsertOne(
    "knowledge_gaps",
    { topic: "Karnataka Rent Act coverage" },
    { topic: "Karnataka Rent Act coverage", asked_count: 71, missing: "Karnataka Rent Act not indexed", suggested_source: "Karnataka Rent Act bare text + amendments", priority: "index_first" }
  );

  for (const advocate of advocates_cache) {
    await upsertOne(
      "advocate_performance_rows",
      { advocate_id: advocate.id, period: "last_30_days" },
      { advocate_id: advocate.id, period: "last_30_days", received: 40, accepted: 34, declined: 6, response_minutes: 8, completed: 30, converted: 22, fees_billed: 180000, csat: 4.6 }
    );
  }
}

async function seedGuidesFirmsAndQna(businessAccount, advocates) {
  await upsertOne(
    "guides",
    { title: "Your rights during a police stop" },
    { tag: "Criminal defence", title: "Your rights during a police stop", body: "You have the right to know the grounds of arrest and to inform a person of your choice...", read_minutes: 4 }
  );
  await upsertOne(
    "guides",
    { title: "Notice period basics under Indian employment law" },
    { tag: "Employment", title: "Notice period basics under Indian employment law", body: "Notice periods are contractual, not statutory, for most private employment...", read_minutes: 5 }
  );

  await upsertOne(
    "firms",
    { name: "Iyer & Associates" },
    { name: "Iyer & Associates", city: "Bengaluru", practice_areas: ["Contract & commercial recovery"], advocate_ids: [advocates[0].id], bench_strength: 6, empanelment_note: "Empanelled with 3 corporate accounts", starting_fee: 3000, verification_status: "verified" }
  );

  const q1 = await upsertOne(
    "public_questions",
    { body: "Can my employer enforce a 1-year non-compete after I resign?" },
    { author_account_id: businessAccount.id, body: "Can my employer enforce a 1-year non-compete after I resign?", practice_area: "Employment", status: "published", view_count: 240 }
  );
  await upsertOne(
    "public_answers",
    { question_id: q1.id },
    { question_id: q1.id, advocate_id: advocates[4].id, body: "Generally no — Section 27 of the Indian Contract Act voids post-employment restraints, with narrow exceptions.", published_at: new Date().toISOString(), helpful_count: 58, moderation_state: "published" }
  );
}

// Exported so the server can auto-seed an empty database on boot. Safe to call multiple
// times against a persistent Supabase project — every write here goes through upsertOne.
export async function seedAll() {
  console.log("Seeding database...");

  const areas = await seedPracticeAreasAndSituations();
  const advocates = await seedAdvocates(areas);
  advocates_cache = advocates;
  const people = await seedClientsAndAccounts();
  await seedServices(areas, advocates);
  await seedMatters(people, advocates);
  await seedDraftingTemplates();
  await seedVidhiraCorpus();
  await seedPackRuleset();
  await seedAnalyticsSnapshots(advocates);
  await seedCorporateHealthAndComplaints(people.businessAccount);
  await seedGuidesFirmsAndQna(people.businessAccount, advocates);

  // A pending verification case so the admin queue isn't empty.
  const pendingAdvocateUser = await upsertOne(
    "users",
    { phone: "+919899990000" },
    { phone: "+919899990000", full_name: "Adv. Kabir Chatterjee", role: "advocate" }
  );
  const pendingAdvocate = await upsertOne(
    "advocates",
    { user_id: pendingAdvocateUser.id },
    { user_id: pendingAdvocateUser.id, bar_council: "Bar Council of West Bengal", enrolment_number: "WB/9911/2015", enrolment_year: 2015, verification_status: "submitted", instant_fee: 2000, scheduled_fee: 2600, city: "Kolkata" }
  );
  await syncAdvocateRelations(pendingAdvocate.id, {
    practiceAreaIds: [areas["Litigation & notices"].id],
    languages: ["en", "hi", "bn"],
    consultationModes: ["video"],
    jurisdictions: [],
  });
  await upsertOne(
    "verification_cases",
    { advocate_id: pendingAdvocate.id },
    { advocate_id: pendingAdvocate.id, checks: [{ type: "bar_enrolment", status: "pending" }, { type: "photo_id", status: "pass" }, { type: "practice_proof", status: "pending" }], decision: "pending" }
  );

  console.log("Seed complete.");
  console.log(DEV_OTP_USER.note);
  console.log("Demo logins:");
  console.log("  Client (individual): +919811100001 — Meera Raghavan");
  console.log("  Client (business owner): +919811100002 — Ananya Verma, Verdanta Foods");
  console.log("  Advocate: +919820000001 — Adv. Rohan Iyer (verified)");
  console.log("  Admin (trust ops): +919811100003");
  console.log("  Founder: +919811100004");
}

// CLI entry point: `node src/seed/seed.js` / `npm run seed`.
// Only runs when this file is executed directly, not when seedAll is imported elsewhere.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedAll()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
