/**
 * Shared authorization helpers. Routes call these instead of trusting ids from the client.
 * Ported from access.js with identical behaviour (including the deliberate 404-not-403 on
 * matter probing). Row shapes are hand-typed here, not yet from `supabase gen types` -- full
 * generated DB types land per-repository as each domain is converted in Phase 3.
 */
import { getSupabase } from "../config/db.js";

export class HttpError extends Error {
  readonly status: number;
  [key: string]: unknown;

  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    Object.assign(this, extra);
  }
}

export interface AccountMembership {
  id: string;
  role: string;
}

export interface Advocate {
  id: string;
  user_id: string;
  [key: string]: unknown;
}

export interface Matter {
  id: string;
  account_id: string;
  advocate_id: string | null;
  [key: string]: unknown;
}

export interface MatterAccessContext {
  matter: Matter;
  side: "client" | "advocate";
  advocate: Advocate | null;
}

export async function memberAccountIds(userId: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("account_members")
    .select("account_id")
    .eq("user_id", userId)
    .not("accepted_at", "is", null);
  if (error) throw error;
  return (data as Array<{ account_id: string }>).map((m) => m.account_id);
}

/** Throws 403 unless `userId` is an accepted member of `accountId` (optionally with one of `roles`). */
export async function assertAccountMember(
  userId: string,
  accountId: string | undefined | null,
  roles: readonly string[] = [],
): Promise<AccountMembership> {
  if (!accountId) throw new HttpError(400, "accountId is required.");
  const { data, error } = await getSupabase()
    .from("account_members")
    .select("id, role")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .maybeSingle();
  if (error) throw error;
  const membership = data as AccountMembership | null;
  if (!membership || (roles.length && !roles.includes(membership.role))) {
    throw new HttpError(403, "You do not have access to this account.");
  }
  return membership;
}

/** The caller's personal/default account (first one they own), used when the client omits accountId. */
export async function defaultAccountId(userId: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("account_members")
    .select("account_id, role")
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data as Array<{ account_id: string; role: string }>;
  const owned = rows.find((m) => m.role === "owner") ?? rows[0];
  return owned?.account_id ?? null;
}

export async function advocateForUser(userId: string): Promise<Advocate | null> {
  const { data, error } = await getSupabase().from("advocates").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as Advocate | null;
}

/**
 * Loads a matter the user may see: a member of its account, or its engaged advocate.
 * Returns { matter, side } where side is "client" | "advocate". Throws 404 otherwise
 * (404 rather than 403 so ids can't be probed) -- this is the project's canonical IDOR
 * defence for matters; see this file's test suite for the probe case.
 */
export async function loadMatterForUser(user: { id: string }, matterId: string): Promise<MatterAccessContext> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("matters").select("*").eq("id", matterId).maybeSingle();
  if (error) throw error;
  const matter = data as Matter | null;
  if (!matter) throw new HttpError(404, "Matter not found.");

  const advocate = await advocateForUser(user.id);
  if (advocate && matter.advocate_id === advocate.id) return { matter, side: "advocate", advocate };

  const accountIds = await memberAccountIds(user.id);
  if (accountIds.includes(matter.account_id)) return { matter, side: "client", advocate };

  throw new HttpError(404, "Matter not found.");
}

export function requireSide(ctx: MatterAccessContext, side: "client" | "advocate", message?: string): void {
  if (ctx.side !== side) throw new HttpError(403, message || "Not allowed for your role on this matter.");
}
