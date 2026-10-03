import { useUI } from "../state/UIState";
import { BookingModal } from "./BookingModal";
import { UrgentModal } from "./UrgentModal";
import { LawyerProfileModal } from "./LawyerProfileModal";
import { ServiceModal } from "./ServiceModal";
import { GuideModal } from "./GuideModal";

export function ModalHost() {
  const { modal } = useUI();
  if (!modal) return null;
  const { name, props } = modal;
  switch (name) {
    case "booking": return <BookingModal {...props} />;
    case "urgent": return <UrgentModal />;
    case "lawyer": return <LawyerProfileModal {...props} />;
    case "service": return <ServiceModal {...props} />;
    case "guide": return <GuideModal {...props} />;
    default: return null;
  }
}
