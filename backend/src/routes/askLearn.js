import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.post("/questions", requireAuth, async (req, res) => {
  const { body, practiceArea, city, accountId } = req.body;
  const { data: question, error } = await getSupabase()
    .from("public_questions")
    .insert({ author_account_id: accountId, body, practice_area: practiceArea, city, status: "pending_moderation" })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json({ id: question.id, status: question.status });
});

router.get("/questions", async (req, res) => {
  const { area, q } = req.query;
  // author_account_id had select:false on the Mongoose schema — never returned on public
  // read, so it's explicitly excluded here (Postgres has no column-level default exclusion).
  let query = getSupabase()
    .from("public_questions")
    .select("id, body, practice_area, city, status, view_count, created_at, updated_at")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (area) query = query.eq("practice_area", area);
  if (q) query = query.ilike("body", `%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  res.json(data);
});

router.post("/questions/:id/answers", requireAuth, requireRole("advocate"), async (req, res) => {
  const supabase = getSupabase();
  const { data: advocate, error: advocateError } = await supabase
    .from("advocates")
    .select("id")
    .eq("user_id", req.user.id)
    .eq("verification_status", "verified")
    .maybeSingle();
  if (advocateError) throw advocateError;
  if (!advocate) return res.status(403).json({ error: "Only verified advocates may answer" });

  const { data: answer, error } = await supabase
    .from("public_answers")
    .insert({ question_id: req.params.id, advocate_id: advocate.id, body: req.body.body, moderation_state: "pending" })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(answer);
});

router.post("/answers/:id/helpful", async (req, res) => {
  // Replaces PublicAnswer.findByIdAndUpdate(id, {$inc: {helpfulCount: 1}}) — see
  // increment_helpful_count() in schema.sql, the one real atomic update in the codebase.
  const { data: answer, error } = await getSupabase().rpc("increment_helpful_count", { answer_id: req.params.id });
  if (error) throw error;
  res.json(answer);
});

router.get("/guides", async (req, res) => {
  const { data, error } = await getSupabase().from("guides").select("*");
  if (error) throw error;
  res.json(data);
});

router.get("/guides/:id", async (req, res) => {
  const { data: guide, error } = await getSupabase().from("guides").select("*").eq("id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!guide) return res.status(404).json({ error: "Not found" });
  res.json(guide);
});

router.get("/specialisations", async (req, res) => {
  const supabase = getSupabase();
  const { data: areas, error } = await supabase.from("practice_areas").select("*");
  if (error) throw error;

  // Replaces Advocate.aggregate([$match, $unwind, $group]) — see
  // advocate_counts_by_practice_area() in schema.sql.
  const { data: counts, error: countsError } = await supabase.rpc("advocate_counts_by_practice_area");
  if (countsError) throw countsError;
  const countMap = new Map(counts.map((c) => [c.practice_area_id, Number(c.count)]));

  res.json(areas.map((a) => ({ ...a, advocateCount: countMap.get(a.id) || 0 })));
});

router.get("/firms", async (req, res) => {
  const { data, error } = await getSupabase().from("firms").select("*");
  if (error) throw error;
  res.json(data);
});

export default router;
