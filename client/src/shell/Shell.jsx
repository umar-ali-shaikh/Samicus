import { useAppState } from "../state/AppState";
import { PrototypeBar } from "./PrototypeBar";
import { WebFrame } from "./WebFrame";
import { ModalHost } from "../modals/ModalHost";
import { Toast } from "../components/ui";

export function Shell() {
  const { state } = useAppState();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)", color: "var(--color-ink)", background: "var(--color-bg)" }}>
      <PrototypeBar />
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <WebFrame />
      </div>
      <ModalHost />
      <Toast message={state.toast} />
    </div>
  );
}
