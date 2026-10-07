/**
 * DB access for the accounts domain. Ported from routes/accounts.js's inline Supabase calls --
 * same queries, same behaviour. No DB types generated yet (`supabase gen types` lands with a
 * later phase); rows are cast to local interfaces matching what each query actually selects.
 */
import { getSupabase } from "../../config/db.js";

export interface AccountRow {
  id: string;
  type: "individual" | "family" | "business";
  display_name: string;
  gstin: string | null;
  cin: string | null;
  billing_address: string | null;
  seat_limit: number;
}

export interface MembershipWithAccountRow {
  role: string;
  account: AccountRow;
}

export interface UserRow {
  id: string;
  email: string | null;
  full_name: string;
}

export interface MemberRow {
  id: string;
  role: string;
  invited_at: string | null;
  accepted_at: string | null;
  user: { id: string; full_name: string; email: string | null; avatar_url: string | null } | null;
}

export interface PlanRow {
  id: string;
  name: string;
  audience: "individual" | "family" | "business";
  price_monthly: number;
  entitlement_consultations: number | null;
  entitlement_document_reviews: number | null;
  entitlement_seats: number | null;
}

export async function listMembershipsWithAccounts(userId: string): Promise<MembershipWithAccountRow[]> {
  const { data, error } = await getSupabase()
    .from("account_members")
    .select("role, account:accounts(*)")
    .eq("user_id", userId)
    .not("accepted_at", "is", null);
  if (error) throw error;
  return data as unknown as MembershipWithAccountRow[];
}

export interface NewAccountInput {
  type: "family" | "business";
  displayName: string;
  gstin?: string;
  cin?: string;
  billingAddress?: string;
}

/** Throws the raw Postgres error on conflict (code 23505) -- the caller maps that to a 409. */
export async function insertAccount(input: NewAccountInput): Promise<AccountRow> {
  const { data, error } = await getSupabase()
    .from("accounts")
    .insert({
      type: input.type,
      display_name: input.displayName,
      gstin: input.gstin ?? null,
      cin: input.cin ?? null,
      billing_address: input.billingAddress ?? null,
      seat_limit: input.type === "business" ? 10 : 4,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AccountRow;
}

export async function insertOwnerMembership(accountId: string, userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("account_members")
    .insert({ account_id: accountId, user_id: userId, role: "owner", accepted_at: new Date().toISOString() });
  if (error) throw error;
}

export async function listPlans(): Promise<PlanRow[]> {
  const { data, error } = await getSupabase().from("plans").select("*").order("price_monthly");
  if (error) throw error;
  return data as PlanRow[];
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await getSupabase().from("users").select("*").eq("email", email).maybeSingle();
  if (error) throw error;
  return data as UserRow | null;
}

/** Creates a login-less placeholder row for an invitee who hasn't signed in yet -- linked to
 * their Supabase identity (matched by verified email) the first time they do, in provisionUser. */
export async function insertPlaceholderUser(email: string, fullName: string | undefined): Promise<UserRow> {
  const { data, error } = await getSupabase()
    .from("users")
    .insert({ email, full_name: fullName?.trim() || email.split("@")[0] })
    .select()
    .single();
  if (error) throw error;
  return data as UserRow;
}

export async function findMembership(accountId: string, userId: string): Promise<{ id: string } | null> {
  const { data, error } = await getSupabase().from("account_members").select("id").eq("account_id", accountId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

export async function getAccountSeatLimit(accountId: string): Promise<number> {
  const { data, error } = await getSupabase().from("accounts").select("seat_limit").eq("id", accountId).single();
  if (error) throw error;
  return (data as { seat_limit: number }).seat_limit;
}

export async function countMembers(accountId: string): Promise<number> {
  const { count, error } = await getSupabase().from("account_members").select("*", { count: "exact", head: true }).eq("account_id", accountId);
  if (error) throw error;
  return count ?? 0;
}

export interface NewMemberInput {
  accountId: string;
  userId: string;
  role: string;
}

export async function insertMember(input: NewMemberInput): Promise<{ id: string; role: string }> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("account_members")
    .insert({
      account_id: input.accountId,
      user_id: input.userId,
      role: input.role,
      invited_at: now,
      // Becomes active once the invitee signs in with this (verified) email.
      accepted_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; role: string };
}

export async function listMembers(accountId: string): Promise<MemberRow[]> {
  const { data, error } = await getSupabase()
    .from("account_members")
    .select("id, role, invited_at, accepted_at, user:users(id, full_name, email, avatar_url)")
    .eq("account_id", accountId);
  if (error) throw error;
  return data as unknown as MemberRow[];
}

export async function deleteMember(accountId: string, memberId: string): Promise<void> {
  const { error } = await getSupabase().from("account_members").delete().eq("id", memberId).eq("account_id", accountId);
  if (error) throw error;
}
