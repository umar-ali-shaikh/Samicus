import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { api, ApiError, onAuthFailure } from "../lib/api";

const AuthContext = createContext(null);

// status: loading | unconfigured | signed_out | unverified | recovery | ready | error
export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(supabaseConfigured ? "loading" : "unconfigured");
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [error, setError] = useState("");
  const [activeAccountId, setActiveAccountIdState] = useState(() => {
    try { return localStorage.getItem("samicus.account") || null; } catch { return null; }
  });
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  const setActiveAccountId = useCallback((id) => {
    setActiveAccountIdState(id);
    try {
      if (id) localStorage.setItem("samicus.account", id);
      else localStorage.removeItem("samicus.account");
    } catch { /* storage unavailable */ }
    qc.invalidateQueries();
  }, [qc]);

  const fetchMe = useCallback(async () => {
    try {
      const data = await api.get("/me");
      setMe(data);
      setPendingEmail("");
      setError("");
      setStatus("ready");
      return data;
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        setPendingEmail(err.body?.email || "");
        setStatus("unverified");
      } else if (err instanceof ApiError && err.status === 401) {
        await supabase.auth.signOut();
      } else {
        setError(err.message);
        setStatus("error");
      }
      return null;
    }
  }, []);

  // Session bootstrap fires getSession() and a SIGNED_IN event almost together — share one /me call.
  const inflight = useRef(null);
  const loadMe = useCallback(() => {
    if (!inflight.current) inflight.current = fetchMe().finally(() => { inflight.current = null; });
    return inflight.current;
  }, [fetchMe]);

  useEffect(() => {
    if (!supabase) return undefined;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) loadMe();
      else setStatus((s) => (s === "loading" ? "signed_out" : s));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") { setStatus("recovery"); return; }
      if (event === "SIGNED_OUT") {
        setMe(null);
        qc.clear();
        setStatus((s) => (s === "unverified" ? s : "signed_out"));
        return;
      }
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") && next && statusRef.current !== "recovery") {
        // Deferred: calling Supabase from inside this callback can deadlock its auth lock.
        setTimeout(loadMe, 0);
      }
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [loadMe, qc]);

  // The API reports a dead/unverified session on any call.
  useEffect(() => onAuthFailure((err) => {
    if (err.code === "EMAIL_NOT_VERIFIED") { setPendingEmail(err.body?.email || ""); setStatus("unverified"); }
    else if (err.status === 401 && statusRef.current === "ready") supabase?.auth.signOut();
  }), []);

  // While waiting for the email to be verified, re-check on an interval and when the tab regains focus.
  useEffect(() => {
    if (status !== "unverified" || !session) return undefined;
    const check = () => loadMe();
    const timer = setInterval(check, 6000);
    window.addEventListener("focus", check);
    return () => { clearInterval(timer); window.removeEventListener("focus", check); };
  }, [status, session, loadMe]);

  const actions = useMemo(() => ({
    async signInWithGoogle() {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } },
      });
      if (err) throw err;
    },
    async signUp({ name, email, password }) {
      const { data, error: err } = await supabase.auth.signUp({
        email, password, options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
      });
      if (err) throw err;
      // Supabase hides whether an address is already registered: an existing, confirmed user
      // comes back with an empty identities list.
      if (data.user && data.user.identities?.length === 0) throw new Error("An account with this email already exists. Sign in instead.");
      if (!data.session) { setPendingEmail(email); setStatus("unverified"); }
    },
    async signIn({ email, password }) {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        if (/not confirmed/i.test(err.message)) { setPendingEmail(email); setStatus("unverified"); return; }
        throw err;
      }
    },
    async resendVerification() {
      const email = pendingEmail || session?.user?.email;
      const { error: err } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: window.location.origin } });
      if (err) throw err;
    },
    async forgotPassword(email) {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (err) throw err;
    },
    async updatePassword(password) {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setStatus("loading");
      await loadMe();
    },
    async signOut() {
      await supabase.auth.signOut();
      setMe(null);
      setPendingEmail("");
      setStatus("signed_out");
      qc.clear();
    },
    refresh: loadMe,
    backToSignIn() { setPendingEmail(""); supabase.auth.signOut().finally(() => setStatus("signed_out")); },
  }), [loadMe, pendingEmail, qc, session]);

  const accounts = useMemo(() => me?.accounts || [], [me]);
  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts.find((a) => a.myRole === "owner") || accounts[0] || null;

  const value = useMemo(() => ({
    status, error, session, pendingEmail, me,
    user: me?.user || null, advocate: me?.advocate || null, provider: me?.provider,
    accounts, activeAccount, setActiveAccountId,
    ...actions,
  }), [status, error, session, pendingEmail, me, accounts, activeAccount, setActiveAccountId, actions]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
