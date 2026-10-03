import { lazy, Suspense } from "react";
import { useUI } from "../state/UIState";
import { Loading } from "../components/ui";
import { FOUNDER_TABS } from "./navConfig";
const Home = lazy(() => import("../screens/Home").then((m) => ({ default: m.Home })));
const Find = lazy(() => import("../screens/Find").then((m) => ({ default: m.Find })));
const Services = lazy(() => import("../screens/Services").then((m) => ({ default: m.Services })));
const Matters = lazy(() => import("../screens/Matters").then((m) => ({ default: m.Matters })));
const Consultations = lazy(() => import("../screens/Consultations").then((m) => ({ default: m.Consultations })));
const Documents = lazy(() => import("../screens/Documents").then((m) => ({ default: m.Documents })));
const Messages = lazy(() => import("../screens/Messages").then((m) => ({ default: m.Messages })));
const Profile = lazy(() => import("../screens/Profile").then((m) => ({ default: m.Profile })));
const TalkNow = lazy(() => import("../screens/TalkNow").then((m) => ({ default: m.TalkNow })));
const Draft = lazy(() => import("../screens/Draft").then((m) => ({ default: m.Draft })));
const Review = lazy(() => import("../screens/Review").then((m) => ({ default: m.Review })));
const Pack = lazy(() => import("../screens/Pack").then((m) => ({ default: m.Pack })));
const Learn = lazy(() => import("../screens/Learn").then((m) => ({ default: m.Learn })));
const Research = lazy(() => import("../screens/Research").then((m) => ({ default: m.Research })));
const CaseLaw = lazy(() => import("../screens/CaseLaw").then((m) => ({ default: m.CaseLaw })));
const LegalAssistant = lazy(() => import("../screens/LegalAssistant").then((m) => ({ default: m.LegalAssistant })));
const LawyerDashboard = lazy(() => import("../screens/LawyerDashboard").then((m) => ({ default: m.LawyerDashboard })));
const DraftReviews = lazy(() => import("../screens/DraftReviews").then((m) => ({ default: m.DraftReviews })));
const AdminQueue = lazy(() => import("../screens/AdminQueue").then((m) => ({ default: m.AdminQueue })));
const Moderation = lazy(() => import("../screens/Moderation").then((m) => ({ default: m.Moderation })));
const ServiceOrders = lazy(() => import("../screens/ServiceOrders").then((m) => ({ default: m.ServiceOrders })));
const Catalogue = lazy(() => import("../screens/Catalogue").then((m) => ({ default: m.Catalogue })));
const ComplaintsDesk = lazy(() => import("../screens/ComplaintsDesk").then((m) => ({ default: m.ComplaintsDesk })));
const CommandCentre = lazy(() => import("../screens/CommandCentre").then((m) => ({ default: m.CommandCentre })));

const SHARED = { find: Find, matters: Matters, consultations: Consultations, documents: Documents, messages: Messages, profile: Profile, learn: Learn, legalassistant: LegalAssistant, caselaw: CaseLaw, services: Services };

const BY_VIEW = {
  client: { ...SHARED, home: Home, talknow: TalkNow, research: Research, draft: Draft, review: Review, pack: Pack },
  lawyer: { ...SHARED, lawyer: LawyerDashboard, draftreviews: DraftReviews },
  admin: { find: Find, profile: Profile, admin: AdminQueue, moderation: Moderation, orders: ServiceOrders, catalogue: Catalogue, complaints: ComplaintsDesk },
  founder: { profile: Profile },
};

export function TabRouter({ view }) {
  const { tab } = useUI();
  const Screen = view === "founder" && FOUNDER_TABS.has(tab) ? null : BY_VIEW[view][tab];
  return (
    <Suspense fallback={<Loading />}>
      {view === "founder" && FOUNDER_TABS.has(tab) ? <CommandCentre tab={tab} /> : Screen ? <Screen /> : null}
    </Suspense>
  );
}
