import { useAppState } from "../state/AppState";
import { SegmentedControl } from "../components/ui";
import { useIsMobile } from "./useIsMobile";

const VIEW_OPTIONS = [{ value: "client", label: "Client" }, { value: "lawyer", label: "Lawyer" }, { value: "admin", label: "Admin" }, { value: "founder", label: "Founder" }];

export function PrototypeBar() {
  const { state, act } = useAppState();
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between", padding: isMobile ? "10px 14px" : "12px 22px", background: "#0B1220", color: "#F6F1E8", position: "sticky", top: 0, zIndex: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--color-gold)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-serif)", fontSize: 16, color: "var(--color-navy)", fontWeight: 600, flex: "none" }}>S</div>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, letterSpacing: "0.06em" }}>SAMICUS</span>
          {!isMobile && <span style={{ fontSize: 10, color: "#8A94A8", letterSpacing: "0.05em" }}>RESEARCH · DRAFT · REVIEW · COMPLY · RESOLVE</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <SegmentedControl dark options={VIEW_OPTIONS} value={state.view} onChange={act.setView} />
        <button onClick={act.setLang} style={{ background: "#182338", border: "1px solid #2A3854", borderRadius: 9, padding: "8px 13px", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "#F6F1E8", cursor: "pointer" }}>
          {state.lang === "en" ? "EN" : "HI"}
        </button>
      </div>
    </div>
  );
}
