import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { TAB_ALIASES } from "../shell/navConfig";

const UIContext = createContext(null);

function readHash() {
  const [rawTab = "", ...rest] = window.location.hash.replace(/^#\/?/, "").split("/");
  const tab = TAB_ALIASES[rawTab] || rawTab;
  return { tab, param: rest.join("/") || "" };
}

export function UIProvider({ children }) {
  const { status } = useAuth();
  const [route, setRoute] = useState(readHash);
  const [modal, setModal] = useState(null); // { name, props }
  const [toast, setToast] = useState("");
  const [lang, setLang] = useState(() => { try { return localStorage.getItem("vidhira.lang") || "en"; } catch { return "en"; } });
  const [actAsClient, setActAsClientState] = useState(() => { try { return localStorage.getItem("vidhira.asClient") === "1"; } catch { return false; } });
  const [handoff, setHandoff] = useState({}); // one-shot data passed between screens (e.g. assistant prefill)
  // Lives here (not in LegalAssistant's own state) so the conversation survives switching
  // tabs and coming back — TabRouter fully unmounts the screen on every tab change, and this
  // provider is the nearest ancestor that doesn't. Only "New conversation" should clear it.
  const [assistantTurns, setAssistantTurns] = useState([]);
  const [assistantSessionId, setAssistantSessionId] = useState(null);
  // Research library — same reasoning: TabRouter unmounts the screen on every tab change,
  // so the search box's typed-but-not-submitted text has to live up here to survive
  // navigating away and back. (Submitted searches/reports are keyed by id in the URL hash
  // instead — ResearchReport/JudgmentReader reload by id, no UI-state persistence needed.)
  const [researchQuestion, setResearchQuestion] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    // go() below already scrolls to top for in-app navigation — this covers the hash
    // changing WITHOUT going through go() (browser Back/Forward, or a hand-typed/pasted
    // #hash URL), which previously left the scroll position wherever it was on the old page.
    const onHash = () => {
      setRoute(readHash());
      window.scrollTo?.(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // This provider sits ABOVE the signed-in/signed-out switch (see App.jsx), so it never
  // unmounts across a sign-out/sign-in cycle — without this, a second person signing in on
  // the same shared device would see the first person's AI Legal Assistant conversation
  // and research search box still sitting here in memory, even after localStorage was wiped.
  useEffect(() => {
    if (status !== "signed_out") return;
    setAssistantTurns([]);
    setAssistantSessionId(null);
    setResearchQuestion("");
    setHandoff({});
    setModal(null);
    setLang("en");
    setActAsClientState(false);
  }, [status]);

  const go = useCallback((tab, param = "", data) => {
    if (data) setHandoff((h) => ({ ...h, [tab]: data }));
    const next = `#${tab}${param ? `/${param}` : ""}`;
    if (window.location.hash === next) setRoute({ tab, param }); else window.location.hash = next;
    setModal(null);
    window.scrollTo?.(0, 0);
  }, []);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4500);
  }, []);

  const value = useMemo(() => ({
    tab: route.tab, param: route.param, go,
    modal, openModal: (name, props = {}) => setModal({ name, props }), closeModal: () => setModal(null),
    toast, showToast,
    // "lang" picks which of the (currently bilingual) situation labels show — "hi" shows
    // label_hi, everything else shows label_en (honest: there's no Hinglish/Marathi/Urdu
    // translation of that data yet, so those codes fall back to English rather than
    // faking a translation). setLang replaces the old two-way EN/HI-only toggle with a
    // real 5-option menu (see Shell.jsx's LanguageMenu).
    lang, setLang: (code) => { setLang(code); try { localStorage.setItem("vidhira.lang", code); } catch { /* ignore */ } },
    actAsClient, setActAsClient: (v) => { setActAsClientState(v); try { localStorage.setItem("vidhira.asClient", v ? "1" : "0"); } catch { /* ignore */ } },
    handoff,
    takeHandoff: (tab) => { const d = handoff[tab]; if (d) setHandoff((h) => { const { [tab]: _, ...rest } = h; return rest; }); return d; },
    assistantTurns, setAssistantTurns, assistantSessionId, setAssistantSessionId,
    researchQuestion, setResearchQuestion,
  }), [route, go, modal, toast, showToast, lang, actAsClient, handoff, assistantTurns, assistantSessionId, researchQuestion]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}
