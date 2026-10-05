import { Router } from "express";
import { z } from "zod";
import { getSupabase } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, advocateForUser } from "../services/access.js";
import { openMatterThread } from "../services/messaging.js";
import { computeFees } from "../services/matching.js";
import { BOOKED_STATES, buildAvailability, normalizeSchedule } from "../services/slots.js";

const router = Router();

const JOIN_SELECT =
  "*, user:users(full_name, avatar_url), advocate_practice_areas(practice_area:practice_areas(*)), advocate_jurisdictions(state, forum), advocate_languages(language), advocate_consultation_modes(mode)";

// Flattens the junction/child-table joins into flat arrays for the client.
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

async function syncRelations(advocateId, { practiceAreaIds, languages, consultationModes, jurisdictions }) {
  const supabase = getSupabase();
  const replace = async (table, rows) => {
    const { error: delError } = await supabase.from(table).delete().eq("advocate_id", advocateId);
    if (delError) throw delError;
    if (rows.length === 0) return;
    const { error } = await supabase.from(table).insert(rows);
    if (error) throw error;
  };
  if (practiceAreaIds) await replace("advocate_practice_areas", practiceAreaIds.map((id) => ({ advocate_id: advocateId, practice_area_id: id })));
  if (languages) await replace("advocate_languages", languages.map((language) => ({ advocate_id: advocateId, language })));
  if (consultationModes) await replace("advocate_consultation_modes", consultationModes.map((mode) => ({ advocate_id: advocateId, mode })));
  if (jurisdictions) await replace("advocate_jurisdictions", jurisdictions.map((j) => ({ advocate_id: advocateId, state: j.state, forum: j.forum })));
}

// Directory search — verification gate enforced here, not left to the client.
router.get("/advocates", async (req, res) => {
  const { issue, city, forum, language, mode, fee_max, available_today, q } = req.query;
  const supabase = getSupabase();

  // scalar-in-array filters (practiceAreas/languages/consultationModes) and the
  // jurisdictions.forum dot-path filter become inner-joins on the junction/child
  // tables, turned on only when that filter is actually requested.
  const select =
    `*, user:users(full_name, avatar_url), ` +
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
  if (fee_max) advocates = advocates.filter((a) => (a.scheduled_fee ?? a.instant_fee ?? 0) <= Number(fee_max));
  if (q) {
    const needle = String(q).toLowerCase();
    advocates = advocates.filter((a) =>
      [a.user?.full_name, a.city, ...(a.keywords || []), ...(a.sub_specialisations || []), ...a.practice_areas.map((p) => p.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }

  // Deterministic, payment-neutral order: available first, then more experienced.
  advocates.sort(
    (a, b) =>
      Number(b.availability_state === "available") - Number(a.availability_state === "available") ||
      (b.years_of_practice || 0) - (a.years_of_practice || 0)
  );

  res.json(
    advocates.map((a) => ({
      ...a,
      whyMatched: `Matched on ${[issue && "practice area", city && "city", language && "language", mode && "consultation mode", q && "your search"]
        .filter(Boolean)
        .join(", ") || "verified status"} — ordered by availability and experience, never by payment or rating.`,
    }))
  );
});

// The honest fallback for a dead-end advocate search/match: real persistence (not a fake
// "we'll notify you" promise), so a later batch job can actually act on it.
router.post("/advocates/notify-when-available", requireAuth, async (req, res) => {
  const { accountId, practiceAreaId } = req.body || {};
  const { error } = await getSupabase()
    .from("notify_requests")
    .insert({ user_id: req.user.id, account_id: accountId || null, topic: "advocate_availability", practice_area_id: practiceAreaId || null });
  if (error) throw error;
  res.status(201).json({ ok: true });
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
  const supabase = getSupabase();
  const { data: advocate, error } = await supabase
    .from("advocates")
    .select("id, weekly_schedule")
    .eq("id", req.params.id)
    .eq("verification_status", "verified")
    .maybeSingle();
  if (error) throw error;
  if (!advocate) return res.status(404).json({ error: "Advocate not found or not listed" });

  const { data: booked, error: bookedError } = await supabase
    .from("consultations")
    .select("scheduled_start")
    .eq("advocate_id", advocate.id)
    .in("state", BOOKED_STATES)
    .gte("scheduled_start", new Date().toISOString());
  if (bookedError) throw bookedError;

  const taken = new Set(booked.map((b) => new Date(b.scheduled_start).toISOString()));
  res.json(buildAvailability(normalizeSchedule(advocate.weekly_schedule), taken));
});

// --- Advocate onboarding ---

const MODES = ["video", "phone", "chat", "in_person"];

// Zod 4's .partial() still applies .default() values, which would silently wipe arrays on a
// partial PATCH — so the optional (PATCH) and defaulted (apply) shapes are built separately.
function fieldShape({ forApply }) {
  const list = (item, max) => (forApply ? z.array(item).max(max).default([]) : z.array(item).max(max).optional());
  return {
    subSpecialisations: list(z.string().trim().max(60), 10),
    yearsOfPractice: z.number().int().min(0).max(70).optional(),
    education: list(z.string().trim().max(160), 6),
    relevantExperience: list(z.string().trim().max(300), 10),
    city: forApply ? z.string().trim().min(2).max(80) : z.string().trim().min(2).max(80).optional(),
    chamberAddress: z.string().trim().max(300).optional(),
    languages: forApply ? z.array(z.string().trim().min(2).max(20)).min(1).max(8) : z.array(z.string().trim().min(2).max(20)).min(1).max(8).optional(),
    consultationModes: forApply ? z.array(z.enum(MODES)).min(1) : z.array(z.enum(MODES)).min(1).optional(),
    jurisdictions: list(z.object({ state: z.string().trim().min(2).max(60), forum: z.string().trim().min(2).max(100) }), 12),
    instantFee: z.number().min(0).max(1000000).optional(),
    scheduledFee: z.number().min(0).max(1000000).optional(),
    acceptsUrgent: forApply ? z.boolean().default(false) : z.boolean().optional(),
    keywords: list(z.string().trim().max(40), 15),
  };
}

const applySchema = z.object({
  barCouncil: z.string().trim().min(2).max(120),
  enrolmentNumber: z.string().trim().min(3).max(60),
  enrolmentYear: z.number().int().min(1950).max(new Date().getFullYear()).optional(),
  practiceAreaIds: z.array(z.string().uuid()).min(1).max(6),
  ...fieldShape({ forApply: true }),
});

function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  return result.data;
}

// An advocate applies for a listing; nothing is public until an admin verifies the
// Bar Council enrolment (see /admin/verification-cases).
router.post("/advocate/apply", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const input = parse(applySchema, req.body);
  if (req.user.role === "admin" || req.user.role === "founder") throw new HttpError(403, "Staff accounts cannot register as advocates.");
  if (await advocateForUser(req.user.id)) throw new HttpError(409, "You have already applied. Check your verification status.");

  const { data: advocate, error } = await supabase
    .from("advocates")
    .insert({
      user_id: req.user.id,
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

  await syncRelations(advocate.id, input);

  const { error: caseError } = await supabase.from("verification_cases").insert({
    advocate_id: advocate.id,
    checks: [
      { type: "bar_council_enrolment", status: "pending", detail: `${input.barCouncil} · ${input.enrolmentNumber}` },
      { type: "email_verified", status: "pass", detail: req.user.email },
      { type: "identity_kyc", status: "pending", detail: "Admin to verify" },
    ],
  });
  if (caseError) throw caseError;

  const { error: roleError } = await supabase.from("users").update({ role: "advocate", kyc_status: "pending" }).eq("id", req.user.id);
  if (roleError) throw roleError;

  res.status(201).json(advocate);
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
  if (availabilityState) {
    if (!["available", "busy", "offline"].includes(availabilityState)) throw new HttpError(400, "Invalid availabilityState.");
    if (availabilityState !== "offline" && req.advocate.verification_status !== "verified") {
      throw new HttpError(403, "You can go live once your Bar Council enrolment is verified.");
    }
    patch.availability_state = availabilityState;
  }
  if (acceptsUrgent !== undefined) patch.accepts_urgent = acceptsUrgent;

  const { data: updated, error } = await getSupabase().from("advocates").update(patch).eq("id", req.advocate.id).select().single();
  if (error) throw error;
  res.json(updated);
});

const OPEN_REQUEST_STATES = ["searching", "advocate_reviewing"];
const LISTING_COLUMNS =
  "id, account_id, situation_id, routed_practice_area_id, urgency, city, state, forum, mode, language, kind, status, consent_given_at, created_at, practice_area:practice_areas(name)";

// Requests are visible only to advocates the matcher (or the urgent path) actually offered them to.
async function offeredIntakeIds(advocateId) {
  const supabase = getSupabase();
  const [matches, conflicts] = await Promise.all([
    supabase.from("match_results").select("intake_id").eq("advocate_id", advocateId),
    supabase.from("conflict_checks").select("intake_id").eq("advocate_id", advocateId),
  ]);
  if (matches.error) throw matches.error;
  if (conflicts.error) throw conflicts.error;
  return [...new Set([...matches.data, ...conflicts.data].map((r) => r.intake_id))];
}

async function loadOfferedIntake(advocate, intakeId, columns = "*") {
  const ids = await offeredIntakeIds(advocate.id);
  if (!ids.includes(intakeId)) throw new HttpError(404, "Request not found.");
  const { data, error } = await getSupabase().from("intake_requests").select(columns).eq("id", intakeId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Request not found.");
  return data;
}

router.get("/advocate/requests", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const ids = await offeredIntakeIds(req.advocate.id);
  if (ids.length === 0) return res.json([]);
  // The facts (description) are never returned here — see GET /advocate/requests/:id.
  const { data, error } = await getSupabase()
    .from("intake_requests")
    .select(LISTING_COLUMNS)
    .in("id", ids)
    .in("status", OPEN_REQUEST_STATES)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const { data: checks, error: checksError } = await getSupabase()
    .from("conflict_checks")
    .select("intake_id, status")
    .eq("advocate_id", req.advocate.id)
    .in("intake_id", ids);
  if (checksError) throw checksError;
  const byIntake = new Map(checks.map((c) => [c.intake_id, c.status]));
  res.json(data.map((r) => ({ ...r, conflict_status: byIntake.get(r.id) || "pending" })));
});

// Facts are released only after this advocate's conflict check is clear AND the client consented.
router.get("/advocate/requests/:id", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const intake = await loadOfferedIntake(req.advocate, req.params.id);
  const { data: check, error } = await getSupabase()
    .from("conflict_checks")
    .select("status")
    .eq("intake_id", intake.id)
    .eq("advocate_id", req.advocate.id)
    .maybeSingle();
  if (error) throw error;
  const released = check?.status === "clear" && Boolean(intake.consent_given_at);
  const { description, counterparty_name, created_by, voice_transcript_id, ...safe } = intake;
  res.json({ ...safe, conflict_status: check?.status || "pending", description: released ? description : null, factsReleased: released });
});

// Real conflict check: the advocate must not currently act for the counterparty. We look
// for the named counterparty among the clients of this advocate's open matters.
router.post("/advocate/requests/:id/conflict-check", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const supabase = getSupabase();
  const intake = await loadOfferedIntake(req.advocate, req.params.id);

  let status = "clear";
  let matchedClient = null;
  if (intake.counterparty_name) {
    const { data: matters, error } = await supabase
      .from("matters")
      .select("account:accounts(display_name)")
      .eq("advocate_id", req.advocate.id)
      .not("stage", "in", "(closed,archived)");
    if (error) throw error;
    const needle = intake.counterparty_name.trim().toLowerCase();
    matchedClient = matters.map((m) => m.account?.display_name).find((n) => n && (n.toLowerCase().includes(needle) || needle.includes(n.toLowerCase().replace(/\s*\(.*\)$/, ""))));
    if (matchedClient) status = "conflict";
  }

  const { data: check, error } = await supabase
    .from("conflict_checks")
    .upsert({ intake_id: intake.id, advocate_id: req.advocate.id, status, checked_at: new Date().toISOString() }, { onConflict: "intake_id,advocate_id" })
    .select()
    .single();
  if (error) throw error;

  if (status === "clear" && intake.status === "searching") {
    const { error: statusError } = await supabase.from("intake_requests").update({ status: "advocate_reviewing" }).eq("id", intake.id);
    if (statusError) throw statusError;
  }
  res.json({ ...check, counterpartyChecked: Boolean(intake.counterparty_name) });
});

router.post("/advocate/requests/:id/accept", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const supabase = getSupabase();
  if (req.advocate.verification_status !== "verified") throw new HttpError(403, "Your listing is not verified yet.");
  const intake = await loadOfferedIntake(req.advocate, req.params.id);
  if (!OPEN_REQUEST_STATES.includes(intake.status)) throw new HttpError(409, "This request is no longer open.");

  const { data: clear, error: clearError } = await supabase
    .from("conflict_checks")
    .select("id")
    .eq("intake_id", intake.id)
    .eq("advocate_id", req.advocate.id)
    .eq("status", "clear")
    .maybeSingle();
  if (clearError) throw clearError;
  if (!clear) throw new HttpError(409, "Conflict check must be clear before accepting");

  const { data: area } = intake.routed_practice_area_id
    ? await supabase.from("practice_areas").select("name").eq("id", intake.routed_practice_area_id).maybeSingle()
    : { data: null };
  const reference = `SM-${(intake.city || "IN").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "IN"}-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

  // IntakeRequest status update + Matter.create as one transaction — see
  // accept_intake_and_open_matter() in schema.sql.
  const { data: matter, error: matterError } = await supabase.rpc("accept_intake_and_open_matter", {
    p_intake_id: intake.id,
    p_account_id: intake.account_id,
    p_advocate_id: req.advocate.id,
    p_title: area?.name ? `${area.name} matter` : "New engagement",
    p_practice_area_id: intake.routed_practice_area_id,
    p_forum: intake.forum,
    p_reference: reference,
  });
  if (matterError) throw matterError;

  await openMatterThread(matter, { advocateUserId: req.user.id, accountId: intake.account_id, requesterId: intake.created_by });

  // Instant / urgent requests start right away, so the acceptance also opens the call.
  let consultation = null;
  if (["instant", "urgent"].includes(intake.kind)) {
    const fee = computeFees(Number(req.advocate.instant_fee ?? req.advocate.scheduled_fee ?? 0));
    const { data, error: consultError } = await supabase
      .from("consultations")
      .insert({
        intake_id: intake.id,
        advocate_id: req.advocate.id,
        account_id: intake.account_id,
        mode: intake.mode,
        scheduled_start: new Date().toISOString(),
        fee_professional: fee.professionalFee,
        fee_platform: fee.platformFee,
        fee_gst: fee.gst,
        fee_total: fee.total,
      })
      .select()
      .single();
    if (consultError) throw consultError;
    consultation = data;
  }

  const { error: timelineError } = await supabase.from("timeline_events").insert({
    matter_id: matter.id,
    type: "matter_opened",
    title: "Advocate accepted your request",
    body: "Conflict check cleared. Your advocate will confirm the engagement scope next.",
    actor_type: "advocate",
    actor_id: req.advocate.id,
  });
  if (timelineError) throw timelineError;

  const { data: updatedIntake, error: updatedIntakeError } = await supabase.from("intake_requests").select("*").eq("id", intake.id).single();
  if (updatedIntakeError) throw updatedIntakeError;
  res.json({ intake: updatedIntake, matter, consultation });
});

router.post("/advocate/requests/:id/decline", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const supabase = getSupabase();
  const intake = await loadOfferedIntake(req.advocate, req.params.id, "id");
  // No reason recorded or disclosed — decline carries no penalty field per the API doc.
  for (const table of ["match_results", "conflict_checks"]) {
    const { error } = await supabase.from(table).delete().eq("intake_id", intake.id).eq("advocate_id", req.advocate.id);
    if (error) throw error;
  }
  // Internal-only counter for the founder dashboard (never shown to clients or ranked).
  const { error: auditError } = await supabase.from("audit_logs").insert({ actor_id: req.user.id, actor_role: "advocate", action: "request_declined", subject_type: "IntakeRequest", subject_id: intake.id });
  if (auditError) throw auditError;
  res.status(204).end();
});

router.get("/advocate/profile", requireAuth, requireRole("advocate"), async (req, res) => {
  const { data, error } = await getSupabase().from("advocates").select(JOIN_SELECT).eq("user_id", req.user.id).maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: "No advocate profile for this user" });
  res.json(flattenAdvocate(data));
});

const profileSchema = z.object({ ...fieldShape({ forApply: false }), weeklySchedule: z.object({}).passthrough().optional() });

// Bar enrolment details are locked after submission; they can only change through admin review.
router.patch("/advocate/profile", requireAuth, requireRole("advocate"), async (req, res) => {
  const supabase = getSupabase();
  const advocate = await advocateForUser(req.user.id);
  if (!advocate) throw new HttpError(404, "No advocate profile for this user");
  const input = parse(profileSchema, req.body);

  const patch = {};
  const map = {
    subSpecialisations: "sub_specialisations", yearsOfPractice: "years_of_practice", education: "education",
    relevantExperience: "relevant_experience", instantFee: "instant_fee", scheduledFee: "scheduled_fee",
    acceptsUrgent: "accepts_urgent", chamberAddress: "chamber_address", city: "city", keywords: "keywords",
  };
  for (const [k, col] of Object.entries(map)) if (input[k] !== undefined) patch[col] = input[k];
  if (input.weeklySchedule) patch.weekly_schedule = normalizeSchedule(input.weeklySchedule);

  if (Object.keys(patch).length) {
    const { error } = await supabase.from("advocates").update(patch).eq("id", advocate.id);
    if (error) throw error;
  }
  await syncRelations(advocate.id, input);

  const { data, error } = await supabase.from("advocates").select(JOIN_SELECT).eq("id", advocate.id).single();
  if (error) throw error;
  res.json(flattenAdvocate(data));
});

export default router;
