import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { getSupabase } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, defaultAccountId, assertAccountMember } from "../services/access.js";

const router = Router();

function parse(schema, body) {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}

const questionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "You can post up to 5 questions an hour." },
});

const questionSchema = z.object({
  body: z.string().trim().min(20, "Please describe your question in at least 20 characters.").max(2000),
  practiceArea: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  accountId: z.string().uuid().optional(),
});

// Questions are anonymous to readers; the author's account is stored only for moderation.
router.post("/questions", requireAuth, questionLimiter, async (req, res) => {
  const input = parse(questionSchema, req.body);
  const accountId = input.accountId || (await defaultAccountId(req.user.id));
  await assertAccountMember(req.user.id, accountId);
  const { data: question, error } = await getSupabase()
    .from("public_questions")
    .insert({ author_account_id: accountId, body: input.body, practice_area: input.practiceArea, city: input.city, status: "pending_moderation" })
    .select("id, status")
    .single();
  if (error) throw error;
  res.status(201).json(question);
});

router.get("/questions", async (req, res) => {
  const { area, q } = req.query;
  // author_account_id is deliberately not selected — never exposed on public reads.
  let query = getSupabase()
    .from("public_questions")
    .select(
      "id, body, practice_area, city, status, view_count, created_at, answers:public_answers(id, body, helpful_count, published_at, advocate:advocates(city, user:users(full_name)))"
    )
    .eq("status", "published")
    .eq("answers.moderation_state", "published")
    .order("created_at", { ascending: false })
    .limit(50);
  if (area) query = query.eq("practice_area", area);
  if (q) query = query.ilike("body", `%${String(q).replace(/[%_]/g, "\\$&")}%`);
  const { data, error } = await query;
  if (error) throw error;
  res.json(data);
});

router.get("/questions/mine", requireAuth, async (req, res) => {
  const accountId = await defaultAccountId(req.user.id);
  if (!accountId) return res.json([]);
  const { data, error } = await getSupabase()
    .from("public_questions")
    .select("id, body, practice_area, status, created_at")
    .eq("author_account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  res.json(data);
});

// Verified advocates see questions awaiting an answer.
router.post("/questions/:id/answers", requireAuth, requireRole("advocate"), async (req, res) => {
  const supabase = getSupabase();
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (body.length < 30 || body.length > 4000) throw new HttpError(400, "Answers must be 30–4,000 characters.");
  const { data: advocate, error: advocateError } = await supabase
    .from("advocates")
    .select("id")
    .eq("user_id", req.user.id)
    .eq("verification_status", "verified")
    .maybeSingle();
  if (advocateError) throw advocateError;
  if (!advocate) throw new HttpError(403, "Only verified advocates may answer");

  const { data: question, error: questionError } = await supabase.from("public_questions").select("id").eq("id", req.params.id).eq("status", "published").maybeSingle();
  if (questionError) throw questionError;
  if (!question) throw new HttpError(404, "Question not found.");

  const { data: answer, error } = await supabase
    .from("public_answers")
    .insert({ question_id: question.id, advocate_id: advocate.id, body, moderation_state: "pending" })
    .select("id, moderation_state")
    .single();
  if (error) throw error;
  res.status(201).json(answer);
});

router.post("/answers/:id/helpful", requireAuth, async (req, res) => {
  // One vote per call is not enforceable without a votes table; rate-limit instead.
  const { data: answer, error } = await getSupabase().rpc("increment_helpful_count", { answer_id: req.params.id });
  if (error) throw error;
  res.json(answer);
});

router.get("/guides", async (req, res) => {
  const { data, error } = await getSupabase().from("guides").select("id, tag, title, locale, read_minutes, reviewed_at").order("title");
  if (error) throw error;
  res.json(data);
});

router.get("/guides/:id", async (req, res) => {
  const { data: guide, error } = await getSupabase().from("guides").select("*").eq("id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!guide) throw new HttpError(404, "Not found");
  res.json(guide);
});

const guideSchema = z.object({
  tag: z.string().trim().max(40).optional(),
  title: z.string().trim().min(5).max(160),
  body: z.string().trim().min(50).max(20000),
  locale: z.enum(["en", "hi"]).default("en"),
  readMinutes: z.number().int().min(1).max(60).optional(),
});

router.post("/admin/guides", requireAuth, requireRole("admin"), async (req, res) => {
  const i = parse(guideSchema, req.body);
  const { data, error } = await getSupabase()
    .from("guides")
    .insert({ tag: i.tag, title: i.title, body: i.body, locale: i.locale, read_minutes: i.readMinutes, reviewed_at: new Date().toISOString() })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "A guide with that title already exists.");
    throw error;
  }
  res.status(201).json(data);
});

router.delete("/admin/guides/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { error } = await getSupabase().from("guides").delete().eq("id", req.params.id);
  if (error) throw error;
  res.status(204).end();
});

// --- Moderation queue (admins) ---

router.get("/admin/moderation", requireAuth, requireRole("admin"), async (req, res) => {
  const supabase = getSupabase();
  const [questions, answers] = await Promise.all([
    supabase.from("public_questions").select("id, body, practice_area, city, created_at").eq("status", "pending_moderation").order("created_at"),
    supabase
      .from("public_answers")
      .select("id, body, created_at, question:public_questions(id, body), advocate:advocates(user:users(full_name))")
      .eq("moderation_state", "pending")
      .order("created_at"),
  ]);
  if (questions.error) throw questions.error;
  if (answers.error) throw answers.error;
  res.json({ questions: questions.data, answers: answers.data });
});

router.post("/admin/moderation/:type/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { decision } = req.body || {};
  if (!["published", "rejected"].includes(decision)) throw new HttpError(400, "decision must be 'published' or 'rejected'.");
  const supabase = getSupabase();
  const { type, id } = req.params;
  let result;
  if (type === "question") result = await supabase.from("public_questions").update({ status: decision }).eq("id", id).select("id").maybeSingle();
  else if (type === "answer")
    result = await supabase
      .from("public_answers")
      .update({ moderation_state: decision, published_at: decision === "published" ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id")
      .maybeSingle();
  else throw new HttpError(400, "type must be 'question' or 'answer'.");
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(404, "Not found");
  await supabase.from("audit_logs").insert({ actor_id: req.user.id, actor_role: "admin", action: `moderation_${decision}`, subject_type: type, subject_id: id });
  res.json({ ok: true });
});

router.get("/specialisations", async (req, res) => {
  const supabase = getSupabase();
  const { data: areas, error } = await supabase.from("practice_areas").select("*").order("name");
  if (error) throw error;

  // Replaces Advocate.aggregate([$match, $unwind, $group]) — see
  // advocate_counts_by_practice_area() in schema.sql.
  const { data: counts, error: countsError } = await supabase.rpc("advocate_counts_by_practice_area");
  if (countsError) throw countsError;
  const countMap = new Map(counts.map((c) => [c.practice_area_id, Number(c.count)]));

  res.json(areas.map((a) => ({ ...a, advocateCount: countMap.get(a.id) || 0 })));
});

export default router;
