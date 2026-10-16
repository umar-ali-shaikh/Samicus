/**
 * DB access for the advocates domain. Ported from routes/advocates.js's inline Supabase
 * calls -- same queries, same behaviour. No generated DB types yet; rows are cast to local
 * interfaces matching what each query actually selects.
 */
import { getSupabase } from "../../config/db.js";
import type { DirectoryQuery } from "@vidhira/contracts";

const JOIN_SELECT =
  "*, user:users(full_name, avatar_url), advocate_practice_areas(practice_area:practice_areas(*)), advocate_jurisdictions(state, forum), advocate_languages(language), advocate_consultation_modes(mode)";

export interface RawAdvocateRow {
  id: string;
  user_id: string;
  verification_status: string;
  availability_state: string;
  years_of_practice: number | null;
  scheduled_fee: number | null;
  instant_fee: number | null;
  city: string | null;
  keywords: string[] | null;
  sub_specialisations: string[] | null;
  user: { full_name: string; avatar_url: string | null } | null;
  advocate_practice_areas?: Array<{ practice_area: unknown }>;
  advocate_jurisdictions?: Array<{ state: string | null; forum: string | null }>;
  advocate_languages?: Array<{ language: string }>;
  advocate_consultation_modes?: Array<{ mode: string }>;
  [key: string]: unknown;
}

// --- Public directory / profile / slots ---

export async function searchDirectoryRows(filters: Pick<DirectoryQuery, "issue" | "city" | "forum" | "language" | "mode" | "available_today">): Promise<RawAdvocateRow[]> {
  const { issue, city, forum, language, mode, available_today } = filters;
  const select =
    `*, user:users(full_name, avatar_url), ` +
    `advocate_practice_areas${issue ? "!inner" : ""}(practice_area:practice_areas(*)), ` +
    `advocate_jurisdictions${forum ? "!inner" : ""}(state, forum), ` +
    `advocate_languages${language ? "!inner" : ""}(language), ` +
    `advocate_consultation_modes${mode ? "!inner" : ""}(mode)`;

  let query = getSupabase().from("advocates").select(select).eq("verification_status", "verified");
  if (city) query = query.eq("city", city);
  if (available_today === "true") query = query.eq("availability_state", "available");
  if (issue) query = query.eq("advocate_practice_areas.practice_area_id", issue);
  if (language) query = query.eq("advocate_languages.language", language);
  if (mode) query = query.eq("advocate_consultation_modes.mode", mode);
  if (forum) query = query.eq("advocate_jurisdictions.forum", forum);

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as RawAdvocateRow[];
}

export async function findVerifiedAdvocateById(id: string): Promise<RawAdvocateRow | null> {
  const { data, error } = await getSupabase().from("advocates").select(JOIN_SELECT).eq("id", id).eq("verification_status", "verified").maybeSingle();
  if (error) throw error;
  return data as RawAdvocateRow | null;
}

export async function findScheduleForVerifiedAdvocate(id: string): Promise<{ id: string; weekly_schedule: unknown } | null> {
  const { data, error } = await getSupabase().from("advocates").select("id, weekly_schedule").eq("id", id).eq("verification_status", "verified").maybeSingle();
  if (error) throw error;
  return data as { id: string; weekly_schedule: unknown } | null;
}

export async function listBookedSlotStarts(advocateId: string, bookedStates: readonly string[]): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("consultations")
    .select("scheduled_start")
    .eq("advocate_id", advocateId)
    .in("state", bookedStates as string[])
    .gte("scheduled_start", new Date().toISOString());
  if (error) throw error;
  return (data as Array<{ scheduled_start: string }>).map((b) => new Date(b.scheduled_start).toISOString());
}

export async function insertNotifyRequest(input: { userId: string; accountId?: string | null; practiceAreaId?: string | null }): Promise<void> {
  const { error } = await getSupabase()
    .from("notify_requests")
    .insert({ user_id: input.userId, account_id: input.accountId ?? null, topic: "advocate_availability", practice_area_id: input.practiceAreaId ?? null });
  if (error) throw error;
}

// --- Advocate onboarding ---

export interface NewAdvocateInput {
  userId: string;
  barCouncil: string;
  enrolmentNumber: string;
  enrolmentYear?: number;
  subSpecialisations: string[];
  yearsOfPractice?: number;
  education: string[];
  relevantExperience: string[];
  instantFee?: number;
  scheduledFee?: number;
  acceptsUrgent: boolean;
  chamberAddress?: string;
  city: string;
  keywords: string[];
}

export async function insertAdvocate(input: NewAdvocateInput): Promise<RawAdvocateRow> {
  const { data, error } = await getSupabase()
    .from("advocates")
    .insert({
      user_id: input.userId,
      bar_council: input.barCouncil,
      enrolment_number: input.enrolmentNumber,
      enrolment_year: input.enrolmentYear,
      verification_status: "submitted",
      sub_specialisations: input.subSpecialisations,
      years_of_practice: input.yearsOfPractice,
      education: input.education,
      relevant_experience: input.relevantExperience,
      instant_fee: input.instantFee,
      scheduled_fee: input.scheduledFee,
      availability_state: "offline",
      accepts_urgent: input.acceptsUrgent,
      chamber_address: input.chamberAddress,
      city: input.city,
      keywords: input.keywords,
    })
    .select()
    .single();
  if (error) throw error;
  return data as RawAdvocateRow;
}

export async function insertVerificationCase(advocateId: string, barCouncil: string, enrolmentNumber: string, verifiedEmail: string | null | undefined): Promise<void> {
  const { error } = await getSupabase().from("verification_cases").insert({
    advocate_id: advocateId,
    checks: [
      { type: "bar_council_enrolment", status: "pending", detail: `${barCouncil} · ${enrolmentNumber}` },
      { type: "email_verified", status: "pass", detail: verifiedEmail },
      { type: "identity_kyc", status: "pending", detail: "Admin to verify" },
    ],
  });
  if (error) throw error;
}

// Ported from admin.js's resubmitRouter -- advocates resubmit after being sent back for more
// information (see modules/admin/service.ts's decideVerification, which sets this status).
export async function insertResubmissionCase(advocateId: string): Promise<void> {
  const { error } = await getSupabase().from("verification_cases").insert({ advocate_id: advocateId, checks: [{ type: "resubmission", status: "pending" }] });
  if (error) throw error;
}

export async function markUserAsAdvocate(userId: string): Promise<void> {
  const { error } = await getSupabase().from("users").update({ role: "advocate", kyc_status: "pending" }).eq("id", userId);
  if (error) throw error;
}

export async function replaceJunctionRows(table: string, advocateId: string, rows: Record<string, unknown>[]): Promise<void> {
  const { error: delError } = await getSupabase().from(table).delete().eq("advocate_id", advocateId);
  if (delError) throw delError;
  if (rows.length === 0) return;
  const { error } = await getSupabase().from(table).insert(rows);
  if (error) throw error;
}

// --- Advocate self-service ---

// Not derived from RawAdvocateRow via Omit<> -- TypeScript can't cleanly map-transform an
// interface that mixes named properties with a string index signature (the named properties
// collapse to the index signature's `unknown` type after Omit), so this is its own interface.
export interface SelfAdvocateRow {
  id: string;
  user_id: string;
  verification_status: string;
  instant_fee: number | null;
  scheduled_fee: number | null;
  advocate_practice_areas?: Array<{ practice_area_id: string }>;
  [key: string]: unknown;
}

export async function findSelfAdvocate(userId: string): Promise<SelfAdvocateRow | null> {
  const { data, error } = await getSupabase().from("advocates").select("*, advocate_practice_areas(practice_area_id)").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as SelfAdvocateRow | null;
}

export async function updateAdvocate(id: string, patch: Record<string, unknown>): Promise<RawAdvocateRow> {
  const { data, error } = await getSupabase().from("advocates").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as RawAdvocateRow;
}

export async function findAdvocateProfileByUserId(userId: string): Promise<RawAdvocateRow | null> {
  const { data, error } = await getSupabase().from("advocates").select(JOIN_SELECT).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as RawAdvocateRow | null;
}

export async function findAdvocateJoinedById(id: string): Promise<RawAdvocateRow> {
  const { data, error } = await getSupabase().from("advocates").select(JOIN_SELECT).eq("id", id).single();
  if (error) throw error;
  return data as RawAdvocateRow;
}

export async function offeredIntakeIds(advocateId: string): Promise<string[]> {
  const supabase = getSupabase();
  const [matches, conflicts] = await Promise.all([
    supabase.from("match_results").select("intake_id").eq("advocate_id", advocateId),
    supabase.from("conflict_checks").select("intake_id").eq("advocate_id", advocateId),
  ]);
  if (matches.error) throw matches.error;
  if (conflicts.error) throw conflicts.error;
  const rows = [...matches.data, ...conflicts.data] as Array<{ intake_id: string }>;
  return [...new Set(rows.map((r) => r.intake_id))];
}

export async function findIntakeRaw(id: string, columns = "*"): Promise<Record<string, unknown> | null> {
  const { data, error } = await getSupabase().from("intake_requests").select(columns).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

const LISTING_COLUMNS =
  "id, account_id, situation_id, routed_practice_area_id, urgency, city, state, forum, mode, language, kind, status, consent_given_at, created_at, practice_area:practice_areas(name)";

export async function listOfferedOpenIntakes(ids: string[], openStates: readonly string[]): Promise<Record<string, unknown>[]> {
  const { data, error } = await getSupabase()
    .from("intake_requests")
    .select(LISTING_COLUMNS)
    .in("id", ids)
    .in("status", openStates as string[])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Record<string, unknown>[];
}

export async function listConflictStatusesForAdvocate(advocateId: string, intakeIds: string[]): Promise<Map<string, string>> {
  const { data, error } = await getSupabase().from("conflict_checks").select("intake_id, status").eq("advocate_id", advocateId).in("intake_id", intakeIds);
  if (error) throw error;
  const rows = data as Array<{ intake_id: string; status: string }>;
  return new Map(rows.map((c) => [c.intake_id, c.status]));
}

export async function findConflictCheck(intakeId: string, advocateId: string): Promise<{ status: string } | null> {
  const { data, error } = await getSupabase().from("conflict_checks").select("status").eq("intake_id", intakeId).eq("advocate_id", advocateId).maybeSingle();
  if (error) throw error;
  return data as { status: string } | null;
}

export async function listOpenMattersForConflictCheck(advocateId: string): Promise<Array<{ account: { display_name: string } | null }>> {
  const { data, error } = await getSupabase()
    .from("matters")
    .select("account:accounts(display_name)")
    .eq("advocate_id", advocateId)
    .not("stage", "in", "(closed,archived)");
  if (error) throw error;
  return data as unknown as Array<{ account: { display_name: string } | null }>;
}

export async function upsertConflictCheck(intakeId: string, advocateId: string, status: string): Promise<{ id: string; status: string; checked_at: string }> {
  const { data, error } = await getSupabase()
    .from("conflict_checks")
    .upsert({ intake_id: intakeId, advocate_id: advocateId, status, checked_at: new Date().toISOString() }, { onConflict: "intake_id,advocate_id" })
    // Explicit columns, never "*": conflictCheckDto is .strict(), and the real row also carries
    // created_at/updated_at -- a bare .select() 500ed every real conflict check (found by e2e).
    .select("id, status, checked_at")
    .single();
  if (error) throw error;
  return data as { id: string; status: string; checked_at: string };
}

export async function updateIntakeStatus(id: string, status: string): Promise<void> {
  const { error } = await getSupabase().from("intake_requests").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function findConflictCheckClear(intakeId: string, advocateId: string): Promise<{ id: string } | null> {
  const { data, error } = await getSupabase().from("conflict_checks").select("id").eq("intake_id", intakeId).eq("advocate_id", advocateId).eq("status", "clear").maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

export async function findPracticeAreaName(id: string): Promise<string | null> {
  const { data } = await getSupabase().from("practice_areas").select("name").eq("id", id).maybeSingle();
  return (data as { name: string } | null)?.name ?? null;
}

export async function rpcAcceptIntakeAndOpenMatter(args: {
  p_intake_id: string;
  p_account_id: string;
  p_advocate_id: string;
  p_title: string;
  p_practice_area_id: string | null;
  p_forum: string | null;
  p_reference: string;
}): Promise<{ id: string; [key: string]: unknown }> {
  const { data, error } = await getSupabase().rpc("accept_intake_and_open_matter", args);
  if (error) throw error;
  return data as { id: string };
}

export async function insertConsultationForAcceptedIntake(input: {
  intakeId: string;
  advocateId: string;
  accountId: string;
  mode: string;
  fee: { professionalFee: number; platformFee: number; gst: number; total: number };
}): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase()
    .from("consultations")
    .insert({
      intake_id: input.intakeId,
      advocate_id: input.advocateId,
      account_id: input.accountId,
      mode: input.mode,
      scheduled_start: new Date().toISOString(),
      fee_professional: input.fee.professionalFee,
      fee_platform: input.fee.platformFee,
      fee_gst: input.fee.gst,
      fee_total: input.fee.total,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function insertTimelineEvent(input: { matterId: string; type: string; title: string; body: string; actorType: string; actorId: string }): Promise<void> {
  const { error } = await getSupabase().from("timeline_events").insert({
    matter_id: input.matterId,
    type: input.type,
    title: input.title,
    body: input.body,
    actor_type: input.actorType,
    actor_id: input.actorId,
  });
  if (error) throw error;
}

export async function deleteOfferRows(intakeId: string, advocateId: string): Promise<void> {
  for (const table of ["match_results", "conflict_checks"]) {
    const { error } = await getSupabase().from(table).delete().eq("intake_id", intakeId).eq("advocate_id", advocateId);
    if (error) throw error;
  }
}
