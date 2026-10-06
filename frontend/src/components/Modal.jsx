import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Shared by every modal in the app (BookingModal, GuideModal, LawyerProfileModal,
// ServiceModal, UrgentModal) — fixing Escape-to-close, the focus trap and focus-return here
// once covers all of them, rather than each modal needing its own keyboard handling.
export function ModalShell({ kicker, title, onClose, children, footer, width = 560 }) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const first = dialogRef.current?.querySelector(FOCUSABLE_SELECTOR);
    (first || dialogRef.current)?.focus();

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
      if (!focusable || focusable.length === 0) return;
      const list = Array.from(focusable);
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // The trigger that opened this modal (e.g. "Urgent help") is where focus should land
      // back on close — never left on a now-removed/invisible element.
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(16,26,44,.55)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          width: "100%", maxWidth: width, maxHeight: "88vh", display: "flex", flexDirection: "column",
          background: "var(--color-surface)", borderRadius: "var(--radius-xl)", overflow: "hidden",
          boxShadow: "0 30px 70px -30px rgba(11,18,32,.6)", outline: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 22px", borderBottom: "1px solid var(--color-border)" }}>
          <div>
            {kicker && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: "var(--color-label)", textTransform: "uppercase" }}>{kicker}</div>}
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 21, marginTop: 3 }}>{title}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-muted)", lineHeight: 1,
              minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: "14px 22px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", gap: 10 }}>{footer}</div>}
      </div>
    </div>
  );
}
