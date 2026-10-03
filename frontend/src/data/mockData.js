// Static mock data mirroring the module-level consts baked into the original
// Samicus.dc.html / App Screens.dc.html prototypes. No network calls anywhere —
// every screen in this app reads and mutates this in-memory data only.

export const STAGES = ["Intake", "Lawyer matched", "Consultation", "Engagement confirmed", "Action in progress", "Resolution"];

export const SITUATIONS = [
  { id: "police", en: "Police called on me / questioning", hi: "पुलिस ने पूछताछ की", area: "Criminal defence" },
  { id: "arrest", en: "I've been arrested or detained", hi: "मुझे गिरफ्तार किया गया", area: "Criminal defence" },
  { id: "notice", en: "I received a legal notice", hi: "मुझे कानूनी नोटिस मिला", area: "Litigation & notices" },
  { id: "property", en: "Landlord / tenant dispute", hi: "मकान मालिक-किरायेदार विवाद", area: "Property & tenancy" },
  { id: "family", en: "Divorce or custody matter", hi: "तलाक या हिरासत", area: "Family" },
  { id: "work", en: "Fired or workplace dispute", hi: "नौकरी से निकाला गया", area: "Employment" },
  { id: "accident", en: "Road accident / insurance claim", hi: "सड़क दुर्घटना दावा", area: "Motor accident & insurance" },
  { id: "consumer", en: "Defective product / service", hi: "दोषपूर्ण उत्पाद", area: "Consumer" },
  { id: "cyber", en: "Online fraud / cybercrime", hi: "ऑनलाइन धोखाधड़ी", area: "Cyber & online fraud" },
  { id: "travel", en: "Visa / immigration issue", hi: "वीज़ा समस्या", area: "Immigration" },
  { id: "contract", en: "Vendor won't pay / contract breach", hi: "अनुबंध उल्लंघन", area: "Contract & commercial recovery" },
  { id: "ip", en: "Trademark or IP concern", hi: "ट्रेडमार्क समस्या", area: "Trademark & IP" },
  { id: "tax", en: "Tax notice or banking dispute", hi: "कर सूचना", area: "Tax & banking" },
  { id: "other", en: "Not sure / general advice", hi: "सामान्य सलाह", area: "General advisory" },
];

export const LAWYERS = [
  { id: "rohan", initials: "RI", name: "Rohan Iyer", area: "Contract & commercial recovery", subs: ["Vendor recovery", "B2B disputes"], city: "Bengaluru", years: 11, courts: "City Civil Court, Commercial Court", langs: ["English", "Hindi", "Kannada"], modes: ["Video", "Phone", "In person"], fee: 3200, available: true, respond: "5 min", nextSlot: "Today, 5:00 PM", bar: "BE/1000/2010", keywords: "contract vendor recovery b2b", whyMatch: "Handles vendor recovery specifically and regularly appears before the Commercial Court.", education: "National Law School, Bangalore", experience: ["Recovered ₹42L from a defaulting vendor for a mid-size FMCG business.", "Advised on 30+ B2B contract disputes.", "11 years of continuous commercial litigation practice."] },
  { id: "aparna", initials: "AK", name: "Aparna Kulkarni", area: "Criminal defence", subs: ["Bail", "Arrest defence"], city: "Mumbai", years: 14, courts: "Sessions Court, High Court", langs: ["English", "Hindi", "Marathi"], modes: ["Video", "Phone"], fee: 4200, available: true, respond: "4 min", nextSlot: "Today, 6:30 PM", bar: "MH/2210/2012", keywords: "criminal arrest bail detention", whyMatch: "Specialises in bail and arrest defence with a fast historical response time.", education: "Government Law College, Mumbai", experience: ["Secured anticipatory bail in over 60 matters.", "Regular counsel for arrest-stage representation.", "14 years at the Sessions Court and Bombay High Court."] },
  { id: "meenal", initials: "MD", name: "Meenal Deshpande", area: "Family", subs: ["Divorce", "Custody"], city: "Mumbai", years: 9, courts: "Family Court", langs: ["English", "Hindi", "Marathi"], modes: ["Video", "In person"], fee: 3000, available: false, respond: "20 min", nextSlot: "Tomorrow, 11:00 AM", bar: "MH/3301/2017", keywords: "divorce custody family", whyMatch: "Focused family law practice with mediation experience.", education: "ILS Law College, Pune", experience: ["Handled 80+ mutual consent divorce filings.", "Represented clients in contested custody matters.", "9 years of dedicated family law practice."] },
  { id: "arvind", initials: "AM", name: "Arvind Menon", area: "Property & tenancy", subs: ["Eviction", "Title disputes"], city: "Bengaluru", years: 16, courts: "City Civil Court", langs: ["English", "Kannada"], modes: ["Video", "Phone", "In person"], fee: 3600, available: true, respond: "10 min", nextSlot: "Today, 4:00 PM", bar: "BE/1003/2013", keywords: "property tenant eviction title", whyMatch: "16 years handling eviction and title disputes before the City Civil Court.", education: "National Law School, Bangalore", experience: ["Represented landlords and tenants in 100+ eviction matters.", "Advised on title due diligence for property purchases.", "16 years of continuous property law practice."] },
  { id: "harpreet", initials: "HS", name: "Harpreet Singh", area: "Employment", subs: ["Wrongful termination", "Non-compete"], city: "Delhi NCR", years: 8, courts: "Labour Court, High Court", langs: ["English", "Hindi"], modes: ["Video", "Phone", "Chat"], fee: 3100, available: true, respond: "7 min", nextSlot: "Today, 7:00 PM", bar: "DL/4410/2018", keywords: "employment termination noncompete", whyMatch: "Handles wrongful termination and non-compete disputes specifically.", education: "Faculty of Law, Delhi University", experience: ["Advised employees on enforceability of post-employment restraints.", "Represented clients before the Labour Court.", "8 years of employment law practice."] },
  { id: "nisha", initials: "NR", name: "Nisha Reddy", area: "Consumer", subs: ["Product liability", "Service deficiency"], city: "Bengaluru", years: 6, courts: "Consumer Forum", langs: ["English", "Hindi", "Telugu"], modes: ["Video", "Chat"], fee: 2400, available: true, respond: "6 min", nextSlot: "Today, 3:00 PM", bar: "BE/1005/2015", keywords: "consumer product service deficiency", whyMatch: "Focused consumer forum practice with fast turnaround.", education: "Symbiosis Law School, Pune", experience: ["Filed 150+ consumer complaints.", "Recovered refunds and compensation for defective products.", "6 years of consumer law practice."] },
  { id: "devika", initials: "DN", name: "Devika Nair", area: "Trademark & IP", subs: ["Trademark filing", "Infringement"], city: "Delhi NCR", years: 10, courts: "IP Office, High Court", langs: ["English", "Hindi"], modes: ["Video", "Phone"], fee: 3400, available: false, respond: "15 min", nextSlot: "Tomorrow, 2:00 PM", bar: "DL/4412/2014", keywords: "trademark ip infringement filing", whyMatch: "10 years of trademark prosecution and infringement work.", education: "NALSAR University of Law", experience: ["Filed and prosecuted 200+ trademark applications.", "Represented clients in infringement suits before the High Court.", "10 years of IP practice."] },
  { id: "sanjay", initials: "SB", name: "Sanjay Bhatt", area: "Tax & banking", subs: ["GST notices", "Banking recovery"], city: "Mumbai", years: 13, courts: "Tribunal, High Court", langs: ["English", "Hindi"], modes: ["Video", "Phone", "In person"], fee: 3800, available: true, respond: "9 min", nextSlot: "Today, 5:30 PM", bar: "MH/2215/2011", keywords: "tax gst banking recovery", whyMatch: "13 years handling GST notices and banking recovery matters.", education: "Government Law College, Mumbai", experience: ["Represented clients before the GST Appellate Tribunal.", "Advised on banking recovery and SARFAESI proceedings.", "13 years of tax and banking law practice."] },
];

export const SERVICES = [
  { id: "notice", cat: "Notices", name: "Legal notice drafting", fee: 1499, gov: 0, timeline: "3 days", blurb: "A demand or cease-and-desist notice drafted and reviewed by a verified advocate.", includes: ["Initial review", "One round of revisions", "Final delivery"], docs: ["Government ID", "Relevant existing documents"], deliverables: ["Signed PDF", "Editable draft"], pro: "Adv. Rohan Iyer", proInitials: "RI", proLine: "Contract & commercial recovery" },
  { id: "review", cat: "Agreements", name: "Agreement review", fee: 1999, gov: 0, timeline: "2 days", blurb: "Line-by-line review of an existing contract against a balanced baseline.", includes: ["Clause-by-clause review", "Redline markup", "Negotiation notes"], docs: ["Draft agreement"], deliverables: ["Redlined document", "Summary memo"], pro: "Adv. Rohan Iyer", proInitials: "RI", proLine: "Contract & commercial recovery" },
  { id: "rental", cat: "Agreements", name: "Rental agreement drafting", fee: 999, gov: 200, timeline: "1 day", blurb: "State-compliant rental agreement with e-stamp support.", includes: ["Custom clauses", "e-Stamp guidance"], docs: ["ID proof of both parties"], deliverables: ["Signed PDF"], pro: "Adv. Arvind Menon", proInitials: "AM", proLine: "Property & tenancy" },
  { id: "employment", cat: "Agreements", name: "Employment agreement drafting", fee: 1499, gov: 0, timeline: "2 days", blurb: "Offer letter + employment agreement with statutory clauses.", includes: ["Offer letter", "Employment agreement"], docs: ["Company details"], deliverables: ["Signed PDF"], pro: "Adv. Harpreet Singh", proInitials: "HS", proLine: "Employment" },
  { id: "trademark", cat: "IP", name: "Trademark search & filing", fee: 4999, gov: 4500, timeline: "20 days", blurb: "Search, class selection and filing with the Trademark Registry.", includes: ["Availability search", "Class selection", "Filing"], docs: ["Logo/wordmark", "Applicant details"], deliverables: ["Filing acknowledgement"], pro: "Adv. Devika Nair", proInitials: "DN", proLine: "Trademark & IP" },
  { id: "consumercomplaint", cat: "Consumer", name: "Consumer complaint filing", fee: 2499, gov: 0, timeline: "5 days", blurb: "Complaint drafted and filed before the Consumer Forum.", includes: ["Drafting", "Filing"], docs: ["Purchase proof", "Correspondence"], deliverables: ["Filed complaint copy"], pro: "Adv. Nisha Reddy", proInitials: "NR", proLine: "Consumer" },
  { id: "chequebounce", cat: "Notices", name: "Cheque-bounce notice (S.138)", fee: 1299, gov: 0, timeline: "2 days", blurb: "Statutory demand notice under Section 138, NI Act.", includes: ["Drafting", "Dispatch guidance"], docs: ["Bounced cheque, bank memo"], deliverables: ["Signed notice"], pro: "Adv. Rohan Iyer", proInitials: "RI", proLine: "Contract & commercial recovery" },
  { id: "incorporation", cat: "Corporate", name: "Startup incorporation", fee: 5999, gov: 4999, timeline: "10 days", blurb: "Private limited company incorporation with MoA/AoA.", includes: ["Name approval", "MoA/AoA drafting", "Filing"], docs: ["Director KYC"], deliverables: ["Certificate of incorporation"], pro: "Adv. Rohan Iyer", proInitials: "RI", proLine: "Contract & commercial recovery" },
  { id: "privacy", cat: "Compliance", name: "Privacy policy drafting", fee: 1999, gov: 0, timeline: "3 days", blurb: "Website/app privacy policy compliant with the DPDP Act.", includes: ["Drafting", "One revision"], docs: ["Data flow summary"], deliverables: ["Policy document"], pro: "Adv. Devika Nair", proInitials: "DN", proLine: "Trademark & IP" },
  { id: "will", cat: "Family", name: "Will drafting", fee: 2999, gov: 0, timeline: "5 days", blurb: "Legally valid will drafted with witness guidance.", includes: ["Drafting", "Witness guidance"], docs: ["Asset list"], deliverables: ["Signed will"], pro: "Adv. Meenal Deshpande", proInitials: "MD", proLine: "Family" },
  { id: "divorceconsult", cat: "Family", name: "Divorce consultation", fee: 1500, gov: 0, timeline: "1 day", blurb: "Initial consultation on mutual consent or contested divorce.", includes: ["45-minute consultation"], docs: ["None required upfront"], deliverables: ["Written next-steps note"], pro: "Adv. Meenal Deshpande", proInitials: "MD", proLine: "Family" },
  { id: "propertyreview", cat: "Property", name: "Property document review", fee: 2499, gov: 0, timeline: "4 days", blurb: "Title and encumbrance review before purchase.", includes: ["Title search", "Encumbrance check"], docs: ["Sale deed, EC"], deliverables: ["Review memo"], pro: "Adv. Arvind Menon", proInitials: "AM", proLine: "Property & tenancy" },
];

export const MATTERS = [
  {
    id: "vf1", forBusiness: true, short: "Vendor recovery", title: "Vendor recovery — Northline Distribution",
    ref: "SM-BLR-2026-8801", opened: "18 Aug 2026", forum: "Bengaluru Commercial Court", stage: 4,
    nextAction: "File rejoinder to vendor's reply", lawyer: "Adv. Rohan Iyer", lawyerId: "rohan", lawyerInitials: "RI",
    engagedOn: "28 Aug 2026", payable: 45000,
    timeline: [
      { title: "Matter opened", body: "Intake routed and advocate matched.", when: "18 Aug 2026", who: "System" },
      { title: "Engagement confirmed", body: "Fee proposal accepted by client.", when: "28 Aug 2026", who: "Adv. Rohan Iyer" },
      { title: "File rejoinder to vendor's reply", body: "Advocate is preparing the next filing.", when: "15 Sep 2026", who: "Adv. Rohan Iyer" },
    ],
    docs: [
      { ext: "PDF", name: "Purchase order.pdf", meta: "1.2 MB", tag: "Shared with advocate" },
      { ext: "PDF", name: "Demand notice.pdf", meta: "340 KB", tag: "Shared with advocate" },
      { ext: "DOCX", name: "Internal notes.docx", meta: "88 KB", tag: "Private to you" },
    ],
    fees: [
      { label: "Demand notice", note: "Milestone 1", amount: 15000, gov: false },
      { label: "Filing & first hearing", note: "Milestone 2", amount: 45000, gov: false },
      { label: "Court fee", note: "Estimated", amount: 8000, gov: true },
      { label: "Platform fee", note: "Flat", amount: 99, gov: false },
    ],
  },
  {
    id: "vf2", forBusiness: true, short: "Trademark opposition", title: "Trademark opposition — house brand",
    ref: "SM-BLR-2026-8802", opened: "20 Aug 2026", forum: "Trademark Registry", stage: 3,
    nextAction: "Advocate to file counter-statement", lawyer: "Adv. Devika Nair", lawyerId: "devika", lawyerInitials: "DN",
    engagedOn: "1 Sep 2026", payable: 12000,
    timeline: [
      { title: "Matter opened", body: "Opposition notice received.", when: "20 Aug 2026", who: "System" },
      { title: "Engagement confirmed", body: "Fee proposal accepted.", when: "1 Sep 2026", who: "Adv. Devika Nair" },
    ],
    docs: [{ ext: "PDF", name: "Opposition notice.pdf", meta: "600 KB", tag: "Shared with advocate" }],
    fees: [{ label: "Counter-statement drafting", note: "Fixed fee", amount: 12000, gov: false }, { label: "Platform fee", note: "Flat", amount: 99, gov: false }],
  },
  {
    id: "mr1", forBusiness: false, short: "Tenant eviction", title: "Tenant eviction notice response",
    ref: "SM-BLR-2026-8803", opened: "18 Aug 2026", forum: "Bengaluru City Civil Court", stage: 1,
    nextAction: "Schedule first consultation", lawyer: "Adv. Arvind Menon", lawyerId: "arvind", lawyerInitials: "AM",
    engagedOn: "", payable: 0,
    timeline: [{ title: "Matter opened", body: "Intake routed and advocate matched.", when: "18 Aug 2026", who: "System" }],
    docs: [{ ext: "PDF", name: "Eviction notice.pdf", meta: "220 KB", tag: "Shared with advocate" }],
    fees: [{ label: "Scheduled consultation", note: "Pending", amount: 3600, gov: false }],
  },
  {
    id: "mr2", forBusiness: false, short: "Consumer complaint", title: "Defective appliance consumer complaint",
    ref: "SM-BLR-2026-8804", opened: "18 Aug 2026", forum: "Bengaluru Consumer Forum", stage: 5,
    nextAction: "Awaiting forum order", lawyer: "Adv. Nisha Reddy", lawyerId: "nisha", lawyerInitials: "NR",
    engagedOn: "28 Aug 2026", payable: 0,
    timeline: [
      { title: "Matter opened", body: "Complaint filed.", when: "18 Aug 2026", who: "System" },
      { title: "Engagement confirmed", body: "Fee accepted.", when: "28 Aug 2026", who: "Adv. Nisha Reddy" },
      { title: "Hearing concluded", body: "Order reserved.", when: "10 Sep 2026", who: "Adv. Nisha Reddy" },
    ],
    docs: [{ ext: "PDF", name: "Purchase invoice.pdf", meta: "150 KB", tag: "Shared with advocate" }],
    fees: [{ label: "Complaint filing", note: "Fixed fee", amount: 2499, gov: false }],
  },
  {
    id: "vf3", forBusiness: true, short: "GST demand notice", title: "GST demand notice response",
    ref: "SM-BLR-2026-8805", opened: "22 Aug 2026", forum: "GST Appellate Tribunal", stage: 4,
    nextAction: "Submit reply within statutory deadline", lawyer: "Adv. Sanjay Bhatt", lawyerId: "sanjay", lawyerInitials: "SB",
    engagedOn: "2 Sep 2026", payable: 18000,
    timeline: [
      { title: "Matter opened", body: "GST notice received.", when: "22 Aug 2026", who: "System" },
      { title: "Engagement confirmed", body: "Fee accepted.", when: "2 Sep 2026", who: "Adv. Sanjay Bhatt" },
    ],
    docs: [{ ext: "PDF", name: "GST notice.pdf", meta: "410 KB", tag: "Shared with advocate" }],
    fees: [{ label: "Reply drafting & filing", note: "Fixed fee", amount: 18000, gov: false }, { label: "Platform fee", note: "Flat", amount: 99, gov: false }],
  },
];

export const TASKS = [
  { id: "t1", matter: "vf1", label: "Upload supporting documents", due: "20 Sep 2026", owner: "You", urgent: false, done: false },
  { id: "t2", matter: "vf1", label: "Review and sign engagement letter", due: "19 Sep 2026", owner: "You", urgent: true, done: true },
  { id: "t3", matter: "mr1", label: "Share eviction notice copy", due: "21 Sep 2026", owner: "You", urgent: true, done: false },
  { id: "t4", matter: "vf3", label: "Submit reply within statutory deadline", due: "25 Sep 2026", owner: "You", urgent: true, done: false },
  { id: "t5", matter: "vf2", label: "Approve counter-statement draft", due: "24 Sep 2026", owner: "You", urgent: false, done: false },
];

export const DOCUMENTS = [
  { id: "d1", ext: "PDF", name: "Purchase order.pdf", meta: "1.2 MB · 18 Aug 2026", kind: "Agreements", shared: true },
  { id: "d2", ext: "PDF", name: "Demand notice.pdf", meta: "340 KB · 20 Aug 2026", kind: "Notices", shared: true },
  { id: "d3", ext: "DOCX", name: "Internal notes.docx", meta: "88 KB · 21 Aug 2026", kind: "Evidence", shared: false },
  { id: "d4", ext: "PDF", name: "Eviction notice.pdf", meta: "220 KB · 18 Aug 2026", kind: "Notices", shared: true },
  { id: "d5", ext: "PDF", name: "Purchase invoice.pdf", meta: "150 KB · 18 Aug 2026", kind: "Invoices", shared: true },
  { id: "d6", ext: "PDF", name: "GST notice.pdf", meta: "410 KB · 22 Aug 2026", kind: "Notices", shared: true },
  { id: "d7", ext: "PDF", name: "Opposition notice.pdf", meta: "600 KB · 20 Aug 2026", kind: "Agreements", shared: true },
];

export const THREADS = [
  { id: "th1", who: "Adv. Rohan Iyer", when: "2 hours ago", matter: "vf1", preview: "I'll update you once the rejoinder is filed.", msgs: [
    { body: "Hello, I've reviewed the matter and will file the rejoinder this week. I'll update you once it's done.", when: "Yesterday, 4:12 PM", me: false },
    { body: "Thank you, please let me know if you need anything from my side.", when: "Yesterday, 5:03 PM", me: true },
  ] },
  { id: "th2", who: "Adv. Arvind Menon", when: "1 day ago", matter: "mr1", preview: "Let's schedule your first consultation.", msgs: [
    { body: "Let's schedule your first consultation for this week.", when: "1 day ago", me: false },
  ] },
  { id: "th3", who: "Samicus Support", when: "3 days ago", matter: null, preview: "Your account verification is complete.", msgs: [
    { body: "Your account verification is complete. Welcome to Samicus.", when: "3 days ago", me: false },
  ] },
];

export const ACCESS_ROWS = [
  { id: "a1", name: "Adv. Rohan Iyer", role: "Engaged advocate", on: true },
  { id: "a2", name: "Finance Head — Ananya Verma", role: "Finance (fees only)", on: true },
  { id: "a3", name: "Ops Viewer — Karthik Rao", role: "Viewer", on: true },
  { id: "a4", name: "Adv. Devika Nair", role: "No access", on: false },
];

export const NOTIFICATIONS = [
  { id: "n1", label: "Consultation reminders", sub: "24 hours and 1 hour before", on: true },
  { id: "n2", label: "New messages", sub: "From your advocate", on: true },
  { id: "n3", label: "Task due dates", sub: "Your matter tasks", on: true },
  { id: "n4", label: "Product updates", sub: "New features on Samicus", on: false },
];

export const VERIF_QUEUE = [
  { id: "v1", name: "Adv. Kabir Chatterjee", detail: "Bar Council of West Bengal · WB/9911/2015", checks: [
    { label: "Bar Council enrolment", ok: false }, { label: "Photo ID match", ok: true }, { label: "Practice proof", ok: false }, { label: "Disciplinary record", ok: true },
  ] },
  { id: "v2", name: "Adv. Simran Kaur", detail: "Bar Council of Punjab & Haryana · PH/2201/2019", checks: [
    { label: "Bar Council enrolment", ok: true }, { label: "Photo ID match", ok: true }, { label: "Practice proof", ok: true }, { label: "Disciplinary record", ok: true },
  ] },
  { id: "v3", name: "Adv. Farhan Ali", detail: "Bar Council of Kerala · KL/3312/2016", checks: [
    { label: "Bar Council enrolment", ok: true }, { label: "Photo ID match", ok: false }, { label: "Practice proof", ok: true }, { label: "Disciplinary record", ok: true },
  ] },
];

export const SPECIALISATIONS = [
  { id: "s1", label: "Criminal defence", sub: "Arrest, bail, trial", count: 18 },
  { id: "s2", label: "Litigation & notices", sub: "Civil suits, notices", count: 24 },
  { id: "s3", label: "Property & tenancy", sub: "Eviction, title disputes", count: 15 },
  { id: "s4", label: "Family", sub: "Divorce, custody", count: 12 },
  { id: "s5", label: "Employment", sub: "Termination, disputes", count: 10 },
  { id: "s6", label: "Motor accident & insurance", sub: "Claims", count: 9 },
  { id: "s7", label: "Consumer", sub: "Product & service disputes", count: 11 },
  { id: "s8", label: "Cyber & online fraud", sub: "Fraud, data breach", count: 7 },
  { id: "s9", label: "Immigration", sub: "Visa, deportation", count: 6 },
  { id: "s10", label: "Contract & commercial recovery", sub: "B2B disputes", count: 20 },
  { id: "s11", label: "Trademark & IP", sub: "Filing, infringement", count: 8 },
  { id: "s12", label: "Tax & banking", sub: "GST, recovery", count: 13 },
];

export const FIRMS = [
  { id: "f1", initials: "IA", name: "Iyer & Associates", city: "Bengaluru", size: "6 advocates", areas: "Contract & commercial recovery", note: "Empanelled with 3 corporate accounts", fee: 3000 },
  { id: "f2", initials: "MK", name: "Menon & Krishnan Chambers", city: "Bengaluru", size: "4 advocates", areas: "Property & tenancy", note: "20+ years combined experience", fee: 2800 },
  { id: "f3", initials: "DN", name: "Nair Legal Partners", city: "Delhi NCR", size: "8 advocates", areas: "Trademark & IP", note: "Full-service IP practice", fee: 3200 },
];

export const QNA = [
  { id: "q1", q: "Can my employer enforce a 1-year non-compete after I resign?", area: "Employment", by: "Adv. Harpreet Singh", a: "Generally no — Section 27 of the Indian Contract Act voids post-employment restraints, with narrow exceptions.", answers: 4, views: 240 },
  { id: "q2", q: "Is a security deposit of 10 months' rent legal in Bengaluru?", area: "Property & tenancy", by: "Adv. Arvind Menon", a: "There's no statutory cap under the Karnataka Rent Act, but 2-3 months is the common market position.", answers: 6, views: 310 },
  { id: "q3", q: "How long do I have to file a cheque-bounce case?", area: "Contract & commercial recovery", by: "Adv. Rohan Iyer", a: "A demand notice must be sent within 30 days of the bank memo, and a complaint filed within 30 days of the notice period lapsing.", answers: 3, views: 190 },
  { id: "q4", q: "Do I need to be present in court for a mutual consent divorce?", area: "Family", by: "Adv. Meenal Deshpande", a: "Yes, both parties typically need to be present for the two motions, though some courts allow video appearance.", answers: 5, views: 275 },
];

export const GUIDES = [
  { id: "g1", tag: "Criminal defence", title: "Your rights during a police stop", mins: 4 },
  { id: "g2", tag: "Employment", title: "Notice period basics under Indian employment law", mins: 5 },
  { id: "g3", tag: "Property & tenancy", title: "What a rental agreement must legally include", mins: 6 },
  { id: "g4", tag: "Consumer", title: "How to file a consumer complaint step by step", mins: 5 },
];

export const FAVORS = {
  c_deposit: "drafter", c_lockin: "balanced", c_maintenance: "drafter",
  c_noncompete: "drafter", c_confidentiality: "balanced", c_nonsolicit: "balanced",
  c_ndaterm: "balanced", c_ndacarveout: "drafter", c_reservation: "balanced",
};

export const TEMPLATES = [
  {
    id: "rental", cat: "Property", name: "Rental Agreement", blurb: "An 11-month leave-and-license agreement.", pages: 4, fee: 0, gov: 500,
    stamp: "Karnataka: stamp duty is 0.5% of average annual rent, capped as per the Karnataka Stamp Act.",
    fields: [
      { k: "landlordName", label: "Landlord name", ph: "Landlord Name" },
      { k: "tenantName", label: "Tenant name", ph: "Tenant Name" },
      { k: "propertyAddress", label: "Property address", ph: "Property Address", wide: true },
      { k: "startDate", label: "Start date", ph: "1 October 2026" },
      { k: "monthlyRent", label: "Monthly rent", ph: "25,000" },
    ],
    sections: [
      { h: "Parties", t: (v) => `This agreement is made between ${v.landlordName || "Landlord Name"} ("Landlord") and ${v.tenantName || "Tenant Name"} ("Tenant") for the premises at ${v.propertyAddress || "Property Address"}.` },
      { h: "Term & Rent", t: (v) => `The term is 11 months from ${v.startDate || "1 October 2026"} at a monthly rent of Rs. ${v.monthlyRent || "25,000"}, payable by the 5th of each month.` },
    ],
    clauses: [
      { id: "c_deposit", title: "Security deposit — 10 months' rent", rec: false, flag: "review", note: "Higher deposits shift risk to the tenant; the ordinary Bengaluru market position is 2-3 months for residential.", text: (v) => `The Tenant shall pay a refundable security deposit of Rs. ${v.securityDeposit || "2,50,000"} adjustable against damages.` },
      { id: "c_lockin", title: "Lock-in period — 6 months", rec: true, note: "A lock-in protects the landlord's occupancy planning; balanced practice caps it at 6 months.", text: () => `Neither party may terminate this agreement before 6 months from the start date.` },
      { id: "c_maintenance", title: "Maintenance charges borne by tenant", rec: false, note: "Common in Bengaluru apartment leases; shifts a routine cost to the tenant.", text: () => `The Tenant shall bear monthly maintenance/society charges in addition to rent.` },
    ],
  },
  {
    id: "employment", cat: "Employment", name: "Employment Agreement", blurb: "Standard employment agreement with statutory clauses.", pages: 6, fee: 0, gov: 200,
    stamp: "Karnataka: nominal stamp duty on employment agreements.",
    fields: [
      { k: "employerName", label: "Employer name", ph: "Employer Pvt Ltd" },
      { k: "employeeName", label: "Employee name", ph: "Employee Name" },
      { k: "designation", label: "Designation", ph: "Software Engineer" },
      { k: "startDate", label: "Start date", ph: "1 November 2026" },
      { k: "annualCTC", label: "Annual CTC", ph: "12,00,000" },
    ],
    sections: [
      { h: "Parties & Role", t: (v) => `This agreement is between ${v.employerName || "Employer Pvt Ltd"} and ${v.employeeName || "Employee Name"}, appointed as ${v.designation || "Software Engineer"} effective ${v.startDate || "1 November 2026"}.` },
      { h: "Compensation", t: (v) => `The Employee shall be paid a gross annual compensation of Rs. ${v.annualCTC || "12,00,000"}, payable monthly.` },
    ],
    clauses: [
      { id: "c_noncompete", title: "Post-resignation non-compete (12 months)", rec: false, flag: "review", note: "Section 27, Indian Contract Act 1872 renders post-employment restraints void in India — this clause is not enforceable as drafted and is included only where the employer insists.", text: (v) => `The Employee shall not join a competing business for 12 months after resignation within ${v.restrictedTerritory || "Bengaluru Urban district"}.` },
      { id: "c_confidentiality", title: "Confidentiality — indefinite", rec: true, note: "Confidentiality obligations (as opposed to non-competes) are enforceable indefinitely and are standard.", text: () => `The Employee shall keep confidential information secret indefinitely, including after termination.` },
      { id: "c_nonsolicit", title: "Non-solicitation of clients (12 months)", rec: true, note: "Narrower than a non-compete and more likely to be enforced as a reasonable restraint on trade secrets/goodwill.", text: () => `The Employee shall not solicit the Employer's clients for 12 months after termination.` },
    ],
  },
  {
    id: "nda", cat: "Commercial", name: "Mutual NDA", blurb: "A mutual non-disclosure agreement for commercial discussions.", pages: 3, fee: 0, gov: 100,
    stamp: "",
    fields: [
      { k: "partyA", label: "Party A", ph: "Company A Pvt Ltd" },
      { k: "partyB", label: "Party B", ph: "Company B Pvt Ltd" },
      { k: "effectiveDate", label: "Effective date", ph: "1 October 2026" },
      { k: "purpose", label: "Purpose", ph: "evaluating a potential business relationship", wide: true },
    ],
    sections: [
      { h: "Parties", t: (v) => `This mutual non-disclosure agreement is between ${v.partyA || "Company A Pvt Ltd"} and ${v.partyB || "Company B Pvt Ltd"}, effective ${v.effectiveDate || "1 October 2026"}.` },
      { h: "Purpose", t: (v) => `The parties wish to exchange confidential information for the purpose of ${v.purpose || "evaluating a potential business relationship"}.` },
    ],
    clauses: [
      { id: "c_ndaterm", title: "Term — 3 years", rec: true, note: "3 years is the common market position for commercial (non-trade-secret) NDAs.", text: () => `Confidentiality obligations survive for 3 years from disclosure.` },
      { id: "c_ndacarveout", title: "Unilateral carve-out for Party A", rec: false, flag: "review", note: "Favors Party A by narrowing only their obligations, not Party B's — a deviation from the mutual baseline.", text: () => `Party A's obligations under this agreement are waived where disclosure is made to its affiliates.` },
    ],
  },
  {
    id: "notice", cat: "Litigation", name: "Demand Notice", blurb: "A formal demand / cease-and-desist notice.", pages: 2, fee: 0, gov: 0,
    stamp: "",
    fields: [
      { k: "recipientName", label: "Recipient name", ph: "Recipient Name" },
      { k: "recipientAddress", label: "Recipient address", ph: "Recipient Address", wide: true },
      { k: "demandAction", label: "Demand", ph: "pay the outstanding amount of Rs. 1,00,000", wide: true },
      { k: "noticePeriodDays", label: "Notice period (days)", ph: "15" },
    ],
    sections: [
      { h: "To", t: (v) => `To: ${v.recipientName || "Recipient Name"}, ${v.recipientAddress || "Recipient Address"}` },
      { h: "Demand", t: (v) => `You are hereby called upon to ${v.demandAction || "pay the outstanding amount of Rs. 1,00,000"} within ${v.noticePeriodDays || "15"} days of receipt of this notice, failing which our client shall be constrained to initiate appropriate legal proceedings without further notice.` },
    ],
    clauses: [
      { id: "c_reservation", title: "Reservation of rights", rec: true, note: "Standard boilerplate protecting the sender's other legal options.", text: () => `This notice is issued without prejudice to any other right or remedy available to our client under law.` },
    ],
  },
];

export const CORPUS = [
  { id: "cor1", name: "Bare Acts", detail: "Central & state acts", count: "742", asOf: "14 Aug 2026" },
  { id: "cor2", name: "Supreme Court", detail: "Reported judgments", count: "48,910", asOf: "14 Aug 2026" },
  { id: "cor3", name: "High Courts", detail: "Reported judgments", count: "3.1M", asOf: "14 Aug 2026" },
  { id: "cor4", name: "Rules & notifications", detail: "Central & state rules", count: "62,400", asOf: "14 Aug 2026" },
];

// The 7 seeded authorities behind the citation markers in RESEARCH answers below.
export const CITES = {
  1: { kind: "Statute", kindLabel: "CENTRAL ACT · IN FORCE", title: "Indian Contract Act 1872, s.27", short: "Contract Act 1872, s.27", meta: "Agreement in restraint of trade, void", treatment: "IN FORCE", chunk: "ica-1872/s27/0", para: "s.27", passage: "Every agreement by which any one is restrained from exercising a lawful profession, trade or business of any kind, is to that extent void.", plain: "A clause stopping someone from working in their trade or profession is void, with narrow exceptions." },
  2: { kind: "Case", kindLabel: "SUPREME COURT OF INDIA", title: "Niranjan Shankar Golikari v. Century Spinning & Mfg. Co. (1967) 2 SCR 378", short: "Golikari v. Century Spinning (1967)", meta: "Restraint during vs after employment", treatment: "GOOD LAW · FOLLOWED", chunk: "golikari-1967/p24", para: "para 24", passage: "A restrictive covenant operative during the term of employment is generally valid, whereas a covenant that restrains the employee's freedom after the termination of employment is void under Section 27, unless it falls within a recognised exception.", plain: "Restrictions while you're still employed are usually fine; restrictions after you leave are void." },
  3: { kind: "Case", kindLabel: "SUPREME COURT OF INDIA", title: "Superintendence Co. of India v. Krishan Murgai (1981) 2 SCC 246", short: "Superintendence Co. v. Murgai (1981)", meta: "Post-employment negative covenant", treatment: "GOOD LAW · FOLLOWED", chunk: "murgai-1981/p16", para: "para 16", passage: "A negative covenant restraining an employee from competing after the termination of employment is void under Section 27 of the Indian Contract Act, and this is so even where the covenant is limited as to time, place or space.", plain: "Even a narrow, reasonable post-employment non-compete is still void in India." },
  4: { kind: "Case", kindLabel: "SUPREME COURT OF INDIA", title: "Percept D'Mark (India) Pvt Ltd v. Zaheer Khan (2006) 4 SCC 227", short: "Percept D'Mark v. Zaheer Khan (2006)", meta: "Partial vs total restraint", treatment: "GOOD LAW · FOLLOWED", chunk: "percept-2006/p45", para: "para 45", passage: "Section 27 makes no distinction between a partial and a total restraint of trade — a restraint operating after the term of the contract is void even if reasonable, save the exceptions expressly carved out by the Act.", plain: "It doesn't matter if the restriction is narrow or reasonable — post-contract restraints are still void." },
  5: { kind: "Case", kindLabel: "SUPREME COURT OF INDIA", title: "Gujarat Bottling Co. v. Coca Cola Co. (1995) 5 SCC 545", short: "Gujarat Bottling v. Coca Cola (1995)", meta: "Restraint during subsisting contract", treatment: "GOOD LAW · FOLLOWED", chunk: "gujbot-1995/p31", para: "para 31", passage: "Negative covenants operative during the subsistence of a contract, when the contracting party has bound himself to serve the other exclusively, are not ordinarily regarded as restraint of trade.", plain: "Exclusivity clauses that apply only while the contract is running are generally enforceable." },
  6: { kind: "Case", kindLabel: "DELHI HIGH COURT", title: "Wipro Ltd v. Beckman Coulter International (2006) 131 DLT 681", short: "Wipro v. Beckman Coulter (2006)", meta: "Non-solicitation vs non-compete", treatment: "GOOD LAW · FOLLOWED", chunk: "wipro-2006/p19", para: "para 19", passage: "A distinction must be drawn between a covenant restraining solicitation of clients, which may be enforceable as protecting goodwill, and a covenant restraining competition generally, which falls foul of Section 27.", plain: "Non-solicitation clauses are treated differently from broad non-compete clauses, and can survive." },
  7: { kind: "Case", kindLabel: "SUPREME COURT OF INDIA", title: "Govt. of Maharashtra v. Borse Brothers Engineers (2021) 6 SCC 460", short: "Maharashtra v. Borse Brothers (2021)", meta: "Limitation — condonation of delay", treatment: "GOOD LAW · FOLLOWED", chunk: "borse-2021/p52", para: "para 52", passage: "Delay in filing commercial appeals must be viewed strictly, and condonation ought to be the exception, not the rule, given the object of speedy resolution under the Commercial Courts Act.", plain: "Courts are strict about extending appeal deadlines in commercial matters." },
};

export const RAG_QUERIES = [
  {
    id: "r1", label: "Post-resignation non-compete", question: "Can my employer enforce a non-compete restraint after I resign from my job?",
    trail: [
      { n: 1, chunk: "ica-1872/s27/0", src: "Indian Contract Act 1872, s.27", score: 0.95, para: "s.27", text: "Every agreement by which any one is restrained from exercising a lawful profession, trade or business of any kind, is to that extent void." },
      { n: 2, chunk: "golikari-1967/p24", src: "Golikari v. Century Spinning (1967)", score: 0.91, para: "para 24", text: "A restrictive covenant... after termination of employment is void under Section 27..." },
      { n: 3, chunk: "murgai-1981/p16", src: "Superintendence Co. v. Murgai (1981)", score: 0.88, para: "para 16", text: "A negative covenant... void... even where the covenant is limited as to time, place or space." },
      { n: 4, chunk: "percept-2006/p45", src: "Percept D'Mark v. Zaheer Khan (2006)", score: 0.84, para: "para 45", text: "Section 27 makes no distinction between a partial and a total restraint of trade..." },
      { n: 5, chunk: "gujbot-1995/p31", src: "Gujarat Bottling v. Coca Cola (1995)", score: 0.71, para: "para 31", text: "Negative covenants operative during the subsistence of a contract... are not ordinarily regarded as restraint of trade." },
      { n: 6, chunk: "wipro-2006/p19", src: "Wipro v. Beckman Coulter (2006)", score: 0.68, para: "para 19", text: "A distinction must be drawn between a covenant restraining solicitation of clients... and a covenant restraining competition generally..." },
    ],
    discarded: 4,
    sections: [
      { h: "Short answer", paras: ["No. A restraint that stops you from working after you resign is void under Section 27 of the Indian Contract Act, 1872 [1], regardless of how narrow or reasonable it is [4]."] },
      { h: "The line the courts draw", paras: ["Restrictions that apply only while you are still employed are generally valid [2][5]. It is specifically post-employment restraints that fail [2][3]."] },
      { h: "What survives after exit", paras: ["Confidentiality obligations and narrowly-drawn non-solicitation of clients are treated differently from a blanket non-compete and can still be enforced [6]."] },
      { h: "Practical position", paras: ["Even if your employment agreement contains a 12-month non-compete, it is very unlikely to be enforceable against you in an Indian court [3][4]."] },
    ],
    timelineSubject: "Section 27 restraint-of-trade doctrine",
    timeline: [
      { year: "1872", title: "Indian Contract Act enacted", body: "Section 27 voids agreements in restraint of trade.", dot: "neutral" },
      { year: "1967", title: "Golikari v. Century Spinning", body: "Draws the during-vs-after-employment distinction.", dot: "good" },
      { year: "1980", title: "Superintendence Co. v. Murgai", body: "Confirms even narrow post-employment restraints are void.", dot: "good" },
      { year: "1995", title: "Gujarat Bottling v. Coca Cola", body: "Restraints during a subsisting contract upheld.", dot: "good" },
      { year: "2006", title: "Percept D'Mark v. Zaheer Khan", body: "No partial/total distinction — all post-contract restraints void.", dot: "good" },
      { year: "2006", title: "Wipro v. Beckman Coulter", body: "Non-solicitation distinguished from non-compete.", dot: "good" },
      { year: "Present", title: "No displacing authority", body: "The position has not been disturbed since.", dot: "neutral" },
    ],
  },
  {
    id: "r2", label: "Exclusivity during the contract term", question: "Is an exclusivity clause enforceable while my distribution contract is still running?",
    trail: [
      { n: 1, chunk: "gujbot-1995/p31", src: "Gujarat Bottling v. Coca Cola (1995)", score: 0.93, para: "para 31", text: "Negative covenants operative during the subsistence of a contract... are not ordinarily regarded as restraint of trade." },
      { n: 2, chunk: "ica-1872/s27/0", src: "Indian Contract Act 1872, s.27", score: 0.79, para: "s.27", text: "Every agreement by which any one is restrained... is to that extent void." },
      { n: 3, chunk: "golikari-1967/p24", src: "Golikari v. Century Spinning (1967)", score: 0.72, para: "para 24", text: "A restrictive covenant operative during the term of employment is generally valid..." },
    ],
    discarded: 2,
    sections: [
      { h: "Short answer", paras: ["Yes — an exclusivity clause that only applies while your contract is running is generally enforceable [1]."] },
      { h: "Why it's different from a non-compete", paras: ["Section 27 targets restraints that survive the contract [2]; the same reasoning that upholds during-employment restrictions applies here [3]."] },
    ],
    timelineSubject: "Exclusivity-during-term doctrine",
    timeline: [
      { year: "1872", title: "Indian Contract Act enacted", body: "Section 27 voids agreements in restraint of trade.", dot: "neutral" },
      { year: "1967", title: "Golikari v. Century Spinning", body: "During-term restrictions upheld.", dot: "good" },
      { year: "1995", title: "Gujarat Bottling v. Coca Cola", body: "Confirms exclusivity during a subsisting contract is enforceable.", dot: "good" },
      { year: "Present", title: "No displacing authority", body: "The position has not been disturbed since.", dot: "neutral" },
    ],
  },
  {
    id: "r3", label: "Section 37 appeal limitation (2025 amendment)", question: "What is the limitation period for a Section 37 appeal after the 2025 amendment?",
    trail: [], discarded: 3, notFound: true,
    notFoundBody: "The claimed 2025 amendment to Section 37 limitation is not present in the indexed corpus. The corpus's last indexed update on this subject is the Commercial Courts (Amendment) Act, 2021.",
    partials: [
      { text: "Delay in filing commercial appeals must be viewed strictly, and condonation ought to be the exception, not the rule [7].", cite: 7 },
      { text: "This reflects the position as of the 2021 Amendment Act — no 2025 amendment is indexed.", cite: null },
    ],
    sections: [],
    timelineSubject: "Section 37 limitation — what is indexed",
    timeline: [
      { year: "2015", title: "Commercial Courts Act enacted", body: "Establishes commercial court framework.", dot: "neutral" },
      { year: "2021", title: "Borse Brothers judgment", body: "Strict approach to condonation of delay confirmed.", dot: "good" },
      { year: "2025", title: "Claimed amendment — not found in corpus", body: "No indexed source supports this.", dot: "bad" },
    ],
  },
];

export const RESEARCH = {
  r1: {
    sections: [
      { h: "Short conclusion", body: "A post-resignation non-compete is void under Section 27 of the Indian Contract Act, 1872, regardless of how reasonable or narrow it is." },
      { h: "Applicable law", body: "Indian Contract Act 1872, Section 27." },
      { h: "Statutory provisions", body: "\"Every agreement by which any one is restrained from exercising a lawful profession, trade or business of any kind, is to that extent void.\"" },
      { h: "Relevant judgments", body: "Golikari (1967), Superintendence Co. v. Murgai (1981), Percept D'Mark v. Zaheer Khan (2006)." },
      { h: "How the law applies", body: "Courts consistently strike down restraints that operate after employment ends, drawing a firm line between during-term and post-term restrictions." },
      { h: "Conflicting legal views", body: "No significant conflict among High Courts on the core Section 27 principle for post-employment non-competes." },
      { h: "Current legal position", body: "Settled: post-employment non-competes are void; narrowly drawn confidentiality and non-solicitation clauses may survive." },
      { h: "Practical next steps", body: "Review whether the clause in question is a broad non-compete (unenforceable) or a narrower non-solicitation/confidentiality clause (may be enforceable)." },
      { h: "Missing facts & limitations", body: "This does not address trade-secret-specific injunctions, which can sometimes achieve a similar practical effect through a different legal route." },
      { h: "Verifiable primary sources", body: "Indian Contract Act 1872 (India Code); Golikari, Murgai and Percept D'Mark judgments (Indian Kanoon / SCC)." },
    ],
    authorities: [1, 2, 3, 4, 5, 6],
    conflict: { issue: "None significant", views: [], resolution: "The Section 27 post-employment restraint principle is uniformly applied." },
    amendment: { subject: "None — Section 27 is unamended since 1872", before: "—", after: "—", effective: "—", impact: "—" },
    adverse: [{ name: "None directly on point", court: "—", holding: "No authority upholds a post-employment non-compete against an employee.", why: "Section 27's language is broad and consistently applied.", strength: "Low" }],
    map: {
      nodes: [
        { id: 1, label: "s.27, 1872", kind: "statute", x: 60, y: 40 },
        { id: 2, label: "Golikari 1967", kind: "sc", x: 220, y: 40 },
        { id: 3, label: "Murgai 1981", kind: "sc", x: 380, y: 40 },
        { id: 4, label: "Percept 2006", kind: "sc", x: 380, y: 140 },
        { id: 5, label: "Gujarat Bottling 1995", kind: "sc", x: 220, y: 140 },
        { id: 6, label: "Wipro 2006", kind: "hc", x: 60, y: 140 },
      ],
      edges: [
        { from: 1, to: 2, label: "interprets" }, { from: 2, to: 3, label: "follows" },
        { from: 3, to: 4, label: "follows" }, { from: 1, to: 5, label: "interprets" },
        { from: 1, to: 6, label: "distinguishes" },
      ],
    },
    compare: { a: 3, b: 5, rows: [
      { aspect: "Restraint timing", a: "After employment ends", b: "During the contract term" },
      { aspect: "Outcome", a: "Void under s.27", b: "Enforceable" },
    ] },
  },
};

export const REVIEW_DOC = {
  name: "Vendor Services Agreement — Northline Distribution.pdf", type: "Vendor agreement", counterparty: "Northline Distribution Pvt Ltd",
  pages: 14, clausesFound: 22, scanned: "17 Sep 2026",
  findings: [
    { id: "f1", clause: "Limitation of liability", ref: "Cl. 9.2", found: "Liability capped at 1x the fees paid in the preceding 3 months.", baseline: "Balanced baseline caps liability at 12 months' fees.", why: "A 3-month cap significantly under-protects you relative to market practice.", ask: "Request the cap be raised to 12 months' fees.", cite: "", favors: "counterparty" },
    { id: "f2", clause: "Termination for convenience", ref: "Cl. 11.1", found: "Either party may terminate with 30 days' notice.", baseline: "Matches the balanced baseline.", why: "Mutual and reasonable.", ask: "", cite: "", favors: "balanced" },
    { id: "f3", clause: "Unilateral price revision", ref: "Cl. 4.3", found: "Vendor may revise pricing with 15 days' notice, no cap.", baseline: "Balanced baseline caps annual increases at a stated %.", why: "An uncapped unilateral price revision right is unusual and risky.", ask: "Request an annual cap (e.g. 8%) tied to a public index.", cite: "", favors: "counterparty" },
    { id: "f4", clause: "Governing law & jurisdiction", ref: "Cl. 14", found: "Bengaluru courts, Indian law.", baseline: "Matches the balanced baseline for a Bengaluru-based counterparty.", why: "Standard and appropriate.", ask: "", cite: "", favors: "balanced" },
  ],
};

export const PACK_CATEGORIES = [
  { id: "food", label: "Packaged food", extra: "FSSAI license, net quantity, best-before" },
  { id: "cosmetics", label: "Cosmetics", extra: "Batch number, manufacturing license" },
  { id: "electronics", label: "Electronics", extra: "BIS registration, energy label" },
];

export const PACK_SCAN = {
  product: "Verdanta Organic Muesli 500g", sku: "VF-0042", file: "muesli-artwork-v3.pdf", scanned: "17 Sep 2026", ruleset: "Packaged Food v1 (14 Aug 2026)",
  declarations: [
    { k: "Net quantity", found: "500g", rule: "LM(PC) Rules 2011, r.6", status: "pass" },
    { k: "MRP", found: "Rs. 249", rule: "LM(PC) Rules 2011, r.18", status: "pass" },
    { k: "FSSAI license", found: "10019022001234", rule: "FSSAI Act 2006, s.31", status: "pass" },
    { k: "Best before", found: "Not found on pack", rule: "FSS (Packaging) Regs 2011", status: "non_compliant", note: "Mandatory declaration missing from the back panel." },
  ],
  claims: [
    { text: "100% natural", body: "Needs substantiation for a processed food product.", ref: "CCPA Guidelines 2022, s.4", verdict: "needs_substantiation", safer: "Made with natural ingredients" },
    { text: "No added preservatives", body: "Defensible if verified against the ingredient list.", ref: "", verdict: "defensible", safer: "" },
  ],
  precedent: [
    { who: "A competing muesli brand", year: "2023", what: "Used \"100% natural\" without substantiation", outcome: "CCPA advisory issued, claim withdrawn" },
  ],
  drift: [
    { date: "1 Jan 2026", change: "Best-before format standardised to MM/YYYY", affects: "All SKUs approved before Jan 2026", severity: "medium" },
  ],
  portfolio: [
    { sku: "VF-0042", name: "Organic Muesli 500g", open: 1, status: "fail", pinned: "v1", recheck: "Add best-before declaration" },
    { sku: "VF-0018", name: "Organic Granola 250g", open: 0, status: "pass", pinned: "v1", recheck: "" },
  ],
};
