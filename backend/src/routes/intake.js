import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { HttpError, assertAccountMember, defaultAccountId, memberAccountIds } from "../services/access.js";
import { rankAdvocates, MATCHING_WEIGHTS_VERSION } from "../services/matching.js";

const router = Router();

const ADVOCATE_JOIN_SELECT =
  "*, advocate_practice_areas(practice_area_id), advocate_jurisdictions(state, forum), advocate_languages(language), advocate_consultation_modes(mode)";

// matching.js is pure/DB-agnostic — it expects plain camelCase objects with flat arrays.
// These two mappers adapt the Postgres rows to that shape.
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

const MODES = ["video", "phone", "chat", "in_person"];
const intakeSchema = z.object({
  accountId: z.string().uuid().optional(),
  description: z.string().trim().max(5000).optional(),
  counterpartyName: z.string().trim().max(160).optional(),
  situationId: z.string().uuid().optional(),
  routedPracticeAreaId: z.string().uuid().optional(),
  urgency: z.enum(["today", "48h", "week", "deadline"]),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  forum: z.string().trim().max(120).optional(),
  mode: z.enum(MODES),
  language: z.string().trim().min(2).max(20),
  kind: z.enum(["instant", "scheduled"]).default("scheduled"),
});

function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  return result.data;
}

// Creates the intake row after verifying the caller belongs to the account, and works out
// the practice area from the chosen situation when the client didn't pick one directly.
async function createIntake(user, input, kind) {
  const supabase = getSupabase();
  const accountId = input.accountId || (await defaultAccountId(user.id));
  await assertAccountMember(user.id, accountId);

  let areaId = input.routedPracticeAreaId;
  let routingConfidence = areaId ? 1 : null;
  if (!areaId && input.situationId) {
    const { data: situation, error } = await supabase.from("situations").select("mapped_practice_area_id").eq("id", input.situationId).maybeSingle();
    if (error) throw error;
    if (!situation) throw new HttpError(400, "Unknown situation.");
    areaId = situation.mapped_practice_area_id;
    routingConfidence = 0.95;
  }
  if (!areaId) throw new HttpError(400, "Choose a situation or practice area so we can route your request.");

  const { data: intake, error } = await supabase
    .from("intake_requests")
    .insert({
      account_id: accountId,
      created_by: user.id,
      description: input.description,
      counterparty_name: input.counterpartyName,
      situation_id: input.situationId,
      routed_practice_area_id: areaId,
      routing_confidence: routingConfidence,
      urgency: input.urgency,
      city: input.city,
      state: input.state,
      forum: input.forum,
      mode: input.mode,
      language: input.language,
      kind,
      status: "searching",
    })
    .select()
    .single();
  if (error) throw error;
  return intake;
}

async function loadOwnIntake(user, id) {
  const { data: intake, error } = await getSupabase().from("intake_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!intake) throw new HttpError(404, "Not found");
  await assertAccountMember(user.id, intake.account_id).catch(() => {
    throw new HttpError(404, "Not found");
  });
  return intake;
}

// Facts (description) are stored but never returned to an advocate until conflict-check
// clears AND the client explicitly consents — see /intake-requests/:id/consent below.
router.post("/intake-requests", requireAuth, async (req, res) => {
  const input = parse(intakeSchema, req.body);
  const intake = await createIntake(req.user, input, input.kind);
  res.status(201).json(intake);
});

router.get("/intake-requests", requireAuth, async (req, res) => {
  const accountIds = await memberAccountIds(req.user.id);
  if (accountIds.length === 0) return res.json([]);
  const { data, error } = await getSupabase()
    .from("intake_requests")
    .select("*, practice_area:practice_areas(name)")
    .in("account_id", accountIds)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  res.json(data);
});

async function attachAdvocates(rows) {
  if (rows.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("advocates")
    .select("id, city, years_of_practice, availability_state, instant_fee, scheduled_fee, bar_council, user:users(full_name, avatar_url)")
    .in("id", rows.map((r) => r.advocate_id));
  if (error) throw error;
  const byId = new Map(data.map((a) => [a.id, a]));
  return rows.map((r) => ({ ...r, advocate: byId.get(r.advocate_id) || null }));
}

router.get("/intake-requests/:id/matches", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const intake = await loadOwnIntake(req.user, req.params.id);

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

  res.json({ weightsVersion: MATCHING_WEIGHTS_VERSION, matches: await attachAdvocates(saved) });
});

router.post("/intake-requests/:id/consent", requireAuth, async (req, res) => {
  const intake = await loadOwnIntake(req.user, req.params.id);
  const { data, error } = await getSupabase()
    .from("intake_requests")
    .update({ consent_given_at: new Date().toISOString() })
    .eq("id", intake.id)
    .select()
    .single();
  if (error) throw error;
  res.json(data);
});

const urgentSchema = intakeSchema.omit({ kind: true, mode: true, language: true, urgency: true }).extend({
  mode: z.enum(MODES).default("phone"),
  language: z.string().trim().min(2).max(20).default("en"),
  urgency: z.enum(["today", "48h", "week", "deadline"]).default("today"),
});

// Urgent path — same request model, shorter SLA framing, fastest-callback fallback.
router.post("/urgent-requests", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const input = parse(urgentSchema, req.body);
  const intake = await createIntake(req.user, input, "urgent");

  const { data: advocateRows, error: advocateError } = await supabase
    .from("advocates")
    .select(ADVOCATE_JOIN_SELECT)
    .eq("verification_status", "verified")
    .eq("accepts_urgent", true)
    .eq("availability_state", "available");
  if (advocateError) throw advocateError;

  // Urgent matching ignores language/mode/state hard filters: the first available
  // verified advocate in the right practice area is better than none.
  const relaxed = { ...toMatchingIntake(intake), state: undefined, language: undefined, mode: undefined };
  const ranked = rankAdvocates(advocateRows.map(toMatchingAdvocate), relaxed);

  if (ranked.length === 0) {
    const { data: updatedIntake, error: updateError } = await supabase
      .from("intake_requests")
      .update({ status: "none_available" })
      .eq("id", intake.id)
      .select()
      .single();
    if (updateError) throw updateError;
    return res.json({ intake: updatedIntake, status: "none_available", helpline: "NALSA free legal aid helpline · 15100" });
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

  const [candidate] = await attachAdvocates([{ advocate_id: top.advocate._id, why_matched: top.whyMatched, quoted_fee: top.quotedFee }]);
  res.json({ intake: updatedIntake, status: "advocate_reviewing", candidate });
});

// Poll target for the instant / urgent flow: has an advocate accepted yet?
router.get("/intake-requests/:id", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const intake = await loadOwnIntake(req.user, req.params.id);
  const [{ data: consultation, error }, { data: matter, error: matterError }] = await Promise.all([
    supabase.from("consultations").select("id, mode, scheduled_start, state, fee_total, paid_at, advocate:advocates(id, user:users(full_name))").eq("intake_id", intake.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("matters").select("id, reference, stage").eq("account_id", intake.account_id).gte("created_at", intake.created_at).order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);
  if (error) throw error;
  if (matterError) throw matterError;
  res.json({ intake, consultation, matter: intake.status === "matched" ? matter : null });
});

// The client withdraws a request that is still waiting for an advocate.
router.post("/intake-requests/:id/cancel", requireAuth, async (req, res) => {
  const intake = await loadOwnIntake(req.user, req.params.id);
  if (!["searching", "advocate_reviewing", "none_available"].includes(intake.status)) throw new HttpError(409, "This request can no longer be cancelled.");
  const { data, error } = await getSupabase().from("intake_requests").update({ status: "declined" }).eq("id", intake.id).select().single();
  if (error) throw error;
  res.json(data);
});

export default router;
