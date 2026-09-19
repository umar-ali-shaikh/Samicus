import "dotenv/config";
import { pathToFileURL } from "url";
import { connectDB, disconnectDB } from "../config/db.js";
import {
  User, Account, AccountMember,
  PracticeArea, Situation, Advocate, VerificationCase,
  Service, Matter, TimelineEvent, Task, Hearing, Document,
  MessageThread, Message, MatterAccessGrant,
  DocTemplate, ClauseLibrary,
  CorpusDocument, CorpusChunk,
  PackRuleset,
  Guide, Firm, PublicQuestion, PublicAnswer,
  AnalyticsSnapshot, CorporateAccountHealth, AdvocatePerformanceRow, KnowledgeGap, Complaint,
} from "../models/index.js";

const DEV_OTP_USER = { note: "All seeded users log in with their phone + the DEV_OTP from .env (default 000000)." };

let advocates_cache = [];

async function seedPracticeAreasAndSituations() {
  const areaNames = [
    "Criminal defence", "Litigation & notices", "Property & tenancy", "Family",
    "Employment", "Motor accident & insurance", "Consumer", "Cyber & online fraud",
    "Immigration", "Contract & commercial recovery", "Trademark & IP", "Tax & banking", "General advisory",
  ];
  const areas = {};
  for (const name of areaNames) {
    areas[name] = await PracticeArea.findOneAndUpdate({ name }, { name }, { upsert: true, new: true });
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
    await Situation.findOneAndUpdate(
      { labelEn: en },
      { labelEn: en, labelHi: hi, mappedPracticeAreaId: areas[area]._id, urgencyDefault: "week" },
      { upsert: true }
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
    const user = await User.findOneAndUpdate(
      { phone },
      { phone, fullName: `Adv. ${l.name}`, role: "advocate", city: l.city, kycStatus: "verified" },
      { upsert: true, new: true }
    );
    const advocate = await Advocate.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        barCouncil: `Bar Council of ${l.city.includes("Delhi") ? "Delhi" : l.city.includes("Mumbai") ? "Maharashtra & Goa" : "Karnataka"}`,
        enrolmentNumber: `${l.city.slice(0, 2).toUpperCase()}/${1000 + advocates.length}/${2010 + (advocates.length % 10)}`,
        enrolmentYear: 2010 + (advocates.length % 10),
        verificationStatus: "verified",
        practiceAreas: [areas[l.area]._id],
        subSpecialisations: l.subs,
        jurisdictions: l.forums.map((forum) => ({ state: l.city, forum })),
        languages: l.langs,
        yearsOfPractice: l.years,
        education: ["National Law School", "Bar Council enrolled advocate"],
        relevantExperience: [
          `Represented clients in ${l.subs[0].toLowerCase()} matters before ${l.forums[0]}.`,
          `Advised on ${l.subs[1]?.toLowerCase() || l.subs[0].toLowerCase()} for individual and corporate clients.`,
          `${l.years} years of continuous practice in ${l.area.toLowerCase()}.`,
        ],
        consultationModes: l.modes,
        instantFee: l.instantFee,
        scheduledFee: l.scheduledFee,
        availabilityState: "available",
        acceptsUrgent: l.acceptsUrgent,
        chamberAddress: `Chamber ${100 + advocates.length}, ${l.city} District Court Complex`,
        city: l.city,
        keywords: [l.area.toLowerCase(), ...l.subs.map((s) => s.toLowerCase())],
      },
      { upsert: true, new: true }
    );
    advocates.push(advocate);
  }
  return advocates;
}

async function seedClientsAndAccounts() {
  const meera = await User.findOneAndUpdate(
    { phone: "+919811100001" },
    { phone: "+919811100001", fullName: "Meera Raghavan", role: "client", city: "Bengaluru", state: "Karnataka", kycStatus: "verified" },
    { upsert: true, new: true }
  );
  const individualAccount = await Account.findOneAndUpdate(
    { displayName: "Meera Raghavan" },
    { type: "individual", displayName: "Meera Raghavan" },
    { upsert: true, new: true }
  );
  await AccountMember.findOneAndUpdate(
    { accountId: individualAccount._id, userId: meera._id },
    { accountId: individualAccount._id, userId: meera._id, role: "owner", acceptedAt: new Date() },
    { upsert: true }
  );

  const vfOwner = await User.findOneAndUpdate(
    { phone: "+919811100002" },
    { phone: "+919811100002", fullName: "Ananya Verma", role: "client", city: "Bengaluru", state: "Karnataka", kycStatus: "verified" },
    { upsert: true, new: true }
  );
  const businessAccount = await Account.findOneAndUpdate(
    { displayName: "Verdanta Foods" },
    { type: "business", displayName: "Verdanta Foods", gstin: "29ABCDE1234F1Z5", billingAddress: "Whitefield, Bengaluru", seatLimit: 10 },
    { upsert: true, new: true }
  );
  await AccountMember.findOneAndUpdate(
    { accountId: businessAccount._id, userId: vfOwner._id },
    { accountId: businessAccount._id, userId: vfOwner._id, role: "owner", acceptedAt: new Date() },
    { upsert: true }
  );

  const admin = await User.findOneAndUpdate(
    { phone: "+919811100003" },
    { phone: "+919811100003", fullName: "Priya Ops (Trust & Verification)", role: "admin", kycStatus: "verified" },
    { upsert: true, new: true }
  );
  const founder = await User.findOneAndUpdate(
    { phone: "+919811100004" },
    { phone: "+919811100004", fullName: "Founder", role: "founder", kycStatus: "verified" },
    { upsert: true, new: true }
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
    const svc = await Service.findOneAndUpdate(
      { name },
      {
        category, name, description: blurb, professionalFee: fee, governmentFee: gov, timelineDays: days,
        includes: ["Initial review", "One round of revisions", "Final delivery"],
        requiredDocuments: ["Government ID", "Relevant existing documents"],
        deliverables: ["Signed PDF", "Editable draft"],
        defaultAdvocateId: advocate._id,
      },
      { upsert: true, new: true }
    );
    created.push(svc);
  }
  return created;
}

async function seedMatters({ individualAccount, businessAccount, meera, vfOwner }, advocates) {
  const specs = [
    { account: businessAccount, advocate: advocates[0], title: "Vendor recovery — Northline Distribution", forum: "Bengaluru Commercial Court", stage: "action_in_progress", nextAction: "File rejoinder to vendor's reply", forBusiness: true },
    { account: businessAccount, advocate: advocates[6], title: "Trademark opposition — house brand", forum: "Trademark Registry", stage: "consultation", nextAction: "Advocate to file counter-statement", forBusiness: true },
    { account: individualAccount, advocate: advocates[3], title: "Tenant eviction notice response", forum: "Bengaluru City Civil Court", stage: "lawyer_matched", nextAction: "Schedule first consultation", forBusiness: false },
    { account: individualAccount, advocate: advocates[5], title: "Defective appliance consumer complaint", forum: "Bengaluru Consumer Forum", stage: "resolution", nextAction: "Awaiting forum order", forBusiness: false },
    { account: businessAccount, advocate: advocates[7], title: "GST demand notice response", forum: "GST Appellate Tribunal", stage: "engagement_confirmed", nextAction: "Submit reply within statutory deadline", forBusiness: true },
  ];

  const matters = [];
  let seq = 8801;
  for (const spec of specs) {
    const matter = await Matter.findOneAndUpdate(
      { title: spec.title },
      {
        reference: `SM-BLR-2026-${seq++}`,
        accountId: spec.account._id,
        advocateId: spec.advocate._id,
        title: spec.title,
        forum: spec.forum,
        stage: spec.stage,
        nextAction: spec.nextAction,
        openedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
        engagedAt: new Date(Date.now() - 20 * 24 * 3600 * 1000),
      },
      { upsert: true, new: true }
    );
    matters.push(matter);

    await TimelineEvent.deleteMany({ matterId: matter._id });
    await TimelineEvent.insertMany([
      { matterId: matter._id, type: "intake", title: "Matter opened", body: "Intake routed and advocate matched.", actorType: "system", occurredAt: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      { matterId: matter._id, type: "engagement", title: "Engagement confirmed", body: "Fee proposal accepted by client.", actorType: "advocate", actorId: spec.advocate._id, occurredAt: new Date(Date.now() - 20 * 24 * 3600 * 1000) },
      { matterId: matter._id, type: "update", title: spec.nextAction, body: "Advocate is preparing the next filing.", actorType: "advocate", actorId: spec.advocate._id, occurredAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) },
    ]);

    await Task.deleteMany({ matterId: matter._id });
    await Task.insertMany([
      { matterId: matter._id, label: "Upload supporting documents", ownerType: "client", dueAt: new Date(Date.now() + 3 * 24 * 3600 * 1000) },
      { matterId: matter._id, label: "Review and sign engagement letter", ownerType: "client", dueAt: new Date(Date.now() + 1 * 24 * 3600 * 1000), isStatutoryDeadline: false },
    ]);

    await Hearing.deleteMany({ matterId: matter._id });
    if (spec.stage === "action_in_progress" || spec.stage === "engagement_confirmed") {
      await Hearing.create({ matterId: matter._id, forum: spec.forum, courtHall: "Hall 4", listedAt: new Date(Date.now() + 14 * 24 * 3600 * 1000), purpose: "Next hearing" });
    }

    await MatterAccessGrant.deleteMany({ matterId: matter._id });
    await MatterAccessGrant.create({
      matterId: matter._id, subjectId: spec.advocate._id, subjectType: "advocate", subjectName: `Adv. matched to matter`, subjectRole: "Engaged advocate",
      scope: ["documents", "messages", "tasks", "fees"], grantedAt: new Date(),
    });

    const ownerUserId = spec.account._id.toString() === individualAccount._id.toString() ? meera._id : vfOwner._id;
    await MessageThread.deleteMany({ matterId: matter._id });
    const thread = await MessageThread.create({ matterId: matter._id, participants: [ownerUserId, spec.advocate.userId] });
    await Message.deleteMany({ threadId: thread._id });
    await Message.insertMany([
      { threadId: thread._id, senderId: spec.advocate.userId, body: `Hello, I've reviewed the matter and ${spec.nextAction.toLowerCase()}. I'll update you once it's done.`, sentAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) },
      { threadId: thread._id, senderId: ownerUserId, body: "Thank you, please let me know if you need anything from my side.", sentAt: new Date(Date.now() - 1 * 24 * 3600 * 1000) },
    ]);
  }
  return matters;
}

async function seedDraftingTemplates() {
  const rental = await DocTemplate.findOneAndUpdate(
    { name: "Rental Agreement" },
    {
      category: "rental", name: "Rental Agreement", jurisdiction: "Karnataka", version: 1, blurb: "An 11-month leave-and-license agreement.", pages: 4,
      baseSections: [
        { key: "parties", heading: "Parties", bodyTemplate: "This agreement is made between {{landlordName}} (\"Landlord\") and {{tenantName}} (\"Tenant\") for the premises at {{propertyAddress}}." },
        { key: "term", heading: "Term & Rent", bodyTemplate: "The term is 11 months from {{startDate}} at a monthly rent of Rs. {{monthlyRent}}, payable by the 5th of each month." },
      ],
      fieldSchema: [
        { key: "landlordName", label: "Landlord name", placeholder: "Landlord Name", required: true },
        { key: "tenantName", label: "Tenant name", placeholder: "Tenant Name", required: true },
        { key: "propertyAddress", label: "Property address", placeholder: "Property Address", wide: true, required: true },
        { key: "startDate", label: "Start date", placeholder: "1 October 2026" },
        { key: "monthlyRent", label: "Monthly rent", placeholder: "25,000" },
      ],
      stampDutyNote: "Karnataka: stamp duty is 0.5% of average annual rent, capped as per the Karnataka Stamp Act.",
      draftFee: 0, reviewFee: 1499,
    },
    { upsert: true, new: true }
  );
  await ClauseLibrary.deleteMany({ templateId: rental._id });
  await ClauseLibrary.insertMany([
    { templateId: rental._id, title: "Security deposit — 10 months' rent", bodyTemplate: "The Tenant shall pay a refundable security deposit of Rs. {{securityDeposit}} adjustable against damages.", rationaleNote: "Higher deposits shift risk to the tenant; the ordinary Bengaluru market position is 2-3 months for residential.", disposition: "review_advised", riskSide: "client", favors: "drafter", requiresFields: ["securityDeposit"] },
    { templateId: rental._id, title: "Lock-in period — 6 months", bodyTemplate: "Neither party may terminate this agreement before {{lockInMonths}} months from the start date.", rationaleNote: "A lock-in protects the landlord's occupancy planning; balanced practice caps it at 6 months.", disposition: "recommended", riskSide: "mutual", favors: "balanced" },
    { templateId: rental._id, title: "Maintenance charges borne by tenant", bodyTemplate: "The Tenant shall bear monthly maintenance/society charges in addition to rent.", rationaleNote: "Common in Bengaluru apartment leases; shifts a routine cost to the tenant.", disposition: "optional", riskSide: "client", favors: "drafter" },
  ]);

  const employment = await DocTemplate.findOneAndUpdate(
    { name: "Employment Agreement" },
    {
      category: "employment", name: "Employment Agreement", jurisdiction: "Karnataka", version: 1, blurb: "Standard employment agreement with statutory clauses.", pages: 6,
      baseSections: [
        { key: "parties", heading: "Parties & Role", bodyTemplate: "This agreement is between {{employerName}} and {{employeeName}}, appointed as {{designation}} effective {{startDate}}." },
        { key: "compensation", heading: "Compensation", bodyTemplate: "The Employee shall be paid a gross annual compensation of Rs. {{annualCTC}}, payable monthly." },
      ],
      fieldSchema: [
        { key: "employerName", label: "Employer name", placeholder: "Employer Pvt Ltd", required: true },
        { key: "employeeName", label: "Employee name", placeholder: "Employee Name", required: true },
        { key: "designation", label: "Designation", placeholder: "Software Engineer" },
        { key: "startDate", label: "Start date", placeholder: "1 November 2026" },
        { key: "annualCTC", label: "Annual CTC", placeholder: "12,00,000" },
      ],
      stampDutyNote: "Karnataka: nominal stamp duty on employment agreements.",
      draftFee: 0, reviewFee: 1499,
    },
    { upsert: true, new: true }
  );
  await ClauseLibrary.deleteMany({ templateId: employment._id });
  await ClauseLibrary.insertMany([
    { templateId: employment._id, title: "Post-resignation non-compete (12 months)", bodyTemplate: "The Employee shall not join a competing business for 12 months after resignation within {{restrictedTerritory}}.", rationaleNote: "Section 27, Indian Contract Act 1872 renders post-employment restraints void in India — this clause is not enforceable as drafted and is included only where the employer insists.", disposition: "review_advised", riskSide: "client", favors: "drafter", requiresFields: ["restrictedTerritory"] },
    { templateId: employment._id, title: "Confidentiality — indefinite", bodyTemplate: "The Employee shall keep confidential information secret indefinitely, including after termination.", rationaleNote: "Confidentiality obligations (as opposed to non-competes) are enforceable indefinitely and are standard.", disposition: "recommended", riskSide: "mutual", favors: "balanced" },
    { templateId: employment._id, title: "Non-solicitation of clients (12 months)", bodyTemplate: "The Employee shall not solicit the Employer's clients for 12 months after termination.", rationaleNote: "Narrower than a non-compete and more likely to be enforced as a reasonable restraint on trade secrets/goodwill.", disposition: "recommended", riskSide: "mutual", favors: "balanced" },
  ]);

  const nda = await DocTemplate.findOneAndUpdate(
    { name: "Mutual NDA" },
    {
      category: "nda", name: "Mutual NDA", jurisdiction: "India", version: 1, blurb: "A mutual non-disclosure agreement for commercial discussions.", pages: 3,
      baseSections: [
        { key: "parties", heading: "Parties", bodyTemplate: "This mutual non-disclosure agreement is between {{partyA}} and {{partyB}}, effective {{effectiveDate}}." },
        { key: "purpose", heading: "Purpose", bodyTemplate: "The parties wish to exchange confidential information for the purpose of {{purpose}}." },
      ],
      fieldSchema: [
        { key: "partyA", label: "Party A", placeholder: "Company A Pvt Ltd", required: true },
        { key: "partyB", label: "Party B", placeholder: "Company B Pvt Ltd", required: true },
        { key: "effectiveDate", label: "Effective date", placeholder: "1 October 2026" },
        { key: "purpose", label: "Purpose", placeholder: "evaluating a potential business relationship", wide: true },
      ],
      draftFee: 0, reviewFee: 1499,
    },
    { upsert: true, new: true }
  );
  await ClauseLibrary.deleteMany({ templateId: nda._id });
  await ClauseLibrary.insertMany([
    { templateId: nda._id, title: "Term — 3 years", bodyTemplate: "Confidentiality obligations survive for {{termYears}} years from disclosure.", rationaleNote: "3 years is the common market position for commercial (non-trade-secret) NDAs.", disposition: "recommended", riskSide: "mutual", favors: "balanced" },
    { templateId: nda._id, title: "Unilateral carve-out for Party A", bodyTemplate: "Party A's obligations under this agreement are waived where disclosure is made to its affiliates.", rationaleNote: "Favors Party A by narrowing only their obligations, not Party B's — a deviation from the mutual baseline.", disposition: "review_advised", riskSide: "counterparty", favors: "drafter" },
  ]);

  const notice = await DocTemplate.findOneAndUpdate(
    { name: "Demand Notice" },
    {
      category: "notice", name: "Demand Notice", jurisdiction: "India", version: 1, blurb: "A formal demand / cease-and-desist notice.", pages: 2,
      baseSections: [
        { key: "recipient", heading: "To", bodyTemplate: "To: {{recipientName}}, {{recipientAddress}}" },
        { key: "demand", heading: "Demand", bodyTemplate: "You are hereby called upon to {{demandAction}} within {{noticePeriodDays}} days of receipt of this notice, failing which our client shall be constrained to initiate appropriate legal proceedings without further notice." },
      ],
      fieldSchema: [
        { key: "recipientName", label: "Recipient name", placeholder: "Recipient Name", required: true },
        { key: "recipientAddress", label: "Recipient address", placeholder: "Recipient Address", wide: true },
        { key: "demandAction", label: "Demand", placeholder: "pay the outstanding amount of Rs. 1,00,000", wide: true, required: true },
        { key: "noticePeriodDays", label: "Notice period (days)", placeholder: "15" },
      ],
      draftFee: 0, reviewFee: 1499,
    },
    { upsert: true, new: true }
  );
  await ClauseLibrary.deleteMany({ templateId: notice._id });
  await ClauseLibrary.insertMany([
    { templateId: notice._id, title: "Reservation of rights", bodyTemplate: "This notice is issued without prejudice to any other right or remedy available to our client under law.", rationaleNote: "Standard boilerplate protecting the sender's other legal options.", disposition: "recommended", riskSide: "mutual", favors: "balanced" },
  ]);

  return { rental, employment, nda, notice };
}

async function seedVidhiraCorpus() {
  const contractAct1872 = await CorpusDocument.findOneAndUpdate(
    { citation: "Indian Contract Act 1872, s.27" },
    { source: "bare_act", citation: "Indian Contract Act 1872, s.27", title: "Section 27 — Agreement in restraint of trade, void", actName: "Indian Contract Act 1872", sectionNumber: "27", treatment: "IN FORCE", canonicalUrl: "https://www.indiacode.nic.in" },
    { upsert: true, new: true }
  );
  const golikari = await CorpusDocument.findOneAndUpdate(
    { citation: "Niranjan Shankar Golikari v. Century Spg. Mfg. Co. (1967) 2 SCR 378" },
    { source: "supreme_court", citation: "Niranjan Shankar Golikari v. Century Spg. Mfg. Co. (1967) 2 SCR 378", title: "Niranjan Shankar Golikari v. Century Spinning & Manufacturing Co.", court: "Supreme Court of India", decidedOn: new Date("1967-03-08"), treatment: "GOOD LAW · FOLLOWED" },
    { upsert: true, new: true }
  );
  const murgai = await CorpusDocument.findOneAndUpdate(
    { citation: "Superintendence Company of India v. Krishan Murgai (1981) 2 SCC 246" },
    { source: "supreme_court", citation: "Superintendence Company of India v. Krishan Murgai (1981) 2 SCC 246", title: "Superintendence Company of India v. Krishan Murgai", court: "Supreme Court of India", decidedOn: new Date("1980-08-06"), treatment: "GOOD LAW · FOLLOWED" },
    { upsert: true, new: true }
  );
  const percept = await CorpusDocument.findOneAndUpdate(
    { citation: "Percept D'Mark (India) Pvt Ltd v. Zaheer Khan (2006) 4 SCC 227" },
    { source: "supreme_court", citation: "Percept D'Mark (India) Pvt Ltd v. Zaheer Khan (2006) 4 SCC 227", title: "Percept D'Mark (India) Pvt Ltd v. Zaheer Khan", court: "Supreme Court of India", decidedOn: new Date("2006-02-20"), treatment: "GOOD LAW · FOLLOWED" },
    { upsert: true, new: true }
  );

  await CorpusChunk.deleteMany({ documentId: { $in: [contractAct1872._id, golikari._id, murgai._id, percept._id] } });
  await CorpusChunk.insertMany([
    {
      documentId: contractAct1872._id, ordinal: 1, paragraphClass: "provision", sectionLabel: "s.27",
      text: "Every agreement by which any one is restrained from exercising a lawful profession, trade or business of any kind, is to that extent void.",
      keywords: ["restraint", "trade", "void", "non-compete", "noncompete", "profession", "employment", "employer", "post-resignation", "resign", "resignation", "job", "quit", "s.27", "section", "27"],
      deepLink: "https://www.indiacode.nic.in/contract-act-1872#s27",
    },
    {
      documentId: golikari._id, ordinal: 1, paragraphClass: "holding", sectionLabel: "para 24",
      text: "A restrictive covenant operative during the term of employment is generally valid, whereas a covenant that restrains the employee's freedom after the termination of employment is void under Section 27, unless it falls within a recognised exception.",
      keywords: ["restraint", "employment", "employer", "non-compete", "noncompete", "post-resignation", "resign", "resignation", "job", "during", "term", "exclusivity", "s.27"],
      deepLink: "https://indiankanoon.org/doc/golikari",
    },
    {
      documentId: murgai._id, ordinal: 1, paragraphClass: "holding", sectionLabel: "para 16",
      text: "A negative covenant restraining an employee from competing after the termination of employment is void under Section 27 of the Indian Contract Act, and this is so even where the covenant is limited as to time, place or space.",
      keywords: ["negative", "covenant", "non-compete", "noncompete", "post-resignation", "resign", "resignation", "job", "employer", "employment", "void", "s.27"],
      deepLink: "https://indiankanoon.org/doc/murgai",
    },
    {
      documentId: percept._id, ordinal: 1, paragraphClass: "holding", sectionLabel: "para 45",
      text: "Section 27 makes no distinction between a partial and a total restraint of trade — a restraint operating after the term of the contract is void even if reasonable, save the exceptions expressly carved out by the Act.",
      keywords: ["section 27", "partial", "total", "restraint", "reasonable", "non-compete", "post-resignation", "resign", "employer", "job"],
      deepLink: "https://indiankanoon.org/doc/percept",
    },
    {
      documentId: golikari._id, ordinal: 2, paragraphClass: "petitioner_arguments", sectionLabel: "para 9",
      text: "The employee argued that any restriction on future employment, however brief, offends the constitutional right to livelihood and must be struck down in its entirety.",
      keywords: ["employee", "argued", "livelihood", "constitutional"],
      deepLink: "https://indiankanoon.org/doc/golikari-arg",
    },
  ]);
}

async function seedPackRuleset() {
  await PackRuleset.findOneAndUpdate(
    { categoryId: "food", version: 1 },
    {
      categoryId: "food", categoryName: "Packaged Food", version: 1, effectiveFrom: new Date("2025-01-01"),
      declarations: [
        { key: "net_quantity", ruleRef: "LM(PC) Rules 2011, r.6", required: true, formatPattern: "\\d+\\s?(g|kg|ml|l)" },
        { key: "mrp", ruleRef: "LM(PC) Rules 2011, r.18", required: true, formatPattern: "(Rs\\.?|₹)\\s?\\d+" },
        { key: "fssai_license", ruleRef: "FSSAI Act 2006, s.31", required: true, formatPattern: "\\d{14}" },
        { key: "best_before", ruleRef: "FSS (Packaging & Labelling) Regs 2011", required: true, formatPattern: "\\d{2}/\\d{4}" },
      ],
      claimRules: [
        { pattern: "100% natural", verdict: "needs_substantiation", ruleRef: "CCPA Guidelines 2022, s.4", substantiationRequired: true, saferPhrasing: "Made with natural ingredients", saferRationale: "\"100% natural\" is rarely defensible for processed food; a qualified claim survives scrutiny." },
        { pattern: "no side effects", verdict: "high_risk", ruleRef: "ASCI Code, Ch. III", substantiationRequired: true, saferPhrasing: "" },
      ],
    },
    { upsert: true }
  );
}

async function seedAnalyticsSnapshots(advocates) {
  await AnalyticsSnapshot.findOneAndUpdate(
    { tab: "founder" },
    {
      tab: "founder", refreshedAt: new Date(),
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
    },
    { upsert: true }
  );

  await AnalyticsSnapshot.findOneAndUpdate(
    { tab: "fdemand" },
    { tab: "fdemand", refreshedAt: new Date(), payload: { dailyRequests: Array.from({ length: 30 }, (_, i) => 150 + Math.round(40 * Math.sin(i / 4)) + i) } },
    { upsert: true }
  );

  await AnalyticsSnapshot.findOneAndUpdate(
    { tab: "fservices" },
    {
      tab: "fservices", refreshedAt: new Date(),
      payload: { rows: [
        { service: "Legal research", enquiries: 2400, started: 2400, completed: 2210, abandoned: 190, conversionPct: 92, revenue: 0, asp: 0, avgTimeHrs: 0.1, csat: 4.7 },
        { service: "Advocate consultations", enquiries: 1800, started: 1500, completed: 1380, abandoned: 120, conversionPct: 77, revenue: 3800000, asp: 2753, avgTimeHrs: 1, csat: 4.5 },
        { service: "Contract drafting", enquiries: 620, started: 540, completed: 480, abandoned: 60, conversionPct: 77, revenue: 900000, asp: 1875, avgTimeHrs: 24, csat: 4.4 },
        { service: "Contract review", enquiries: 340, started: 300, completed: 270, abandoned: 30, conversionPct: 79, revenue: 540000, asp: 2000, avgTimeHrs: 12, csat: 4.3 },
        { service: "Pack compliance", enquiries: 210, started: 190, completed: 165, abandoned: 25, conversionPct: 79, revenue: 990000, asp: 6000, avgTimeHrs: 6, csat: 4.6 },
      ] },
    },
    { upsert: true }
  );

  await AnalyticsSnapshot.findOneAndUpdate(
    { tab: "ffunnel" },
    {
      tab: "ffunnel", refreshedAt: new Date(),
      payload: { stages: [
        { stage: "Visitors", count: 92000, dropPct: 0 },
        { stage: "Registered users", count: 24800, dropPct: 73, reasons: [{ reason: "OTP-screen abandonment", sharePct: 40, evidence: "40% of drop-offs exit within 10s of the OTP screen loading." }] },
        { stage: "Service selected", count: 15200, dropPct: 39 },
        { stage: "Payment started", count: 11000, dropPct: 28 },
        { stage: "Payment completed", count: 9600, dropPct: 13, reasons: [{ reason: "UPI collect timeouts", sharePct: 55, evidence: "55% of failed payments show a UPI collect request expiring unactioned." }] },
        { stage: "Service delivered", count: 9200, dropPct: 4 },
        { stage: "Repeat user", count: 2600, dropPct: 72 },
      ] },
    },
    { upsert: true }
  );

  await AnalyticsSnapshot.findOneAndUpdate(
    { tab: "frevenue" },
    { tab: "frevenue", refreshedAt: new Date(), payload: { gtv: 42000000, netPlatformRevenue: 1840000, takeRatePct: 12, advocatePayouts: 24000000, monthly: [12, 14, 13, 16, 18, 18.4] } },
    { upsert: true }
  );

  await AnalyticsSnapshot.findOneAndUpdate(
    { tab: "fai" },
    { tab: "fai", refreshedAt: new Date(), payload: { totalQuestions: 1840, answeredFullPct: 68, partialPct: 22, refusedCount: 0, insufficientAuthorityPct: 10 } },
    { upsert: true }
  );
}

async function seedCorporateHealthAndComplaints(businessAccount) {
  await CorporateAccountHealth.findOneAndUpdate(
    { accountId: businessAccount._id },
    {
      accountId: businessAccount._id, name: "Verdanta Foods", plan: "Business retainer", seats: 8, revenue12mo: 1240000,
      renewalDate: new Date(Date.now() + 60 * 24 * 3600 * 1000), score: 82, band: "healthy",
      metrics: { users: 8, contractsUploaded: 34, draftsGenerated: 19, packScans: 22, openMatters: 2, pendingApprovals: 1, complianceAlerts: 0, subscriptionUsedPct: 61 },
      riskNarrative: "Healthy usage across drafting and pack compliance; renewal in 60 days with no red flags.",
    },
    { upsert: true }
  );
  for (const [name, score, band, narrative] of [
    ["Kesar Naturals", 66, "watch", "Pack-scan usage dropped 40% this quarter and one compliance alert is unresolved — needs a check-in before renewal."],
    ["Northline Distribution", 78, "healthy", "Steady contract-review usage; no action needed."],
    ["Auroma Fragrances", 71, "watch", "Seat utilisation is low relative to plan size — a downsell risk if usage doesn't pick up."],
    ["Bluecrest Devices", 54, "at_risk", "No logins in 21 days and a pending compliance alert — needs a founder call this week, not a renewal email."],
  ]) {
    await CorporateAccountHealth.findOneAndUpdate(
      { name },
      { accountId: businessAccount._id, name, plan: "Business retainer", seats: 5, revenue12mo: 600000, renewalDate: new Date(Date.now() + 30 * 24 * 3600 * 1000), score, band, metrics: { users: 5, contractsUploaded: 10, draftsGenerated: 6, packScans: 4, openMatters: 1, pendingApprovals: 1, complianceAlerts: band === "healthy" ? 0 : 1, subscriptionUsedPct: 40 }, riskNarrative: narrative },
      { upsert: true }
    );
  }

  await Complaint.findOneAndUpdate(
    { ref: "CMP-2026-0091" },
    { ref: "CMP-2026-0091", title: "Contract review delivered 2 days late", category: "deliverable_delay", status: "resolved", severity: "medium", serviceInvolved: "Contract review", owner: "Ops", rootCause: "Advocate overload during a public holiday week", correctiveAction: "Added a backup reviewer to the rotation", refundAmount: 500 },
    { upsert: true }
  );
  await Complaint.findOneAndUpdate(
    { ref: "CMP-2026-0102" },
    { ref: "CMP-2026-0102", title: "Vidhira cited an amended provision", category: "citation_accuracy", status: "open", severity: "high", serviceInvolved: "Legal research", owner: "Trust & Verification", rootCause: "Corpus lag on a recent amendment", correctiveAction: "Re-indexing affected acts", refundAmount: 0 },
    { upsert: true }
  );

  await KnowledgeGap.findOneAndUpdate(
    { topic: "Karnataka Rent Act coverage" },
    { topic: "Karnataka Rent Act coverage", askedCount: 71, missing: "Karnataka Rent Act not indexed", suggestedSource: "Karnataka Rent Act bare text + amendments", priority: "index_first" },
    { upsert: true }
  );

  for (const advocate of advocates_cache) {
    await AdvocatePerformanceRow.findOneAndUpdate(
      { advocateId: advocate._id, period: "last_30_days" },
      { advocateId: advocate._id, period: "last_30_days", received: 40, accepted: 34, declined: 6, responseMinutes: 8, completed: 30, converted: 22, feesBilled: 180000, csat: 4.6 },
      { upsert: true }
    );
  }
}

async function seedGuidesFirmsAndQna(businessAccount, advocates) {
  await Guide.findOneAndUpdate({ title: "Your rights during a police stop" }, { tag: "Criminal defence", title: "Your rights during a police stop", body: "You have the right to know the grounds of arrest and to inform a person of your choice...", readMinutes: 4 }, { upsert: true });
  await Guide.findOneAndUpdate({ title: "Notice period basics under Indian employment law" }, { tag: "Employment", title: "Notice period basics under Indian employment law", body: "Notice periods are contractual, not statutory, for most private employment...", readMinutes: 5 }, { upsert: true });

  await Firm.findOneAndUpdate(
    { name: "Iyer & Associates" },
    { name: "Iyer & Associates", city: "Bengaluru", practiceAreas: ["Contract & commercial recovery"], advocateIds: [advocates[0]._id], benchStrength: 6, empanelmentNote: "Empanelled with 3 corporate accounts", startingFee: 3000, verificationStatus: "verified" },
    { upsert: true }
  );

  const q1 = await PublicQuestion.findOneAndUpdate(
    { body: "Can my employer enforce a 1-year non-compete after I resign?" },
    { authorAccountId: businessAccount._id, body: "Can my employer enforce a 1-year non-compete after I resign?", practiceArea: "Employment", status: "published", viewCount: 240 },
    { upsert: true, new: true }
  );
  await PublicAnswer.findOneAndUpdate(
    { questionId: q1._id },
    { questionId: q1._id, advocateId: advocates[4]._id, body: "Generally no — Section 27 of the Indian Contract Act voids post-employment restraints, with narrow exceptions.", publishedAt: new Date(), helpfulCount: 58, moderationState: "published" },
    { upsert: true }
  );
}

// Exported so the server can auto-seed an empty database on boot (needed because the
// default in-memory MongoDB is process-local: a separate `npm run seed` process would
// seed a database the dev server process never sees). Safe to call multiple times against
// a real persistent MONGODB_URI too — every write here is findOneAndUpdate/upsert.
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
  const pendingAdvocateUser = await User.findOneAndUpdate(
    { phone: "+919899990000" },
    { phone: "+919899990000", fullName: "Adv. Kabir Chatterjee", role: "advocate" },
    { upsert: true, new: true }
  );
  const pendingAdvocate = await Advocate.findOneAndUpdate(
    { userId: pendingAdvocateUser._id },
    { userId: pendingAdvocateUser._id, barCouncil: "Bar Council of West Bengal", enrolmentNumber: "WB/9911/2015", enrolmentYear: 2015, verificationStatus: "submitted", practiceAreas: [areas["Litigation & notices"]._id], languages: ["en", "hi", "bn"], consultationModes: ["video"], instantFee: 2000, scheduledFee: 2600, city: "Kolkata" },
    { upsert: true, new: true }
  );
  await VerificationCase.findOneAndUpdate(
    { advocateId: pendingAdvocate._id },
    { advocateId: pendingAdvocate._id, checks: [{ type: "bar_enrolment", status: "pending" }, { type: "photo_id", status: "pass" }, { type: "practice_proof", status: "pending" }], decision: "pending" },
    { upsert: true }
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

// CLI entry point: `node src/seed/seed.js` / `npm run seed` — connects, seeds, disconnects.
// Only runs when this file is executed directly, not when seedAll is imported elsewhere.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  connectDB()
    .then(seedAll)
    .then(disconnectDB)
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
