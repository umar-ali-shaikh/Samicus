import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { ModalHost } from "../modals/ModalHost";
import { Toast } from "../components/ui";
import { WebFrame } from "./WebFrame";
import { Brand } from "../auth/AuthLayout";
import { useIsMobile } from "./useIsMobile";

function TopBar() {
  const { user, signOut } = useAuth();
  const { lang, toggleLang } = useUI();
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", padding: isMobile ? "10px 14px" : "12px 22px", background: "#0B1220", color: "#F6F1E8", position: "sticky", top: 0, zIndex: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <Brand light />
        {!isMobile && <span style={{ fontSize: 10, color: "#8A94A8", letterSpacing: "0.05em" }}>RESEARCH · DRAFT · REVIEW · COMPLY · RESOLVE</span>}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={toggleLang} title="Language for situation labels" style={{ background: "#182338", border: "1px solid #2A3854", borderRadius: 9, padding: "7px 12px", fontSize: 12, fontWeight: 600, color: "#F6F1E8", cursor: "pointer" }}>
          {lang === "en" ? "EN" : "हिं"}
        </button>
        {!isMobile && <span style={{ fontSize: 12, color: "#9AA5BC", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</span>}
        <button onClick={signOut} style={{ background: "transparent", border: "1px solid #2A3854", borderRadius: 9, padding: "7px 12px", fontSize: 12, fontWeight: 600, color: "#F6F1E8", cursor: "pointer" }}>Sign out</button>
      </div>
    </div>
  );
}

export function Shell() {
  const { toast } = useUI();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)", color: "var(--color-ink)", background: "var(--color-bg)" }}>
      <TopBar />
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <WebFrame />
      </div>
      <ModalHost />
      <Toast message={toast} />
    </div>
  );
}
