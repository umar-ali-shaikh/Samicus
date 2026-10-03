import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { UIProvider } from "./state/UIState";
import { LoginScreen } from "./auth/LoginScreen";
import { VerifyEmailScreen } from "./auth/VerifyEmailScreen";
import { ResetPasswordScreen } from "./auth/ResetPasswordScreen";
import { AuthLayout } from "./auth/AuthLayout";
import { Shell } from "./shell/Shell";
import { Button, Callout, Loading } from "./components/ui";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => err?.status !== 401 && err?.status !== 403 && err?.status !== 404 && count < 2,
    },
  },
});

function Gate() {
  const { status, error, refresh, signOut } = useAuth();
  switch (status) {
    case "unconfigured":
      return (
        <AuthLayout title="Setup needed" subtitle="This build has no Supabase project configured.">
          <Callout tone="warning">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>frontend/.env.example</code>), then rebuild.</Callout>
        </AuthLayout>
      );
    case "loading":
      return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><Loading label="Signing you in…" /></div>;
    case "signed_out":
      return <LoginScreen />;
    case "unverified":
      return <VerifyEmailScreen />;
    case "recovery":
      return <ResetPasswordScreen />;
    case "error":
      return (
        <AuthLayout title="We couldn't load your account" subtitle={error}>
          <Button onClick={refresh}>Try again</Button>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </AuthLayout>
      );
    default:
      return <Shell />;
  }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UIProvider>
          <Gate />
        </UIProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
