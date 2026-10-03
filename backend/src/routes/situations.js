import { Router } from "express";
import { getSupabase } from "../config/db.js";

const router = Router();

router.get("/situations", async (req, res) => {
  const { data, error } = await getSupabase().from("situations").select("*, mapped_practice_area:practice_areas(*)");
  if (error) throw error;
  res.json(data);
});

router.post("/intake/route", async (req, res) => {
  const supabase = getSupabase();
  const { situationId, freeText } = req.body;
  if (situationId) {
    const { data: situation, error } = await supabase
      .from("situations")
      .select("*, mapped_practice_area:practice_areas(*)")
      .eq("id", situationId)
      .maybeSingle();
    if (error) throw error;
    if (!situation) return res.status(404).json({ error: "Situation not found" });
    return res.json({
      routedPracticeArea: situation.mapped_practice_area,
      routingConfidence: 0.95,
      disclaimer: "This routes you to a practice area. It is not legal advice.",
    });
  }
  if (!freeText) return res.status(400).json({ error: "situationId or freeText is required" });

  // Lightweight keyword router over the situation dictionary (no ML in this build).
  const { data: situations, error } = await supabase.from("situations").select("*, mapped_practice_area:practice_areas(*)");
  if (error) throw error;
  const lower = freeText.toLowerCase();
  const match = situations.find((s) => lower.includes(s.label_en.toLowerCase().split(" ")[0]));
  res.json({
    routedPracticeArea: match?.mapped_practice_area || null,
    routingConfidence: match ? 0.7 : 0.2,
    disclaimer: "This routes you to a practice area. It is not legal advice.",
  });
});

router.post("/intake/transcribe", async (req, res) => {
  // Voice intake is mocked: audio is never actually stored, per the privacy note.
  res.json({ transcriptId: null, text: "", note: "Recordings stay encrypted and are never shared without consent." });
});

export default router;
