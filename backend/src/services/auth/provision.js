// Maps a verified Supabase Auth identity (Google or email/password) to a Samicus
// `users` row, creating the row plus the user's personal account on first login.
import { getSupabase } from "../../config/db.js";

function emailList(name) {
  return (process.env[name] || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Privileged roles are granted only by allow-list (env), never by anything the client sends,
// and only for an email address Supabase has confirmed.
export function bootstrapRole(email) {
  const e = (email || "").toLowerCase();
  if (!e) return null;
  if (emailList("FOUNDER_EMAILS").includes(e)) return "founder";
  if (emailList("ADMIN_EMAILS").includes(e)) return "admin";
  return null;
}

function displayName(authUser) {
  const meta = authUser.user_metadata || {};
  return (meta.full_name || meta.name || (authUser.email || "").split("@")[0] || "Samicus user").trim();
}

async function createPersonalAccount(supabase, user) {
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
const isUniqueViolation = (err) => err?.code === "23505";

/**
 * @param {import("@supabase/supabase-js").User} authUser verified, email-confirmed Supabase user
 * @returns {Promise<object>} the app-level users row
 */
export async function provisionUser(authUser) {
  const supabase = getSupabase();
  const email = (authUser.email || "").toLowerCase();
  const meta = authUser.user_metadata || {};
  const now = new Date().toISOString();
  const elevated = bootstrapRole(email);

  let { data: user, error } = await supabase.from("users").select("*").eq("auth_id", authUser.id).maybeSingle();
  if (error) throw error;

  // Same person signing in with Google after signing up by email (or an invited member
  // who had no login yet): link the existing row instead of creating a duplicate.
  if (!user && email) {
    // Exact match on the lower-cased address: LIKE-style matching would treat "_" in an email as a wildcard.
    ({ data: user, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle());
    if (error) throw error;
    if (user && user.auth_id && user.auth_id !== authUser.id) user = null;
  }

  if (!user) {
    ({ data: user, error } = await supabase
      .from("users")
      .insert({
        auth_id: authUser.id,
        email,
        full_name: displayName(authUser),
        avatar_url: meta.avatar_url || meta.picture || null,
        role: elevated || "client",
        kyc_status: "unverified",
        last_login_at: now,
      })
      .select()
      .single());
    if (isUniqueViolation(error)) {
      ({ data: user, error } = await supabase.from("users").select("*").eq("auth_id", authUser.id).single());
      if (error) throw error;
      return user;
    }
    if (error) throw error;
    await createPersonalAccount(supabase, user);
    return user;
  }

  const patch = { last_login_at: now };
  if (!user.auth_id) patch.auth_id = authUser.id;
  if (!user.email) patch.email = email;
  if (!user.avatar_url && (meta.avatar_url || meta.picture)) patch.avatar_url = meta.avatar_url || meta.picture;
  if (elevated && user.role !== elevated && user.role !== "founder") patch.role = elevated;

  ({ data: user, error } = await supabase.from("users").update(patch).eq("id", user.id).select().single());
  if (error) throw error;

  const { count, error: countError } = await supabase
    .from("account_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("accepted_at", "is", null);
  if (countError) throw countError;
  if (count === 0) await createPersonalAccount(supabase, user);

  return user;
}
