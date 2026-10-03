import { useAppState } from "../state/AppState";
import { BookingModal } from "./BookingModal";
import { UrgentModal } from "./UrgentModal";
import { LawyerProfileModal } from "./LawyerProfileModal";
import { ServiceModal } from "./ServiceModal";
import { QuoteModal } from "./QuoteModal";
import { PayModal } from "./PayModal";

export function ModalHost() {
  const { state } = useAppState();
  switch (state.modal) {
    case "booking": return <BookingModal />;
    case "urgent": return <UrgentModal />;
    case "lawyer": return <LawyerProfileModal />;
    case "service": return <ServiceModal />;
    case "quote": return <QuoteModal />;
    case "pay": return <PayModal />;
    default: return null;
  }
}
