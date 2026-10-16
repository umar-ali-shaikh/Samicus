"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "./supabase";
import { friendlyAuthError } from "./authErrors";
import { currentOrigin } from "./origin";
import type { AuthFormState } from "./authActionState";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!password) return { error: "Enter your password." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // signInWithPassword() rejects an unconfirmed user without ever establishing a session
    // (@supabase/ssr's cookie sync has nothing to persist here) -- redirecting to
    // /verify-email would only bounce straight back to /login, since that page requires a
    // real session to render. Show the message right here instead, same as any other
    // sign-in error -- "check your inbox" is actionable without needing a session at all.
    if (/not confirmed/i.test(error.message)) return { error: "Please verify your email before signing in — check your inbox for the confirmation link." };
    return { error: friendlyAuthError(error.message) };
  }
  redirect("/dashboard");
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (name.length < 2) return { error: "Please enter your full name." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  const origin = await currentOrigin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name }, emailRedirectTo: `${origin}/api/bff/auth/callback` },
  });
  if (error) return { error: friendlyAuthError(error.message) };
  // Supabase hides whether an address is already registered: an existing, confirmed user
  // comes back with an empty identities list.
  if (data.user && data.user.identities?.length === 0) {
    return { error: "An account with this email already exists. Sign in instead." };
  }
  // With email confirmation required (Supabase's default), signUp() creates the user but returns
  // no session -- so /verify-email can't find a signed-in user and would bounce straight to
  // /login with no explanation (same trap signInAction's comment describes). Pass the address
  // along instead; the page renders a session-less "check your inbox" state from it.
  if (!data.session) redirect(`/verify-email?email=${encodeURIComponent(email)}`);
  redirect("/verify-email");
}

export async function forgotPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") || "").trim();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

  const origin = await currentOrigin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/api/bff/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });
  if (error) return { error: friendlyAuthError(error.message) };
  return { notice: "If an account exists for that email, a reset link is on its way." };
}

export async function resendVerificationAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") || "").trim();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

  const origin = await currentOrigin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${origin}/api/bff/auth/callback` } });
  if (error) {
    // Supabase's per-address resend cooldown comes back as "For security purposes, you can only
    // request this after N seconds." -- not worded as a rate limit, so match it explicitly.
    if (/rate limit|only request this after/i.test(error.message)) return { error: "Please wait a little before requesting another email." };
    return { error: friendlyAuthError(error.message) };
  }
  return { notice: "Verification email sent. Check your inbox (and spam folder)." };
}

/** Polled by the verify-email page (every few seconds / on focus) to find out whether the
 * link has been clicked yet. */
export async function checkVerifiedAction(): Promise<{ verified: boolean }> {
  const supabase = await createServerSupabaseClient();
  // email_confirmed_at isn't a JWT claim (see apps/api/src/middleware/auth.ts's comment on the
  // same fact) -- ask Supabase directly since this is explicitly a "check live status" action.
  const { data } = await supabase.auth.getUser();
  return { verified: Boolean(data.user?.email_confirmed_at) };
}

export async function signInWithGoogleAction(): Promise<void> {
  const origin = await currentOrigin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/api/bff/auth/callback`, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) throw new Error(error?.message || "Could not start Google sign-in.");
  redirect(data.url);
}

export async function updatePasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const password = String(formData.get("password") || "");
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: friendlyAuthError(error.message) };
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
