import { Router } from "express";
import { getSupabase } from "../config/db.js";

const router = Router();

router.get("/situations", async (req, res) => {
  const { data, error } = await getSupabase().from("situations").select("*, mapped_practice_area:practice_areas(*)").order("label_en");
  if (error) throw error;
  res.json(data);
});

// Routes free text to a practice area by matching words in the situation dictionary.
router.post("/intake/route", async (req, res) => {
  const supabase = getSupabase();
  const { situationId, freeText } = req.body || {};
  const disclaimer = "This routes you to a practice area. It is not legal advice.";
  if (situationId) {
    const { data: situation, error } = await supabase
      .from("situations")
      .select("*, mapped_practice_area:practice_areas(*)")
      .eq("id", situationId)
      .maybeSingle();
    if (error) throw error;
    if (!situation) return res.status(404).json({ error: "Situation not found" });
    return res.json({ routedPracticeArea: situation.mapped_practice_area, routingConfidence: 0.95, disclaimer });
  }
  if (typeof freeText !== "string" || !freeText.trim()) return res.status(400).json({ error: "situationId or freeText is required" });

  const { data: situations, error } = await supabase.from("situations").select("*, mapped_practice_area:practice_areas(*)");
  if (error) throw error;
  const words = new Set(freeText.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  let best = null;
  let bestScore = 0;
  for (const s of situations) {
    const score = s.label_en.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && words.has(w)).length;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  res.json({ routedPracticeArea: best?.mapped_practice_area || null, routingConfidence: best ? Math.min(0.9, 0.5 + bestScore * 0.2) : 0, disclaimer });
});

export default router;
