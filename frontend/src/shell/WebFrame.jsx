import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { CLIENT_NAV, LAWYER_NAV, ADMIN_NAV, FOUNDER_NAV, viewFor } from "./navConfig";
import { TabRouter } from "./TabRouter";
import { useIsMobile } from "./useIsMobile";
import { AvatarTile } from "../components/ui";
import { initials } from "../lib/format";
import { useGet } from "../api/hooks";

const ROLE_CAPTION = { client: "CLIENT", lawyer: "ADVOCATE", admin: "TRUST & VERIFICATION", founder: "FOUNDER" };

function NavRail({ nav, view, onNavigate }) {
  const { user, advocate, activeAccount } = useAuth();
  const { tab, go, openModal, actAsClient, setActAsClient } = useUI();
  const unread = useGet("/threads", undefined, { refetchInterval: 20000, enabled: view === "client" || view === "lawyer" });
  const unreadCount = (unread.data || []).reduce((n, t) => n + (t.unread || 0), 0);

  return (
    <div style={{ width: 224, flex: "none", height: "100%", background: "var(--color-navy)", color: "#F6F1E8", display: "flex", flexDirection: "column", padding: "20px 14px", gap: 20, overflowY: "auto", boxSizing: "border-box" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 8px" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#8A94A8" }}>{ROLE_CAPTION[view]}</span>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 15 }}>{view === "client" ? activeAccount?.display_name?.replace(/\s*\([0-9a-f]{6}\)$/, "") : user?.full_name}</span>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, overflowY: "auto" }}>
        {nav.map((item) => (
          <button
            key={item.tab}
            onClick={() => { go(item.tab); onNavigate?.(); }}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left",
              padding: "9px 12px", borderRadius: 9, fontSize: 13.5, border: "none", cursor: "pointer",
              color: tab === item.tab ? "#fff" : "#9AA5BC", background: tab === item.tab ? "#1D2A44" : "transparent",
              fontWeight: tab === item.tab ? 600 : 500,
            }}
          >
            {item.label}
            {item.tab === "messages" && unreadCount > 0 && (
              <span style={{ background: "#DB4F35", color: "#fff", borderRadius: 999, fontSize: 10.5, fontWeight: 700, padding: "1px 7px" }}>{unreadCount}</span>
            )}
          </button>
        ))}
      </nav>
      {user?.role === "advocate" && (
        <button onClick={() => { setActAsClient(!actAsClient); go(actAsClient ? "lawyer" : "home"); onNavigate?.(); }} style={{ background: "#182338", color: "#F6F1E8", border: "1px solid #2A3854", borderRadius: 9, padding: "9px 12px", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>
          {actAsClient ? "Switch to advocate mode" : "Switch to client mode"}
        </button>
      )}
      {view === "client" && advocate == null && user?.role === "client" && (
        <button onClick={() => { go("profile"); onNavigate?.(); }} style={{ background: "transparent", color: "#9AA5BC", border: "1px dashed #2A3854", borderRadius: 9, padding: "9px 12px", fontSize: 12, cursor: "pointer" }}>
          Are you an advocate? Apply to list
        </button>
      )}
      {view === "client" && (
        <button onClick={() => { openModal("urgent"); onNavigate?.(); }} style={{ background: "#DB4F35", color: "#fff", border: "none", borderRadius: 9, padding: "10px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Urgent help</button>
      )}
      <div style={{ fontSize: 10, color: "#8A94A8", lineHeight: 1.5 }}>Samicus is a technology platform. It does not practise law and does not guarantee outcomes.</div>
    </div>
  );
}

export function WebFrame() {
  const { user, accounts, activeAccount, setActiveAccountId } = useAuth();
  const { tab, go, actAsClient } = useUI();
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);
  const view = viewFor(user, actAsClient);
  const isBusiness = activeAccount?.type === "business";
  const nav = { client: CLIENT_NAV(isBusiness), lawyer: LAWYER_NAV, admin: ADMIN_NAV, founder: FOUNDER_NAV }[view];

  // Land on the role's home when the URL points somewhere this role can't go.
  useEffect(() => {
    if (!nav.some((n) => n.tab === tab)) go(nav[0].tab);
  }, [tab, nav, go]);

  return (
    <div style={{ width: "100%", maxWidth: 1400, display: "flex", background: "var(--color-surface)", position: "relative", minHeight: "calc(100vh - 60px)" }}>
      {!isMobile && <NavRail nav={nav} view={view} />}

      {isMobile && navOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex" }}>
          <div onClick={() => setNavOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(16,26,44,.5)" }} />
          <div style={{ position: "relative", height: "100%", boxShadow: "0 0 40px rgba(0,0,0,.3)" }}>
            <NavRail nav={nav} view={view} onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "10px 14px" : "12px 20px", borderBottom: "1px solid var(--color-border)", background: "#FDFBF7", gap: 10, flexWrap: "wrap" }}>
          {isMobile && (
            <button onClick={() => setNavOpen(true)} aria-label="Open menu" style={{ background: "none", border: "1px solid var(--color-border)", borderRadius: 8, width: 36, height: 36, fontSize: 16, cursor: "pointer", flex: "none" }}>☰</button>
          )}
          {view === "client" && accounts.length > 1 ? (
            <select value={activeAccount?.id || ""} onChange={(e) => setActiveAccountId(e.target.value)} aria-label="Active account" style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--color-border)", fontSize: 12.5, fontWeight: 600, background: "#fff", maxWidth: 280 }}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.display_name.replace(/\s*\([0-9a-f]{6}\)$/, "")} · {a.type}</option>)}
            </select>
          ) : <div />}
          {(view === "client" || view === "lawyer") && (
            <input
              placeholder="Ask Samicus a legal question…"
              onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { go("legalassistant", "", { question: e.target.value.trim() }); e.target.value = ""; } }}
              style={{ flex: 1, minWidth: 120, maxWidth: 360, padding: "9px 14px", borderRadius: 999, border: "1px solid var(--color-border)", fontSize: 12.5 }}
            />
          )}
          {user?.avatar_url
            ? <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" width={32} height={32} style={{ borderRadius: 11, flex: "none" }} />
            : <AvatarTile initials={initials(user?.full_name)} size={32} />}
        </div>
        <div style={{ flex: 1, padding: isMobile ? 14 : 22, overflowY: "auto" }}>
          <TabRouter view={view} />
        </div>
      </div>
    </div>
  );
}
