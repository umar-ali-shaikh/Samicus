import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const UIContext = createContext(null);

function readHash() {
  const [tab = "", ...rest] = window.location.hash.replace(/^#\/?/, "").split("/");
  return { tab, param: rest.join("/") || "" };
}

export function UIProvider({ children }) {
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
  const timer = useRef(null);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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
    lang, toggleLang: () => setLang((l) => { const n = l === "en" ? "hi" : "en"; try { localStorage.setItem("vidhira.lang", n); } catch { /* ignore */ } return n; }),
    actAsClient, setActAsClient: (v) => { setActAsClientState(v); try { localStorage.setItem("vidhira.asClient", v ? "1" : "0"); } catch { /* ignore */ } },
    takeHandoff: (tab) => { const d = handoff[tab]; if (d) setHandoff((h) => { const { [tab]: _, ...rest } = h; return rest; }); return d; },
    assistantTurns, setAssistantTurns, assistantSessionId, setAssistantSessionId,
  }), [route, go, modal, toast, showToast, lang, actAsClient, handoff, assistantTurns, assistantSessionId]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}
