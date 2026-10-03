import { Router } from "express";
import crypto from "crypto";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { computeFees } from "../services/matching.js";

const router = Router();

// Postgres has no document-level dirty-tracking save, so PATCH takes an explicit
// allowlist instead of Mongoose's old Object.assign(consultation, req.body); .save().
const PATCHABLE_FIELDS = {
  state: "state",
  notes: "notes",
  recordingEnabled: "recording_enabled",
  paymentMethod: "payment_method",
  paidAt: "paid_at",
  scheduledStart: "scheduled_start",
  durationMinutes: "duration_minutes",
};

function toPatch(body) {
  const patch = {};
  for (const [key, column] of Object.entries(PATCHABLE_FIELDS)) {
    if (body[key] !== undefined) patch[column] = body[key];
  }
  return patch;
}

router.post("/consultations", requireAuth, async (req, res) => {
  const { intakeId, advocateId, accountId, mode, scheduledStart } = req.body;
  const supabase = getSupabase();

  const { data: advocate, error: advocateError } = await supabase.from("advocates").select("*").eq("id", advocateId).maybeSingle();
  if (advocateError) throw advocateError;
  if (!advocate) return res.status(404).json({ error: "Advocate not found" });

  const professionalFee = advocate.instant_fee || advocate.scheduled_fee || 0;
  const fees = computeFees(professionalFee);

  const { data: consultation, error } = await supabase
    .from("consultations")
    .insert({
      intake_id: intakeId,
      advocate_id: advocateId,
      account_id: accountId,
      mode,
      scheduled_start: scheduledStart,
      fee_professional: fees.professionalFee,
      fee_platform: fees.platformFee,
      fee_gst: fees.gst,
      fee_total: fees.total,
    })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(consultation);
});

router.patch("/consultations/:id", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: consultation, error } = await supabase.from("consultations").select("*").eq("id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!consultation) return res.status(404).json({ error: "Not found" });

  if (req.body.state === "cancelled" || req.body.state === "rescheduled") {
    const fourHoursBeforeStart = new Date(new Date(consultation.scheduled_start).getTime() - 4 * 60 * 60 * 1000);
    if (new Date() > fourHoursBeforeStart) {
      return res.status(409).json({ error: "Cannot reschedule/cancel within 4 hours of the start time" });
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("consultations")
    .update(toPatch(req.body))
    .eq("id", req.params.id)
    .select()
    .single();
  if (updateError) throw updateError;
  res.json(updated);
});

router.post("/consultations/:id/room", requireAuth, async (req, res) => {
  const roomToken = crypto.randomBytes(16).toString("hex");
  const { data: consultation, error } = await getSupabase()
    .from("consultations")
    .update({ room_token: roomToken, state: "in_progress" })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) throw error;
  res.json({ roomToken, expiresInSeconds: 3600, consultation });
});

router.post("/consultations/:id/convert-to-matter", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: consultation, error } = await supabase.from("consultations").select("*").eq("id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!consultation) return res.status(404).json({ error: "Not found" });

  const { data: matter, error: matterError } = await supabase
    .from("matters")
    .insert({
      reference: `LA-CON-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      account_id: consultation.account_id,
      advocate_id: consultation.advocate_id,
      title: "Converted from consultation",
      stage: "consultation",
      next_action: "Advocate to confirm engagement scope",
      engaged_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (matterError) throw matterError;

  const { data: updatedConsultation, error: updateError } = await supabase
    .from("consultations")
    .update({ converted_matter_id: matter.id, state: "notes_published" })
    .eq("id", req.params.id)
    .select()
    .single();
  if (updateError) throw updateError;

  res.json({ matter, consultation: updatedConsultation });
});

export default router;
