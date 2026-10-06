// Shared authorization helpers. Routes call these instead of trusting ids from the client.
import { getSupabase } from "../config/db.js";

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export async function memberAccountIds(userId) {
  const { data, error } = await getSupabase()
    .from("account_members")
    .select("account_id")
    .eq("user_id", userId)
    .not("accepted_at", "is", null);
  if (error) throw error;
  return data.map((m) => m.account_id);
}

/** Throws 403 unless `userId` is an accepted member of `accountId` (optionally with one of `roles`). */
export async function assertAccountMember(userId, accountId, roles = []) {
  if (!accountId) throw new HttpError(400, "accountId is required.");
  const { data, error } = await getSupabase()
    .from("account_members")
    .select("id, role")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .maybeSingle();
  if (error) throw error;
  if (!data || (roles.length && !roles.includes(data.role))) throw new HttpError(403, "You do not have access to this account.");
  return data;
}

/** The caller's personal/default account (first one they own), used when the client omits accountId. */
export async function defaultAccountId(userId) {
  const { data, error } = await getSupabase()
    .from("account_members")
    .select("account_id, role")
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const owned = data.find((m) => m.role === "owner") || data[0];
  return owned?.account_id || null;
}

export async function advocateForUser(userId) {
  const { data, error } = await getSupabase().from("advocates").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Loads a matter the user may see: a member of its account, or its engaged advocate.
 * Returns { matter, side } where side is "client" | "advocate". Throws 404 otherwise
 * (404 rather than 403 so ids can't be probed).
 */
export async function loadMatterForUser(user, matterId) {
  const supabase = getSupabase();
  const { data: matter, error } = await supabase.from("matters").select("*").eq("id", matterId).maybeSingle();
  if (error) throw error;
  if (!matter) throw new HttpError(404, "Matter not found.");

  const advocate = await advocateForUser(user.id);
  if (advocate && matter.advocate_id === advocate.id) return { matter, side: "advocate", advocate };

  const accountIds = await memberAccountIds(user.id);
  if (accountIds.includes(matter.account_id)) return { matter, side: "client", advocate };

  throw new HttpError(404, "Matter not found.");
}

export function requireSide(ctx, side, message) {
  if (ctx.side !== side) throw new HttpError(403, message || "Not allowed for your role on this matter.");
}
