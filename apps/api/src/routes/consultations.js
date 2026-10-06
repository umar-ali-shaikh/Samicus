import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { computeFees } from "../services/matching.js";
import { HttpError, advocateForUser, assertAccountMember, memberAccountIds } from "../services/access.js";
import { isOfferedSlot, normalizeSchedule } from "../services/slots.js";
import { openMatterThread } from "../services/messaging.js";

const router = Router();

const LIST_SELECT =
  "*, advocate:advocates(id, city, user:users(full_name, avatar_url)), account:accounts(display_name), intake:intake_requests(kind, situation_id, practice_area:practice_areas(name))";

const bookSchema = z.object({
  intakeId: z.string().uuid(),
  advocateId: z.string().uuid(),
  mode: z.enum(["video", "phone", "chat", "in_person"]),
  scheduledStart: z.string().datetime({ offset: true }),
});

async function loadConsultationForUser(user, id) {
  const supabase = getSupabase();
  const { data: consultation, error } = await supabase.from("consultations").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!consultation) throw new HttpError(404, "Not found");

  const advocate = await advocateForUser(user.id);
  if (advocate && advocate.id === consultation.advocate_id) return { consultation, side: "advocate", advocate };
  const accountIds = await memberAccountIds(user.id);
  if (accountIds.includes(consultation.account_id)) return { consultation, side: "client", advocate };
  throw new HttpError(404, "Not found");
}

router.post("/consultations", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const { intakeId, advocateId, mode, scheduledStart } = parsed.data;

  const { data: intake, error: intakeError } = await supabase.from("intake_requests").select("*").eq("id", intakeId).maybeSingle();
  if (intakeError) throw intakeError;
  if (!intake) throw new HttpError(404, "Intake request not found.");
  await assertAccountMember(req.user.id, intake.account_id);
  if (!intake.consent_given_at) throw new HttpError(409, "Please consent to sharing your issue with the advocate before booking.");

  const { data: advocate, error: advocateError } = await supabase
    .from("advocates")
    .select("*, advocate_consultation_modes(mode)")
    .eq("id", advocateId)
    .eq("verification_status", "verified")
    .maybeSingle();
  if (advocateError) throw advocateError;
  if (!advocate) throw new HttpError(404, "Advocate not found or not listed");
  if (!advocate.advocate_consultation_modes.some((m) => m.mode === mode)) throw new HttpError(400, "This advocate does not offer that consultation mode.");

  if (!isOfferedSlot(normalizeSchedule(advocate.weekly_schedule), scheduledStart)) {
    throw new HttpError(409, "That time is not an available slot for this advocate.");
  }

  const professionalFee = advocate.scheduled_fee ?? advocate.instant_fee ?? 0;
  const fees = computeFees(Number(professionalFee));

  const { data: consultation, error } = await supabase
    .from("consultations")
    .insert({
      intake_id: intake.id,
      advocate_id: advocate.id,
      account_id: intake.account_id,
      mode,
      scheduled_start: new Date(scheduledStart).toISOString(),
      fee_professional: fees.professionalFee,
      fee_platform: fees.platformFee,
      fee_gst: fees.gst,
      fee_total: fees.total,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "Someone just booked that slot. Please pick another time.");
    throw error;
  }

  const { error: intakeUpdateError } = await supabase.from("intake_requests").update({ status: "matched" }).eq("id", intake.id);
  if (intakeUpdateError) throw intakeUpdateError;

  res.status(201).json(consultation);
});

router.get("/consultations", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const advocate = await advocateForUser(req.user.id);
  const accountIds = await memberAccountIds(req.user.id);

  const queries = [];
  if (accountIds.length) queries.push(supabase.from("consultations").select(LIST_SELECT).in("account_id", accountIds));
  if (advocate) queries.push(supabase.from("consultations").select(LIST_SELECT).eq("advocate_id", advocate.id));
  const results = await Promise.all(queries);
  const rows = new Map();
  for (const r of results) {
    if (r.error) throw r.error;
    for (const c of r.data) rows.set(c.id, c);
  }
  res.json([...rows.values()].sort((a, b) => new Date(b.scheduled_start || b.created_at) - new Date(a.scheduled_start || a.created_at)));
});

const CLIENT_STATES = ["cancelled", "rescheduled"];
const ADVOCATE_STATES = ["completed", "notes_published", "cancelled"];

router.patch("/consultations/:id", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { consultation, side, advocate } = await loadConsultationForUser(req.user, req.params.id);
  const { state, notes, recordingEnabled, scheduledStart } = req.body || {};
  const patch = {};

  if (state !== undefined) {
    const allowed = side === "client" ? CLIENT_STATES : ADVOCATE_STATES;
    if (!allowed.includes(state)) throw new HttpError(403, `You cannot set a consultation to "${state}".`);
    if (CLIENT_STATES.includes(state) && consultation.scheduled_start) {
      const fourHoursBeforeStart = new Date(new Date(consultation.scheduled_start).getTime() - 4 * 60 * 60 * 1000);
      if (new Date() > fourHoursBeforeStart) throw new HttpError(409, "Cannot reschedule/cancel within 4 hours of the start time");
    }
    patch.state = state;
  }
  if (side === "advocate" && notes !== undefined) patch.notes = String(notes).slice(0, 20000);
  if (recordingEnabled !== undefined) patch.recording_enabled = Boolean(recordingEnabled);
  if (scheduledStart !== undefined) {
    if (side !== "client") throw new HttpError(403, "Only the client can reschedule.");
    const { data: adv, error } = await supabase.from("advocates").select("weekly_schedule").eq("id", consultation.advocate_id).single();
    if (error) throw error;
    if (!isOfferedSlot(normalizeSchedule(adv.weekly_schedule), scheduledStart)) throw new HttpError(409, "That time is not an available slot.");
    patch.scheduled_start = new Date(scheduledStart).toISOString();
    patch.state = "scheduled";
  }
  if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update.");
  void advocate;

  const { data: updated, error: updateError } = await supabase.from("consultations").update(patch).eq("id", consultation.id).select().single();
  if (updateError) {
    if (updateError.code === "23505") throw new HttpError(409, "That slot was just taken.");
    throw updateError;
  }
  res.json(updated);
});

// Video/phone rooms are hosted on Jitsi Meet (free, no account). The room name is an
// unguessable per-consultation token that only the two participants receive.
const JOIN_EARLY_MS = 15 * 60 * 1000;
const JOIN_LATE_MS = 3 * 60 * 60 * 1000;

router.post("/consultations/:id/feedback", requireAuth, async (req, res) => {
  const { consultation, side } = await loadConsultationForUser(req.user, req.params.id);
  if (side !== "client") throw new HttpError(403, "Only the client can rate a consultation.");
  if (!["completed", "notes_published"].includes(consultation.state)) throw new HttpError(409, "You can rate a consultation once it is completed.");
  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "rating must be an integer from 1 to 5.");
  const { data, error } = await getSupabase()
    .from("consultations")
    .update({ csat_rating: rating, csat_comment: req.body?.comment ? String(req.body.comment).slice(0, 1000) : null })
    .eq("id", consultation.id)
    .select("id, csat_rating")
    .single();
  if (error) throw error;
  res.json(data);
});

router.post("/consultations/:id/room", requireAuth, async (req, res) => {
  const { consultation } = await loadConsultationForUser(req.user, req.params.id);
  if (!["scheduled", "reminder_sent", "in_progress"].includes(consultation.state)) {
    throw new HttpError(409, `This consultation is ${consultation.state.replace("_", " ")}.`);
  }
  if (consultation.mode === "in_person") throw new HttpError(400, "This is an in-person consultation.");
  if (consultation.mode === "chat") throw new HttpError(400, "This is a chat consultation — use Messages.");

  const start = new Date(consultation.scheduled_start).getTime();
  const now = Date.now();
  if (now < start - JOIN_EARLY_MS) throw new HttpError(409, "The room opens 15 minutes before the scheduled time.");
  if (now > start + JOIN_LATE_MS) throw new HttpError(409, "This consultation window has ended.");

  const roomToken = consultation.room_token || crypto.randomBytes(16).toString("hex");
  const { data: updated, error } = await getSupabase()
    .from("consultations")
    .update({ room_token: roomToken, state: "in_progress" })
    .eq("id", consultation.id)
    .select()
    .single();
  if (error) throw error;
  const roomUrl = `${process.env.VIDEO_BASE_URL || "https://meet.jit.si"}/Vidhira-${roomToken}`;
  res.json({ roomToken, roomUrl: consultation.mode === "phone" ? `${roomUrl}#config.startWithVideoMuted=true` : roomUrl, consultation: updated });
});

router.post("/consultations/:id/convert-to-matter", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { consultation, side } = await loadConsultationForUser(req.user, req.params.id);
  if (side !== "advocate") throw new HttpError(403, "Only the advocate can open a matter.");
  if (consultation.converted_matter_id) throw new HttpError(409, "Already converted to a matter.");

  const { data: intake, error: intakeError } = await supabase
    .from("intake_requests")
    .select("created_by, city, forum, routed_practice_area_id, practice_area:practice_areas(name)")
    .eq("id", consultation.intake_id)
    .single();
  if (intakeError) throw intakeError;

  const { data: matter, error: matterError } = await supabase
    .from("matters")
    .insert({
      reference: `SM-CON-${new Date().getFullYear()}-${crypto.randomInt(10000, 99999)}`,
      account_id: consultation.account_id,
      advocate_id: consultation.advocate_id,
      title: req.body?.title?.trim() || `${intake.practice_area?.name || "Legal"} matter`,
      practice_area_id: intake.routed_practice_area_id,
      forum: intake.forum,
      stage: "consultation",
      next_action: "Advocate to confirm engagement scope",
    })
    .select()
    .single();
  if (matterError) throw matterError;

  await openMatterThread(matter, { advocateUserId: req.user.id, accountId: consultation.account_id, requesterId: intake.created_by });
  const { error: timelineError } = await supabase.from("timeline_events").insert({
    matter_id: matter.id,
    type: "matter_opened",
    title: "Matter opened after consultation",
    actor_type: "advocate",
    actor_id: consultation.advocate_id,
  });
  if (timelineError) throw timelineError;

  const { data: updatedConsultation, error: updateError } = await supabase
    .from("consultations")
    .update({ converted_matter_id: matter.id, state: "notes_published" })
    .eq("id", consultation.id)
    .select()
    .single();
  if (updateError) throw updateError;

  res.json({ matter, consultation: updatedConsultation });
});

export default router;
