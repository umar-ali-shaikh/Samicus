import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

const JOIN_SELECT =
  "*, user:users(full_name), advocate_practice_areas(practice_area:practice_areas(*)), advocate_jurisdictions(state, forum), advocate_languages(language), advocate_consultation_modes(mode)";

// Flattens the junction/child-table joins back into the flat arrays the old Mongoose
// documents exposed directly (practiceAreas/jurisdictions/languages/consultationModes).
function flattenAdvocate(row) {
  return {
    ...row,
    practice_areas: (row.advocate_practice_areas || []).map((r) => r.practice_area),
    jurisdictions: (row.advocate_jurisdictions || []).map((r) => ({ state: r.state, forum: r.forum })),
    languages: (row.advocate_languages || []).map((r) => r.language),
    consultation_modes: (row.advocate_consultation_modes || []).map((r) => r.mode),
    advocate_practice_areas: undefined,
    advocate_jurisdictions: undefined,
    advocate_languages: undefined,
    advocate_consultation_modes: undefined,
  };
}

// Directory search — verification gate enforced here, not left to the client.
router.get("/advocates", async (req, res) => {
  const { issue, city, forum, language, mode, fee_max, available_today } = req.query;
  const supabase = getSupabase();

  // scalar-in-array filters (practiceAreas/languages/consultationModes) and the
  // jurisdictions.forum dot-path filter become inner-joins on the junction/child
  // tables, turned on only when that filter is actually requested.
  const select =
    `*, user:users(full_name), ` +
    `advocate_practice_areas${issue ? "!inner" : ""}(practice_area:practice_areas(*)), ` +
    `advocate_jurisdictions${forum ? "!inner" : ""}(state, forum), ` +
    `advocate_languages${language ? "!inner" : ""}(language), ` +
    `advocate_consultation_modes${mode ? "!inner" : ""}(mode)`;

  let query = supabase.from("advocates").select(select).eq("verification_status", "verified");
  if (city) query = query.eq("city", city);
  if (available_today === "true") query = query.eq("availability_state", "available");
  if (issue) query = query.eq("advocate_practice_areas.practice_area_id", issue);
  if (language) query = query.eq("advocate_languages.language", language);
  if (mode) query = query.eq("advocate_consultation_modes.mode", mode);
  if (forum) query = query.eq("advocate_jurisdictions.forum", forum);

  const { data, error } = await query;
  if (error) throw error;

  let advocates = data.map(flattenAdvocate);
  if (fee_max) advocates = advocates.filter((a) => (a.instant_fee || 0) <= Number(fee_max));

  const results = advocates.map((a) => ({
    ...a,
    whyMatched: `Matched on practice area${city ? ", city" : ""}${language ? ", language" : ""} — ordered by relevance, not payment or rating.`,
  }));
  res.json(results);
});

router.get("/advocates/:id", async (req, res) => {
  const { data, error } = await getSupabase()
    .from("advocates")
    .select(JOIN_SELECT)
    .eq("id", req.params.id)
    .eq("verification_status", "verified")
    .maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: "Advocate not found or not listed" });
  res.json(flattenAdvocate(data));
});

router.get("/advocates/:id/slots", async (req, res) => {
  // Fixed next-5-weekday demo slots (no real calendar backend in this build).
  const days = [];
  const cursor = new Date();
  while (days.length < 5) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) days.push(new Date(cursor));
  }
  const times = ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"];
  res.json(days.map((d) => ({ date: d.toISOString().slice(0, 10), slots: times.map((t, i) => ({ time: t, full: i === 2 || i === 4 })) })));
});

// --- Advocate self-service (operations) ---

async function selfAdvocate(req, res, next) {
  const { data: advocate, error } = await getSupabase()
    .from("advocates")
    .select("*, advocate_practice_areas(practice_area_id)")
    .eq("user_id", req.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!advocate) return res.status(404).json({ error: "No advocate profile for this user" });
  req.advocate = { ...advocate, practice_area_ids: (advocate.advocate_practice_areas || []).map((r) => r.practice_area_id) };
  next();
}

router.patch("/advocate/availability", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const { availabilityState, acceptsUrgent } = req.body;
  const patch = {};
  if (availabilityState) patch.availability_state = availabilityState;
  if (acceptsUrgent !== undefined) patch.accepts_urgent = acceptsUrgent;

  const { data: updated, error } = await getSupabase().from("advocates").update(patch).eq("id", req.advocate.id).select().single();
  if (error) throw error;
  res.json(updated);
});

router.get("/advocate/requests", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  // facts withheld until conflict check clears + consent — description column excluded
  const { data, error } = await getSupabase()
    .from("intake_requests")
    .select(
      "id, account_id, created_by, voice_transcript_id, situation_id, routed_practice_area_id, routing_confidence, urgency, city, state, forum, mode, language, kind, status, consent_given_at, created_at, updated_at"
    )
    .in("routed_practice_area_id", req.advocate.practice_area_ids)
    .in("status", ["searching", "advocate_reviewing"]);
  if (error) throw error;
  res.json(data);
});

router.post("/advocate/requests/:id/conflict-check", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const { data: check, error } = await getSupabase()
    .from("conflict_checks")
    .upsert(
      { intake_id: req.params.id, advocate_id: req.advocate.id, status: "clear", checked_at: new Date().toISOString() },
      { onConflict: "intake_id,advocate_id" }
    )
    .select()
    .single();
  if (error) throw error;
  res.json(check);
});

router.post("/advocate/requests/:id/accept", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const supabase = getSupabase();
  const { data: clear, error: clearError } = await supabase
    .from("conflict_checks")
    .select("id")
    .eq("intake_id", req.params.id)
    .eq("advocate_id", req.advocate.id)
    .eq("status", "clear")
    .maybeSingle();
  if (clearError) throw clearError;
  if (!clear) return res.status(409).json({ error: "Conflict check must be clear before accepting" });

  const { data: intake, error: intakeError } = await supabase
    .from("intake_requests")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();
  if (intakeError) throw intakeError;

  const reference = `LA-${(intake.city || "IN").toUpperCase().slice(0, 3)}-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // IntakeRequest status update + Matter.create as one transaction — see
  // accept_intake_and_open_matter() in schema.sql.
  const { data: matter, error: matterError } = await supabase.rpc("accept_intake_and_open_matter", {
    p_intake_id: req.params.id,
    p_account_id: intake.account_id,
    p_advocate_id: req.advocate.id,
    p_title: "New engagement",
    p_practice_area_id: intake.routed_practice_area_id,
    p_forum: intake.forum,
    p_reference: reference,
  });
  if (matterError) throw matterError;

  const { data: updatedIntake, error: updatedIntakeError } = await supabase
    .from("intake_requests")
    .select("*")
    .eq("id", req.params.id)
    .single();
  if (updatedIntakeError) throw updatedIntakeError;

  res.json({ intake: updatedIntake, matter });
});

router.post("/advocate/requests/:id/decline", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  // No reason recorded or disclosed — decline carries no penalty field per the API doc.
  const { error } = await getSupabase().from("intake_requests").update({ status: "searching" }).eq("id", req.params.id);
  if (error) throw error;
  res.status(204).end();
});

export default router;
