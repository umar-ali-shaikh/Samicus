/**
 * Maps a verified Supabase Auth identity (Google or email/password) to a Vidhira `users` row,
 * creating the row plus the user's personal account on first login.
 *
 * Phase 2 change from provision.js: privileged-role elevation via ADMIN_EMAILS/FOUNDER_EMAILS
 * now applies ONLY at the moment a row is created or first linked to an auth_id (never
 * re-derived on a returning login), and every elevation is audit-logged -- per
 * docs/MASTER-PROMPT.md's security requirements. Under the new middleware/auth.ts, this
 * function is only ever called once per user (first successful verified login); it is no
 * longer called on every request the way the old 5-second-cache middleware did.
 */
import { getSupabase } from "../../config/db.js";
import { logAudit } from "../../platform/audit.js";

export interface AppUser {
  id: string;
  auth_id: string | null;
  email: string | null;
  full_name: string;
  avatar_url: string | null;
  role: "client" | "advocate" | "admin" | "founder";
  kyc_status: string;
  last_login_at: string | null;
  [key: string]: unknown;
}

export interface SupabaseAuthUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

function emailList(name: string): string[] {
  return (process.env[name] || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Privileged roles are granted only by allow-list (env), never by anything the client sends,
// and only for an email address Supabase has confirmed.
export function bootstrapRole(email: string | null | undefined): "admin" | "founder" | null {
  const e = (email || "").toLowerCase();
  if (!e) return null;
  if (emailList("FOUNDER_EMAILS").includes(e)) return "founder";
  if (emailList("ADMIN_EMAILS").includes(e)) return "admin";
  return null;
}

function displayName(authUser: SupabaseAuthUser): string {
  const meta = authUser.user_metadata || {};
  const name = (meta.full_name as string) || (meta.name as string) || (authUser.email || "").split("@")[0] || "Vidhira user";
  return name.trim();
}

async function createPersonalAccount(supabase: ReturnType<typeof getSupabase>, user: AppUser): Promise<void> {
  // display_name is unique in the schema, so disambiguate with a short id suffix.
  const { data: account, error } = await supabase
    .from("accounts")
    .insert({ type: "individual", display_name: `${user.full_name} (${user.id.slice(0, 6)})` })
    .select()
    .single();
  if (isUniqueViolation(error)) return; // a concurrent request already created it
  if (error) throw error;
  const { error: memberError } = await supabase
    .from("account_members")
    .insert({ account_id: account.id, user_id: user.id, role: "owner", accepted_at: new Date().toISOString() });
  if (memberError) throw memberError;
}

// Two concurrent first requests (e.g. two tabs, or the client's session bootstrap racing its first
// call) must not create two people or two personal accounts: unique constraints decide the winner
// and the loser just reads the winner's rows.
const isUniqueViolation = (err: { code?: string } | null): boolean => err?.code === "23505";

async function logElevation(user: AppUser, elevated: "admin" | "founder", event: string): Promise<void> {
  await logAudit({
    actorId: user.id,
    actorRole: elevated,
    action: "role_elevated_on_provision",
    subjectType: "User",
    subjectId: user.id,
    reason: `matched ${elevated.toUpperCase()}_EMAILS allow-list at ${event}`,
  });
}

export async function provisionUser(authUser: SupabaseAuthUser): Promise<AppUser> {
  const supabase = getSupabase();
  const email = (authUser.email || "").toLowerCase();
  const meta = authUser.user_metadata || {};
  const now = new Date().toISOString();
  const elevated = bootstrapRole(email);

  let { data: user, error } = await supabase.from("users").select("*").eq("auth_id", authUser.id).maybeSingle();
  if (error) throw error;

  // Same person signing in with Google after signing up by email (or an invited member who had
  // no login yet): link the existing row instead of creating a duplicate. This is the row's
  // first-ever link to an auth identity, so elevation is allowed to apply here too.
  let isFirstLink = false;
  if (!user && email) {
    // Exact match on the lower-cased address: LIKE-style matching would treat "_" in an email as a wildcard.
    ({ data: user, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle());
    if (error) throw error;
    if (user && user.auth_id && user.auth_id !== authUser.id) user = null;
    if (user) isFirstLink = true;
  }

  if (!user) {
    const role = elevated || "client";
    ({ data: user, error } = await supabase
      .from("users")
      .insert({
        auth_id: authUser.id,
        email,
        full_name: displayName(authUser),
        avatar_url: meta.avatar_url || meta.picture || null,
        role,
        kyc_status: "unverified",
        last_login_at: now,
      })
      .select()
      .single());
    if (isUniqueViolation(error)) {
      ({ data: user, error } = await supabase.from("users").select("*").eq("auth_id", authUser.id).single());
      if (error) throw error;
      return user as AppUser;
    }
    if (error) throw error;
    if (elevated) await logElevation(user as AppUser, elevated, "signup");
    await createPersonalAccount(supabase, user as AppUser);
    return user as AppUser;
  }

  const patch: Record<string, unknown> = { last_login_at: now };
  if (!user.auth_id) patch.auth_id = authUser.id;
  if (!user.email) patch.email = email;
  if (!user.avatar_url && (meta.avatar_url || meta.picture)) patch.avatar_url = meta.avatar_url || meta.picture;
  if (isFirstLink && elevated && user.role !== elevated && user.role !== "founder") patch.role = elevated;

  ({ data: user, error } = await supabase.from("users").update(patch).eq("id", user.id).select().single());
  if (error) throw error;
  if (isFirstLink && elevated && patch.role) await logElevation(user as AppUser, elevated, "first sign-in");

  const { count, error: countError } = await supabase
    .from("account_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("accepted_at", "is", null);
  if (countError) throw countError;
  if (count === 0) await createPersonalAccount(supabase, user as AppUser);

  return user as AppUser;
}
