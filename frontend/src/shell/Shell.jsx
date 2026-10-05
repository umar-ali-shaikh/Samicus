import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { ModalHost } from "../modals/ModalHost";
import { AvatarTile, Toast } from "../components/ui";
import { WebFrame } from "./WebFrame";
import { Brand } from "../auth/AuthLayout";
import { useIsMobile } from "./useIsMobile";
import { viewFor } from "./navConfig";
import { initials } from "../lib/format";

const ROLE_CAPTION = { client: "Client", lawyer: "Advocate", admin: "Trust & verification", founder: "Founder" };

const LANGUAGE_OPTIONS = [
  ["en", "EN", "English"],
  ["hi", "हिं", "हिंदी"],
  ["hinglish", "Hgl", "Hinglish"],
  ["mr", "मरा", "मराठी"],
  ["ur", "اردو", "اردو"],
];

// Replaces the old silent EN/हिं-only toggle with a real 5-option menu. Only Hindi has an
// actual translated data source today (situations.label_hi) — picking Hinglish/Marathi/Urdu
// is honest about that: content shown in English rather than faking a translation that
// doesn't exist yet, same posture the rest of the app takes toward not inventing content.
function LanguageMenu() {
  const { lang, setLang } = useUI();
  const [open, setOpen] = useState(false);
  const current = LANGUAGE_OPTIONS.find(([code]) => code === lang) || LANGUAGE_OPTIONS[0];
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Language for situation labels"
        aria-label="Language"
        aria-haspopup="true"
        aria-expanded={open}
        style={{ background: "#182338", border: "1px solid #2A3854", borderRadius: 9, padding: "7px 12px", fontSize: 12, fontWeight: 600, color: "#F6F1E8", cursor: "pointer", minWidth: 44, minHeight: 36 }}
      >
        {current[1]}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
          <div role="menu" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50, background: "#fff", color: "var(--color-text)", borderRadius: 12, border: "1px solid var(--color-border)", boxShadow: "0 12px 32px rgba(10,16,28,.25)", padding: 6, minWidth: 160 }}>
            {LANGUAGE_OPTIONS.map(([code, , label]) => (
              <button
                key={code}
                role="menuitemradio"
                aria-checked={lang === code}
                onClick={() => { setLang(code); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "10px 12px", minHeight: 44, borderRadius: 8, border: "none",
                  background: lang === code ? "#F1EFE6" : "transparent", fontWeight: lang === code ? 700 : 500, fontSize: 13.5, cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { user, signOut } = useAuth();
  const { actAsClient } = useUI();
  const [open, setOpen] = useState(false);
  const view = viewFor(user, actAsClient);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Account menu" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}>
        {user?.avatar_url
          ? <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" width={32} height={32} style={{ borderRadius: 11 }} />
          : <AvatarTile initials={initials(user?.full_name)} size={32} />}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
          <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50, background: "#fff", color: "var(--color-text)", borderRadius: 12, border: "1px solid var(--color-border)", boxShadow: "0 12px 32px rgba(10,16,28,.25)", padding: 14, minWidth: 220 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A94A8", marginBottom: 2 }}>{ROLE_CAPTION[view]}</div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 15, marginBottom: 2 }}>{user?.full_name}</div>
            <div style={{ fontSize: 12.5, color: "#6B7488", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 10 }}>{user?.email}</div>
            <button onClick={signOut} style={{ width: "100%", background: "var(--color-navy)", border: "none", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, color: "#F6F1E8", cursor: "pointer" }}>Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}

function TopBar() {
  const { user } = useAuth();
  const { actAsClient, go } = useUI();
  const isMobile = useIsMobile();
  const view = viewFor(user, actAsClient);
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", padding: isMobile ? "10px 14px" : "12px 22px", background: "#0B1220", color: "#F6F1E8", position: "sticky", top: 0, zIndex: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, flex: "none" }}>
        <Brand light />
        {!isMobile && <span style={{ fontSize: 10, color: "#8A94A8", letterSpacing: "0.05em" }}>RESEARCH · DRAFT · REVIEW · COMPLY · RESOLVE</span>}
      </div>
      {(view === "client" || view === "lawyer") && (
        <input
          placeholder="Ask Vidhira a legal question…"
          onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { go("legalassistant", "", { question: e.target.value.trim() }); e.target.value = ""; } }}
          style={{ flex: 1, minWidth: 100, maxWidth: 420, padding: "9px 14px", borderRadius: 999, border: "1px solid #2A3854", background: "#182338", color: "#F6F1E8", fontSize: 12.5 }}
        />
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flex: "none" }}>
        <LanguageMenu />
        <ProfileMenu />
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
