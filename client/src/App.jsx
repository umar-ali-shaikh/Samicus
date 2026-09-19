import { AppStateProvider } from "./state/AppState";
import { Shell } from "./shell/Shell";

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
