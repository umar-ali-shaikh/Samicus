import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { rankAdvocates, MATCHING_WEIGHTS_VERSION } from "../services/matching.js";

const router = Router();

const ADVOCATE_JOIN_SELECT =
  "*, advocate_practice_areas(practice_area_id), advocate_jurisdictions(state, forum), advocate_languages(language), advocate_consultation_modes(mode)";

// matching.js is pure/DB-agnostic — it just expects plain objects shaped the way the
// old Mongoose documents were (camelCase, flat arrays). These two mappers are the only
// adapter needed; matching.js itself is unchanged.
function toMatchingAdvocate(row) {
  return {
    ...row,
    _id: row.id,
    verificationStatus: row.verification_status,
    practiceAreas: (row.advocate_practice_areas || []).map((r) => r.practice_area_id),
    jurisdictions: (row.advocate_jurisdictions || []).map((r) => ({ state: r.state, forum: r.forum })),
    languages: (row.advocate_languages || []).map((r) => r.language),
    consultationModes: (row.advocate_consultation_modes || []).map((r) => r.mode),
    subSpecialisations: row.sub_specialisations,
    relevantExperience: row.relevant_experience,
    availabilityState: row.availability_state,
    acceptsUrgent: row.accepts_urgent,
    instantFee: row.instant_fee,
    scheduledFee: row.scheduled_fee,
  };
}

function toMatchingIntake(row) {
  return {
    routedPracticeAreaId: row.routed_practice_area_id,
    state: row.state,
    language: row.language,
    mode: row.mode,
    forum: row.forum,
    urgency: row.urgency,
    kind: row.kind,
  };
}

// Facts (description) are stored but never returned to an advocate until conflict-check
// clears AND the client explicitly consents — see /intake-requests/:id/consent below.
router.post("/intake-requests", requireAuth, async (req, res) => {
  const body = req.body;
  const { data: intake, error } = await getSupabase()
    .from("intake_requests")
    .insert({
      account_id: body.accountId,
      created_by: req.user.id,
      description: body.description,
      voice_transcript_id: body.voiceTranscriptId,
      situation_id: body.situationId,
      routed_practice_area_id: body.routedPracticeAreaId,
      routing_confidence: body.routingConfidence,
      urgency: body.urgency,
      city: body.city,
      state: body.state,
      forum: body.forum,
      mode: body.mode,
      language: body.language,
      kind: body.kind,
      status: "searching",
    })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(intake);
});

router.get("/intake-requests/:id/matches", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: intake, error: intakeError } = await supabase.from("intake_requests").select("*").eq("id", req.params.id).maybeSingle();
  if (intakeError) throw intakeError;
  if (!intake) return res.status(404).json({ error: "Not found" });

  const { data: advocateRows, error: advocateError } = await supabase
    .from("advocates")
    .select(ADVOCATE_JOIN_SELECT)
    .eq("verification_status", "verified");
  if (advocateError) throw advocateError;

  const advocates = advocateRows.map(toMatchingAdvocate);
  const ranked = rankAdvocates(advocates, toMatchingIntake(intake)).slice(0, 3);

  // MatchResult.deleteMany + insertMany as one transaction — see replace_match_results() in schema.sql.
  const { data: saved, error: replaceError } = await supabase.rpc("replace_match_results", {
    p_intake_id: intake.id,
    p_rows: ranked.map((m) => ({
      advocate_id: m.advocate._id,
      rank: m.rank,
      score_breakdown: m.scoreBreakdown,
      total_score: m.totalScore,
      why_matched: m.whyMatched,
      estimated_response_seconds: m.estimatedResponseSeconds,
      quoted_fee: m.quotedFee,
    })),
  });
  if (replaceError) throw replaceError;

  res.json({ weightsVersion: MATCHING_WEIGHTS_VERSION, matches: saved });
});

router.post("/intake-requests/:id/consent", requireAuth, async (req, res) => {
  const { data: intake, error } = await getSupabase()
    .from("intake_requests")
    .update({ consent_given_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) throw error;
  res.json(intake);
});

// Urgent path — same request model, shorter SLA framing, fastest-callback fallback.
router.post("/urgent-requests", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const body = req.body;
  const { data: intake, error } = await supabase
    .from("intake_requests")
    .insert({
      account_id: body.accountId,
      created_by: req.user.id,
      description: body.description,
      voice_transcript_id: body.voiceTranscriptId,
      situation_id: body.situationId,
      routed_practice_area_id: body.routedPracticeAreaId,
      routing_confidence: body.routingConfidence,
      urgency: body.urgency,
      city: body.city,
      state: body.state,
      forum: body.forum,
      mode: body.mode,
      language: body.language,
      kind: "urgent",
      status: "searching",
    })
    .select()
    .single();
  if (error) throw error;

  const { data: advocateRows, error: advocateError } = await supabase
    .from("advocates")
    .select(ADVOCATE_JOIN_SELECT)
    .eq("verification_status", "verified")
    .eq("accepts_urgent", true);
  if (advocateError) throw advocateError;

  const advocates = advocateRows.map(toMatchingAdvocate);
  const ranked = rankAdvocates(advocates, toMatchingIntake(intake));

  if (ranked.length === 0) {
    const { data: updatedIntake, error: updateError } = await supabase
      .from("intake_requests")
      .update({ status: "none_available" })
      .eq("id", intake.id)
      .select()
      .single();
    if (updateError) throw updateError;
    return res.json({ intake: updatedIntake, status: "none_available", helpline: "State Legal Services Authority · 15100" });
  }

  const top = ranked[0];
  const { error: conflictError } = await supabase
    .from("conflict_checks")
    .insert({ intake_id: intake.id, advocate_id: top.advocate._id, status: "pending" });
  if (conflictError) throw conflictError;

  const { data: updatedIntake, error: updateError } = await supabase
    .from("intake_requests")
    .update({ status: "advocate_reviewing" })
    .eq("id", intake.id)
    .select()
    .single();
  if (updateError) throw updateError;

  res.json({
    intake: updatedIntake,
    status: "advocate_reviewing",
    candidate: { advocateId: top.advocate._id, whyMatched: top.whyMatched, quotedFee: top.quotedFee },
  });
});

router.post("/urgent-requests/:id/callback", requireAuth, async (req, res) => {
  const { data: intake, error } = await getSupabase()
    .from("intake_requests")
    .update({ status: "callback_scheduled" })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) throw error;
  res.json(intake);
});

export default router;
