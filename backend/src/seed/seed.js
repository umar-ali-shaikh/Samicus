// Reference data only — the catalogues the product cannot work without (practice areas,
// the situation picker, document templates and their clause library). There is NO demo data:
// no fake advocates, clients, matters, messages, analytics or corpus. Everything else in the
// app is created by real users, admins and the RAG ingestion pipeline.
//
// Idempotent (upserts). Runs automatically on first boot against an empty database and via
// `npm run seed`.
import "dotenv/config";
import { pathToFileURL } from "url";
import { getSupabase } from "../config/db.js";

// Upsert by `match`: select, then update-or-insert. Doesn't depend on a DB-level unique
// constraint on `match`'s columns.
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

// Idempotent replace: delete every child row for the parent, then insert the new set.
async function replaceChildren(table, matchColumn, matchValue, rows) {
  const supabase = getSupabase();
  const { error: deleteError } = await supabase.from(table).delete().eq(matchColumn, matchValue);
  if (deleteError) throw deleteError;
  if (rows.length === 0) return [];
  const { data, error } = await supabase.from(table).insert(rows).select();
  if (error) throw error;
  return data;
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
      stamp_duty_note: "Stamp duty depends on the state and the value of the agreement — confirm the current rate with the state stamp office or an advocate before execution.",
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
      stamp_duty_note: "Stamp duty depends on the state and the value of the agreement — confirm the current rate with the state stamp office or an advocate before execution.",
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


export async function seedAll() {
  console.log("Seeding reference data (practice areas, situations, document templates)…");
  await seedPracticeAreasAndSituations();
  await seedDraftingTemplates();
  console.log("Reference data ready. No demo data was created.");
}

// `node src/seed/seed.js` (npm run seed)
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  seedAll()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
