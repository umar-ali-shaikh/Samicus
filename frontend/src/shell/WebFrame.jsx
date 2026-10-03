import { useState } from "react";
import { useAppState } from "../state/AppState";
import { CLIENT_NAV, LAWYER_NAV, ADMIN_NAV, FOUNDER_NAV } from "./navConfig";
import { TabRouter } from "./TabRouter";
import { useIsMobile } from "./useIsMobile";
import { AvatarTile, Badge } from "../components/ui";

const ROLE_CAPTION = { client: "CLIENT", lawyer: "ADVOCATE", admin: "TRUST & VERIFICATION", founder: "FOUNDER" };
const ROLE_AVATAR = { client: (biz) => (biz ? "VF" : "MR"), lawyer: () => "RI", admin: () => "PO", founder: () => "SM" };
const ROLE_NAME = { client: (biz) => (biz ? "Verdanta Foods" : "Meera Raghavan"), lawyer: () => "Adv. Rohan Iyer", admin: () => "Priya Ops", founder: () => "Founder" };

function NavRail({ nav, state, act, onNavigate }) {
  const isBusiness = state.account === "business";
  return (
    <div style={{ width: 224, flex: "none", height: "100%", background: "var(--color-navy)", color: "#F6F1E8", display: "flex", flexDirection: "column", padding: "20px 14px", gap: 20, overflowY: "auto", boxSizing: "border-box" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 8px" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#8A94A8" }}>{ROLE_CAPTION[state.view]}</span>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 15 }}>{ROLE_NAME[state.view](isBusiness)}</span>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, overflowY: "auto" }}>
        {nav.map((item) => (
          <button
            key={item.tab}
            onClick={() => { act.go(item.tab); onNavigate?.(); }}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left",
              padding: "9px 12px", borderRadius: 9, fontSize: 13.5, border: "none", cursor: "pointer",
              color: state.tab === item.tab ? "#fff" : "#9AA5BC", background: state.tab === item.tab ? "#1D2A44" : "transparent",
              fontWeight: state.tab === item.tab ? 600 : 500,
            }}
          >
            {item.label}
            {item.badge && <Badge tone="danger">{item.badge}</Badge>}
          </button>
        ))}
      </nav>
      {state.view === "client" && (
        <button onClick={() => { act.openUrgent(); onNavigate?.(); }} style={{ background: "#DB4F35", color: "#fff", border: "none", borderRadius: 9, padding: "10px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Urgent help</button>
      )}
      <div style={{ fontSize: 10, color: "#8A94A8", lineHeight: 1.5 }}>Samicus is a technology platform. It does not practise law and does not guarantee outcomes.</div>
    </div>
  );
}

export function WebFrame() {
  const { state, act } = useAppState();
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);
  const isBusiness = state.account === "business";
  const nav = { client: CLIENT_NAV(isBusiness), lawyer: LAWYER_NAV, admin: ADMIN_NAV, founder: FOUNDER_NAV }[state.view];

  return (
    <div style={{ width: "100%", maxWidth: 1400, display: "flex", background: "var(--color-surface)", position: "relative", minHeight: "calc(100vh - 60px)" }}>
      {!isMobile && <NavRail nav={nav} state={state} act={act} />}

      {isMobile && navOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex" }}>
          <div onClick={() => setNavOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(16,26,44,.5)" }} />
          <div style={{ position: "relative", height: "100%", boxShadow: "0 0 40px rgba(0,0,0,.3)" }}>
            <NavRail nav={nav} state={state} act={act} onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "10px 14px" : "12px 20px", borderBottom: "1px solid var(--color-border)", background: "#FDFBF7", gap: 10, flexWrap: "wrap" }}>
          {isMobile && (
            <button onClick={() => setNavOpen(true)} aria-label="Open menu" style={{ background: "none", border: "1px solid var(--color-border)", borderRadius: 8, width: 36, height: 36, fontSize: 16, cursor: "pointer", flex: "none" }}>☰</button>
          )}
          {state.view === "client" ? (
            <div style={{ display: "flex", gap: 2, background: "#F1EFE6", borderRadius: 9, padding: 3 }}>
              {[["individual", "Meera Raghavan"], ["business", "Verdanta Foods"]].map(([id, label]) => (
                <button key={id} onClick={() => act.setAccount(id)} style={{ background: state.account === id ? "var(--color-navy)" : "transparent", color: state.account === id ? "#fff" : "var(--color-ink)", border: "none", borderRadius: 7, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{isMobile ? label.split(" ")[0] : label}</button>
              ))}
            </div>
          ) : <div />}
          <input
            placeholder="Ask Samicus…"
            onKeyDown={(e) => { if (e.key === "Enter") { act.askSamicus(e.target.value); e.target.value = ""; } }}
            style={{ flex: 1, minWidth: 120, maxWidth: 360, padding: "9px 14px", borderRadius: 999, border: "1px solid var(--color-border)", fontSize: 12.5 }}
          />
          <AvatarTile initials={ROLE_AVATAR[state.view](isBusiness)} size={32} />
        </div>
        <div style={{ flex: 1, padding: isMobile ? 14 : 22, overflowY: "auto" }}>
          <TabRouter />
        </div>
      </div>
    </div>
  );
}
