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
  const [lang, setLang] = useState(() => { try { return localStorage.getItem("samicus.lang") || "en"; } catch { return "en"; } });
  const [actAsClient, setActAsClientState] = useState(() => { try { return localStorage.getItem("samicus.asClient") === "1"; } catch { return false; } });
  const [handoff, setHandoff] = useState({}); // one-shot data passed between screens (e.g. assistant prefill)
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
    lang, toggleLang: () => setLang((l) => { const n = l === "en" ? "hi" : "en"; try { localStorage.setItem("samicus.lang", n); } catch { /* ignore */ } return n; }),
    actAsClient, setActAsClient: (v) => { setActAsClientState(v); try { localStorage.setItem("samicus.asClient", v ? "1" : "0"); } catch { /* ignore */ } },
    takeHandoff: (tab) => { const d = handoff[tab]; if (d) setHandoff((h) => { const { [tab]: _, ...rest } = h; return rest; }); return d; },
  }), [route, go, modal, toast, showToast, lang, actAsClient, handoff]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}
