import { useAppState } from "../state/AppState";
import { Home } from "../screens/Home";
import { Find } from "../screens/Find";
import { Services } from "../screens/Services";
import { Matters } from "../screens/Matters";
import { Documents } from "../screens/Documents";
import { Messages } from "../screens/Messages";
import { Profile } from "../screens/Profile";
import { TalkNow } from "../screens/TalkNow";
import { Draft } from "../screens/Draft";
import { Review } from "../screens/Review";
import { Pack } from "../screens/Pack";
import { Learn } from "../screens/Learn";
import { Research } from "../screens/Research";
import { CaseLaw } from "../screens/CaseLaw";
import { LegalAssistant } from "../screens/LegalAssistant";
import { LawyerDashboard } from "../screens/LawyerDashboard";
import { AdminQueue } from "../screens/AdminQueue";
import { CommandCentre } from "../screens/CommandCentre";

const FOUNDER_TABS = new Set(["founder", "fdemand", "fservices", "ffunnel", "frevenue", "fcorp", "fadv", "fai", "fcomplaints"]);

const CLIENT_SCREENS = {
  home: Home, find: Find, talknow: TalkNow, research: Research, legalassistant: LegalAssistant, caselaw: CaseLaw, draft: Draft, review: Review,
  pack: Pack, services: Services, matters: Matters, documents: Documents, messages: Messages,
  learn: Learn, profile: Profile,
};

export function TabRouter() {
  const { state } = useAppState();

  if (state.view === "founder" || FOUNDER_TABS.has(state.tab)) {
    return <CommandCentre tab={FOUNDER_TABS.has(state.tab) ? state.tab : "founder"} />;
  }
  if (state.view === "lawyer") {
    if (state.tab === "matters") return <Matters />;
    if (state.tab === "messages") return <Messages />;
    if (state.tab === "documents") return <Documents />;
    if (state.tab === "profile") return <Profile />;
    return <LawyerDashboard />;
  }
  if (state.view === "admin") {
    if (state.tab === "find") return <Find />;
    if (state.tab === "services") return <Services />;
    return <AdminQueue />;
  }

  const Screen = CLIENT_SCREENS[state.tab] || Home;
  return <Screen />;
}
