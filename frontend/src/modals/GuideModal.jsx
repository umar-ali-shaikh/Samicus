import { useGet } from "../api/hooks";
import { useUI } from "../state/UIState";
import { ModalShell } from "../components/Modal";
import { Callout, QueryBoundary } from "../components/ui";

export function GuideModal({ guideId }) {
  const { closeModal } = useUI();
  const guide = useGet(`/guides/${guideId}`);
  return (
    <ModalShell kicker="Know your rights" title={guide.data?.title || "Guide"} onClose={closeModal} width={640}>
      <QueryBoundary query={guide}>
        {(g) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7 }}>{g.body}</div>
            <Callout tone="neutral">General information, reviewed {g.reviewed_at ? new Date(g.reviewed_at).toLocaleDateString("en-IN") : "by our team"}. It is not legal advice and does not create an advocate–client relationship.</Callout>
          </div>
        )}
      </QueryBoundary>
    </ModalShell>
  );
}
