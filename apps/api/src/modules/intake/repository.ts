/**
 * DB access for the intake/matching domain. Ported from routes/intake.js's inline Supabase
 * calls -- same queries, same behaviour. No generated DB types yet; rows are cast to local
 * interfaces matching what each query actually selects.
 */
import { getSupabase } from "../../config/db.js";

// An `undefined`-valued key is indistinguishable from an absent one once Supabase's client
// JSON-serializes the insert body (JSON.stringify drops undefined properties) -- Postgres then
// applies the column's own NULL default. Stripping them here keeps that behaviour explicit and
// (not incidentally) matches what the in-memory test double needs: it does not serialize to
// JSON, so a key present-but-undefined would otherwise silently clobber a configured default.
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export interface IntakeRow {
  id: string;
  account_id: string;
  created_by: string;
  description: string | null;
  counterparty_name: string | null;
  voice_transcript_id: string | null;
  situation_id: string | null;
  routed_practice_area_id: string | null;
  routing_confidence: number | null;
  urgency: string;
  city: string | null;
  state: string | null;
  forum: string | null;
  mode: string;
  language: string;
  kind: string;
  status: string;
  consent_given_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface NewIntakeInput {
  accountId: string;
  createdBy: string;
  description?: string;
  counterpartyName?: string;
  situationId?: string;
  routedPracticeAreaId: string;
  routingConfidence: number | null;
  urgency: string;
  city?: string;
  state?: string;
  forum?: string;
  mode: string;
  language: string;
  kind: string;
}

export async function findSituationPracticeArea(situationId: string): Promise<{ mapped_practice_area_id: string | null } | null> {
  const { data, error } = await getSupabase().from("situations").select("mapped_practice_area_id").eq("id", situationId).maybeSingle();
  if (error) throw error;
  return data as { mapped_practice_area_id: string | null } | null;
}

export async function insertIntake(input: NewIntakeInput): Promise<IntakeRow> {
  const { data, error } = await getSupabase()
    .from("intake_requests")
    .insert(
      compact({
        account_id: input.accountId,
        created_by: input.createdBy,
        description: input.description,
        counterparty_name: input.counterpartyName,
        situation_id: input.situationId,
        routed_practice_area_id: input.routedPracticeAreaId,
        routing_confidence: input.routingConfidence,
        urgency: input.urgency,
        city: input.city,
        state: input.state,
        forum: input.forum,
        mode: input.mode,
        language: input.language,
        kind: input.kind,
        status: "searching",
      }),
    )
    .select()
    .single();
  if (error) throw error;
  return data as IntakeRow;
}

export async function findIntakeById(id: string): Promise<IntakeRow | null> {
  const { data, error } = await getSupabase().from("intake_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as IntakeRow | null;
}

export async function listIntakesForAccounts(accountIds: string[]): Promise<Array<IntakeRow & { practice_area: { name: string } | null }>> {
  const { data, error } = await getSupabase()
    .from("intake_requests")
    .select("*, practice_area:practice_areas(name)")
    .in("account_id", accountIds)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as unknown as Array<IntakeRow & { practice_area: { name: string } | null }>;
}

export interface VerifiedAdvocateJoinRow {
  id: string;
  [key: string]: unknown;
}

const ADVOCATE_JOIN_SELECT =
  "*, advocate_practice_areas(practice_area_id), advocate_jurisdictions(state, forum), advocate_languages(language), advocate_consultation_modes(mode)";

export async function listVerifiedAdvocatesForMatching(): Promise<VerifiedAdvocateJoinRow[]> {
  const { data, error } = await getSupabase().from("advocates").select(ADVOCATE_JOIN_SELECT).eq("verification_status", "verified");
  if (error) throw error;
  return data as unknown as VerifiedAdvocateJoinRow[];
}

export async function listAvailableUrgentAdvocatesForMatching(): Promise<VerifiedAdvocateJoinRow[]> {
  const { data, error } = await getSupabase()
    .from("advocates")
    .select(ADVOCATE_JOIN_SELECT)
    .eq("verification_status", "verified")
    .eq("accepts_urgent", true)
    .eq("availability_state", "available");
  if (error) throw error;
  return data as unknown as VerifiedAdvocateJoinRow[];
}

export interface RankedMatchRow {
  advocate_id: string;
  rank: number;
  score_breakdown: Record<string, number>;
  total_score: number;
  why_matched: string;
  estimated_response_seconds: number;
  quoted_fee: number | null;
}

export async function replaceMatchResults(intakeId: string, rows: RankedMatchRow[]): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await getSupabase().rpc("replace_match_results", {
    p_intake_id: intakeId,
    p_rows: rows,
  });
  if (error) throw error;
  return data as Array<Record<string, unknown>>;
}

export interface AdvocateSummaryRow {
  id: string;
  city: string | null;
  years_of_practice: number | null;
  availability_state: string;
  instant_fee: number | null;
  scheduled_fee: number | null;
  bar_council: string;
  user: { full_name: string; avatar_url: string | null } | null;
}

export async function findAdvocateSummaries(ids: string[]): Promise<AdvocateSummaryRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("advocates")
    .select("id, city, years_of_practice, availability_state, instant_fee, scheduled_fee, bar_council, user:users(full_name, avatar_url)")
    .in("id", ids);
  if (error) throw error;
  return data as unknown as AdvocateSummaryRow[];
}

export async function insertConflictCheck(intakeId: string, advocateId: string): Promise<void> {
  const { error } = await getSupabase().from("conflict_checks").insert({ intake_id: intakeId, advocate_id: advocateId, status: "pending" });
  if (error) throw error;
}

export async function updateIntakeStatus(id: string, status: string): Promise<IntakeRow> {
  const { data, error } = await getSupabase().from("intake_requests").update({ status }).eq("id", id).select().single();
  if (error) throw error;
  return data as IntakeRow;
}

export async function updateIntakeConsent(id: string): Promise<IntakeRow> {
  const { data, error } = await getSupabase().from("intake_requests").update({ consent_given_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) throw error;
  return data as IntakeRow;
}

export interface ConsultationPollRow {
  id: string;
  mode: string;
  scheduled_start: string | null;
  state: string;
  fee_total: number | null;
  paid_at: string | null;
  advocate: { id: string; user: { full_name: string } | null } | null;
}

export async function findLatestConsultationForIntake(intakeId: string): Promise<ConsultationPollRow | null> {
  const { data, error } = await getSupabase()
    .from("consultations")
    .select("id, mode, scheduled_start, state, fee_total, paid_at, advocate:advocates(id, user:users(full_name))")
    .eq("intake_id", intakeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as ConsultationPollRow | null;
}

export interface MatterRefRow {
  id: string;
  reference: string;
  stage: string;
}

export async function findFirstMatterForAccountSince(accountId: string, sinceIso: string): Promise<MatterRefRow | null> {
  const { data, error } = await getSupabase()
    .from("matters")
    .select("id, reference, stage")
    .eq("account_id", accountId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as MatterRefRow | null;
}
