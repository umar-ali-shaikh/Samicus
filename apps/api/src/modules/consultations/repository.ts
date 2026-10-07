/**
 * DB access for the consultations domain. Ported from routes/consultations.js's inline
 * Supabase calls -- same queries, same behaviour. No generated DB types yet; rows are cast to
 * local interfaces matching what each query actually selects.
 */
import { getSupabase } from "../../config/db.js";

export interface ConsultationRow {
  id: string;
  intake_id: string;
  advocate_id: string;
  account_id: string;
  mode: string;
  scheduled_start: string | null;
  duration_minutes: number;
  room_token: string | null;
  state: string;
  recording_enabled: boolean;
  notes: string | null;
  converted_matter_id: string | null;
  fee_professional: number | null;
  fee_platform: number | null;
  fee_gst: number | null;
  fee_total: number | null;
  payment_method: string | null;
  paid_at: string | null;
  csat_rating: number | null;
  csat_comment: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

const LIST_SELECT =
  "*, advocate:advocates(id, city, user:users(full_name, avatar_url)), account:accounts(display_name), intake:intake_requests(kind, situation_id, practice_area:practice_areas(name))";

export async function findIntakeForBooking(intakeId: string): Promise<{ id: string; account_id: string; consent_given_at: string | null } | null> {
  const { data, error } = await getSupabase().from("intake_requests").select("*").eq("id", intakeId).maybeSingle();
  if (error) throw error;
  return data as { id: string; account_id: string; consent_given_at: string | null } | null;
}

export interface BookingAdvocateRow {
  id: string;
  verification_status: string;
  scheduled_fee: number | null;
  instant_fee: number | null;
  weekly_schedule: unknown;
  advocate_consultation_modes: Array<{ mode: string }>;
}

export async function findVerifiedAdvocateForBooking(advocateId: string): Promise<BookingAdvocateRow | null> {
  const { data, error } = await getSupabase()
    .from("advocates")
    .select("*, advocate_consultation_modes(mode)")
    .eq("id", advocateId)
    .eq("verification_status", "verified")
    .maybeSingle();
  if (error) throw error;
  return data as BookingAdvocateRow | null;
}

export interface InsertConsultationInput {
  intakeId: string;
  advocateId: string;
  accountId: string;
  mode: string;
  scheduledStart: string;
  fees: { professionalFee: number; platformFee: number; gst: number; total: number };
}

export async function insertConsultation(input: InsertConsultationInput): Promise<{ row: ConsultationRow | null; conflict: boolean }> {
  const { data, error } = await getSupabase()
    .from("consultations")
    .insert({
      intake_id: input.intakeId,
      advocate_id: input.advocateId,
      account_id: input.accountId,
      mode: input.mode,
      scheduled_start: new Date(input.scheduledStart).toISOString(),
      fee_professional: input.fees.professionalFee,
      fee_platform: input.fees.platformFee,
      fee_gst: input.fees.gst,
      fee_total: input.fees.total,
    })
    .select()
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return { row: null, conflict: true };
    throw error;
  }
  return { row: data as ConsultationRow, conflict: false };
}

export async function markIntakeMatched(intakeId: string): Promise<void> {
  const { error } = await getSupabase().from("intake_requests").update({ status: "matched" }).eq("id", intakeId);
  if (error) throw error;
}

export async function findConsultationById(id: string): Promise<ConsultationRow | null> {
  const { data, error } = await getSupabase().from("consultations").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ConsultationRow | null;
}

export async function listConsultationsForAccounts(accountIds: string[]): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await getSupabase().from("consultations").select(LIST_SELECT).in("account_id", accountIds);
  if (error) throw error;
  return data as Array<Record<string, unknown>>;
}

export async function listConsultationsForAdvocate(advocateId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await getSupabase().from("consultations").select(LIST_SELECT).eq("advocate_id", advocateId);
  if (error) throw error;
  return data as Array<Record<string, unknown>>;
}

export async function updateConsultation(id: string, patch: Record<string, unknown>): Promise<{ row: ConsultationRow | null; conflict: boolean }> {
  const { data, error } = await getSupabase().from("consultations").update(patch).eq("id", id).select().single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return { row: null, conflict: true };
    throw error;
  }
  return { row: data as ConsultationRow, conflict: false };
}

export async function findAdvocateSchedule(advocateId: string): Promise<{ weekly_schedule: unknown }> {
  const { data, error } = await getSupabase().from("advocates").select("weekly_schedule").eq("id", advocateId).single();
  if (error) throw error;
  return data as { weekly_schedule: unknown };
}

export async function updateFeedback(id: string, rating: number, comment: string | null): Promise<{ id: string; csat_rating: number }> {
  const { data, error } = await getSupabase().from("consultations").update({ csat_rating: rating, csat_comment: comment }).eq("id", id).select("id, csat_rating").single();
  if (error) throw error;
  return data as { id: string; csat_rating: number };
}

export interface ConvertIntakeRow {
  created_by: string;
  city: string | null;
  forum: string | null;
  routed_practice_area_id: string | null;
  practice_area: { name: string } | null;
}

export async function findIntakeForConversion(intakeId: string): Promise<ConvertIntakeRow> {
  const { data, error } = await getSupabase()
    .from("intake_requests")
    .select("created_by, city, forum, routed_practice_area_id, practice_area:practice_areas(name)")
    .eq("id", intakeId)
    .single();
  if (error) throw error;
  return data as unknown as ConvertIntakeRow;
}

export async function insertMatterFromConsultation(input: {
  reference: string;
  accountId: string;
  advocateId: string;
  title: string;
  practiceAreaId: string | null;
  forum: string | null;
}): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase()
    .from("matters")
    .insert({
      reference: input.reference,
      account_id: input.accountId,
      advocate_id: input.advocateId,
      title: input.title,
      practice_area_id: input.practiceAreaId,
      forum: input.forum,
      stage: "consultation",
      next_action: "Advocate to confirm engagement scope",
    })
    .select()
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function insertMatterOpenedTimelineEvent(matterId: string, advocateId: string): Promise<void> {
  const { error } = await getSupabase().from("timeline_events").insert({
    matter_id: matterId,
    type: "matter_opened",
    title: "Matter opened after consultation",
    actor_type: "advocate",
    actor_id: advocateId,
  });
  if (error) throw error;
}

export async function markConsultationConverted(id: string, matterId: string): Promise<ConsultationRow> {
  const { data, error } = await getSupabase()
    .from("consultations")
    .update({ converted_matter_id: matterId, state: "notes_published" })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ConsultationRow;
}
