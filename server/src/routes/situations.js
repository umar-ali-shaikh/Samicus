import { Router } from "express";
import { Situation } from "../models/index.js";

const router = Router();

router.get("/situations", async (req, res) => {
  const situations = await Situation.find().populate("mappedPracticeAreaId");
  res.json(situations);
});

router.post("/intake/route", async (req, res) => {
  const { situationId, freeText } = req.body;
  if (situationId) {
    const situation = await Situation.findById(situationId).populate("mappedPracticeAreaId");
    if (!situation) return res.status(404).json({ error: "Situation not found" });
    return res.json({
      routedPracticeArea: situation.mappedPracticeAreaId,
      routingConfidence: 0.95,
      disclaimer: "This routes you to a practice area. It is not legal advice.",
    });
  }
  if (!freeText) return res.status(400).json({ error: "situationId or freeText is required" });

  // Lightweight keyword router over the situation dictionary (no ML in this build).
  const situations = await Situation.find().populate("mappedPracticeAreaId");
  const lower = freeText.toLowerCase();
  const match = situations.find((s) => lower.includes(s.labelEn.toLowerCase().split(" ")[0]));
  res.json({
    routedPracticeArea: match?.mappedPracticeAreaId || null,
    routingConfidence: match ? 0.7 : 0.2,
    disclaimer: "This routes you to a practice area. It is not legal advice.",
  });
});

router.post("/intake/transcribe", async (req, res) => {
  // Voice intake is mocked: audio is never actually stored, per the privacy note.
  res.json({ transcriptId: null, text: "", note: "Recordings stay encrypted and are never shared without consent." });
});

export default router;
