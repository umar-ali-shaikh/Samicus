import { createContext, useContext, useRef, useState } from "react";
import {
  LAWYERS, MATTERS, TASKS, DOCUMENTS, THREADS, ACCESS_ROWS, NOTIFICATIONS,
  VERIF_QUEUE, TEMPLATES, FAVORS, RAG_QUERIES, QNA,
} from "../data/mockData";

const AppStateContext = createContext(null);

const PLATFORM_FEE = 99;
const GST_RATE = 0.18;
export function computeFees(fee) {
  const gst = Math.round((fee + PLATFORM_FEE) * GST_RATE);
  return { fee, platformFee: PLATFORM_FEE, gst, total: fee + PLATFORM_FEE + gst };
}

const initialState = {
  view: "client", lang: "en", account: "business", tab: "home",
  intake: "", search: "", filters: {}, availableOnly: false,
  matterId: "vf1", matterTab: "Timeline", docFilter: "All", threadId: "th1",
  tasksDone: {}, shared: {}, access: {}, notif: {}, approved: {}, uploads: [], sent: [],
  online: true, conflictRun: false, memberAdded: false,
  routedCategory: "Contract & commercial recovery",
  draft: { templateId: "rental", step: 1, fields: {}, clauses: {}, custom: "", reviewed: false },
  qnaOpen: "q1", askText: "",
  ragActive: "r1", ragStage: "answer", ragOpenChunk: "",
  resTool: "Answer",
  revStage: "done", revFilter: "All",
  packStage: "done", packCat: "food", packTab: "Declarations", packFixed: {},
  talkNow: { stage: "setup", fields: {}, lawyerId: "rohan" },
  modal: null, bookStep: 1, booking: {}, urgentStep: 0, urgentCat: "", payMethod: "upi", consent: false,
  payAmount: "₹42,000", lawyerModalId: "rohan", serviceId: "notice", quoteLawyerId: "rohan",
  toast: "",
};

export function AppStateProvider({ children }) {
  const [state, setState] = useState(initialState);
  const toastTimer = useRef(null);
  const matchTimers = useRef([]);

  function set(patch) {
    setState((s) => (typeof patch === "function" ? { ...s, ...patch(s) } : { ...s, ...patch }));
  }

  function showToast(message) {
    set({ toast: message });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => set({ toast: "" }), 4200);
  }

  const act = {
    // Navigation
    go: (tab) => set({ tab }),
    openMatter: (id) => set({ tab: "matters", matterId: id, matterTab: "Timeline" }),
    setMatterTab: (label) => set({ matterTab: label }),
    setAccount: (id) => set({ account: id, matterId: id === "business" ? "vf1" : "mr1" }),
    setView: (v) => set({ view: v, tab: v === "lawyer" ? "lawyer" : v === "admin" ? "admin" : v === "founder" ? "founder" : "home" }),
    setLang: () => set((s) => ({ lang: s.lang === "en" ? "hi" : "en" })),

    // Intake / routing
    setIntake: (v) => set({ intake: v }),
    voice: () => showToast("Recordings stay encrypted and are never shared without consent."),
    routeSituation: (situation) => {
      set({ routedCategory: situation.area, modal: "booking", bookStep: 1, booking: { situationId: situation.id, routedCategory: situation.area } });
    },

    // Modals
    openBooking: (lawyerId) => {
      if (lawyerId) set({ modal: "booking", bookStep: 7, booking: { lawyerId } });
      else set({ modal: "booking", bookStep: 1, booking: {} });
    },
    openUrgent: () => set({ modal: "urgent", urgentStep: 0, urgentCat: "" }),
    openLawyer: (id) => set({ modal: "lawyer", lawyerModalId: id }),
    openService: (id) => set({ modal: "service", serviceId: id }),
    openQuote: (id) => set({ modal: "quote", quoteLawyerId: id || "rohan" }),
    openPay: (amount) => set({ modal: "pay", payAmount: amount }),
    closeModal: () => set({ modal: null }),

    // Booking wizard
    setBookStep: (n) => set({ bookStep: n }),
    setBooking: (patch) => set((s) => ({ booking: { ...s.booking, ...patch } })),
    setConsent: (v) => set({ consent: v }),
    setPayMethod: (v) => set({ payMethod: v }),
    confirmBooking: () => {
      showToast("Payment received. Held in escrow until the consultation completes.");
      set({ bookStep: 10 });
    },

    // Search / filter
    setSearch: (v) => set({ search: v }),
    setFilter: (k, v) => set((s) => ({ filters: { ...s.filters, [k]: v } })),
    resetFilters: () => set({ filters: {}, search: "", availableOnly: false }),
    toggleAvailableOnly: () => set((s) => ({ availableOnly: !s.availableOnly })),

    // Matter workspace
    toggleTask: (id) => {
      set((s) => ({ tasksDone: { ...s.tasksDone, [id]: !s.tasksDone[id] } }));
      showToast("Task marked done. Your advocate is notified.");
    },
    toggleShare: (id, next) => {
      set((s) => ({ shared: { ...s.shared, [id]: next } }));
      showToast(next ? "Shared with the engaged advocate only." : "Access revoked. The advocate can no longer open this document.");
    },
    toggleAccess: (id, next) => {
      set((s) => ({ access: { ...s.access, [id]: next } }));
      showToast(next ? "Access granted." : "Revoked immediately. The audit log keeps a record.");
    },
    toggleNotif: (id, next) => set((s) => ({ notif: { ...s.notif, [id]: next } })),
    setDocFilter: (v) => set({ docFilter: v }),
    upload: (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const sizeKb = Math.round(file.size / 1024);
      set((s) => ({ uploads: [{ id: `u${s.uploads.length + 1}`, ext: file.name.split(".").pop().toUpperCase(), name: file.name, meta: `${sizeKb} KB`, kind: "Evidence", shared: false }, ...s.uploads] }));
      showToast("Uploaded. Stays private until you share it.");
    },
    setThread: (id) => set({ threadId: id }),
    send: (body) => {
      if (!body?.trim()) { showToast("Type a message first."); return; }
      set((s) => ({ sent: [...s.sent, { threadId: s.threadId, body, when: "Just now", me: true }] }));
    },

    // Account / team
    addMember: () => {
      set({ memberAdded: true });
      showToast("Invitation sent.");
    },

    // Lawyer / admin
    runConflict: () => {
      set({ conflictRun: true });
      showToast("Conflict check clear against 2,411 existing clients. Facts can now be disclosed.");
    },
    acceptRequest: () => showToast("Secure room opens. A matter has been created."),
    approveAdvocate: (id) => {
      set((s) => ({ approved: { ...s.approved, [id]: true } }));
      showToast("Advocate approved and listed. Enrolment record archived for audit.");
    },

    // Talk now
    setTalkField: (k, v) => set((s) => ({ talkNow: { ...s.talkNow, fields: { ...s.talkNow.fields, [k]: v } } })),
    startMatch: () => {
      set((s) => ({ talkNow: { ...s.talkNow, stage: "searching" } }));
      matchTimers.current.push(setTimeout(() => set((s) => ({ talkNow: { ...s.talkNow, stage: "reviewing" } })), 2000));
      matchTimers.current.push(setTimeout(() => set((s) => ({ talkNow: { ...s.talkNow, stage: "matched" } })), 4200));
    },
    cancelMatch: () => { matchTimers.current.forEach(clearTimeout); set((s) => ({ talkNow: { ...s.talkNow, stage: "setup" } })); },
    talkNowWith: (lawyerId) => set((s) => ({ tab: "talknow", modal: null, talkNow: { ...s.talkNow, stage: "matched", lawyerId } })),
    connectNow: () => {
      showToast("Recording is off by default.");
      set((s) => ({ talkNow: { ...s.talkNow, stage: "live" } }));
    },
    convertMatter: () => {
      showToast("Converted to a tracked matter. Notes and documents carried over.");
      set((s) => ({ tab: "matters", matterId: "vf1", talkNow: { ...s.talkNow, stage: "setup" } }));
    },

    // Drafting
    setDraftTemplate: (id) => set((s) => ({ draft: { ...s.draft, templateId: id, step: 2, fields: {}, clauses: {}, custom: "" } })),
    setDraftStep: (n) => set((s) => ({ draft: { ...s.draft, step: n } })),
    setDraftField: (k, v) => set((s) => ({ draft: { ...s.draft, fields: { ...s.draft.fields, [k]: v } } })),
    toggleClause: (id) => set((s) => ({ draft: { ...s.draft, clauses: { ...s.draft.clauses, [id]: !s.draft.clauses[id] } } })),
    addRecommended: () => {
      const tpl = TEMPLATES.find((t) => t.id === state.draft.templateId);
      const patch = {};
      tpl.clauses.filter((c) => c.rec).forEach((c) => { patch[c.id] = true; });
      set((s) => ({ draft: { ...s.draft, clauses: { ...s.draft.clauses, ...patch } } }));
    },
    setCustomClause: (v) => set((s) => ({ draft: { ...s.draft, custom: v } })),
    downloadDraft: () => showToast("Generating DOCX and PDF…"),
    sendForReview: () => { set((s) => ({ draft: { ...s.draft, reviewed: true } })); showToast("Sent for advocate review · ₹1,499"); },
    eStamp: () => {
      const tpl = TEMPLATES.find((t) => t.id === state.draft.templateId);
      set({ modal: "pay", payAmount: `₹${tpl.gov}` });
    },

    // Research / Vidhira
    runRag: (id) => { set({ ragStage: "retrieving" }); setTimeout(() => set({ ragActive: id, ragStage: "answer", ragOpenChunk: "" }), 1100); },
    openChunk: (n) => set({ ragOpenChunk: n }),
    askSamicus: (text) => {
      const lower = (text || "").toLowerCase();
      let target = "r1";
      if (/(non.?compete|employment|resign|job|employer)/.test(lower)) target = "r1";
      else if (/(exclusiv|distribution|contract term)/.test(lower)) target = "r2";
      else if (/(section 37|limitation|appeal|amendment)/.test(lower)) target = "r3";
      else { target = "r3"; }
      set({ tab: "research" });
      act.runRag(target);
    },
    setResTool: (v) => set({ resTool: v }),
    exportResearch: () => showToast("Research note exported."),
    flagCitation: (name) => showToast(`Flagged "${name}" for human review.`),

    // Contract review
    setRevFilter: (v) => set({ revFilter: v }),
    rescanContract: () => { set({ revStage: "scanning" }); setTimeout(() => set({ revStage: "done" }), 1400); },
    exportRedline: () => showToast("Redline and negotiation note exported."),
    reviewWithAdvocate: () => set({ modal: "quote", quoteLawyerId: "rohan" }),

    // Pack compliance
    setPackCat: (v) => set({ packCat: v }),
    setPackTab: (v) => set({ packTab: v }),
    rescanPack: () => { set({ packStage: "scanning" }); setTimeout(() => set({ packStage: "done" }), 1500); },
    markFixed: (k) => { set((s) => ({ packFixed: { ...s.packFixed, [k]: true } })); showToast("Marked as corrected — pending re-scan."); },
    exportPackReport: () => showToast("Compliance report exported for sign-off."),

    // Community / learn
    setAsk: (v) => set({ askText: v }),
    submitAsk: () => { set({ askText: "" }); showToast("Posted anonymously. You'll usually get an answer within 12 hours."); },
    openQna: (id) => set({ qnaOpen: id }),
    pickSpecialisation: (label) => set({ tab: "find", search: label }),
    openFirm: () => showToast("Firm profile opened."),
    openGuide: () => showToast("Guide opened."),

    showToast,
    set,
  };

  return <AppStateContext.Provider value={{ state, set, act }}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
