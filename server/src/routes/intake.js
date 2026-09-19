import { Router } from "express";
import { IntakeRequest, MatchResult, Advocate, ConflictCheck } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";
import { rankAdvocates, MATCHING_WEIGHTS_VERSION } from "../services/matching.js";

const router = Router();

// Facts (description) are stored but never returned to an advocate until conflict-check
// clears AND the client explicitly consents — see /intake-requests/:id/consent below.
router.post("/intake-requests", requireAuth, async (req, res) => {
  const intake = await IntakeRequest.create({ ...req.body, createdBy: req.user._id, status: "searching" });
  res.status(201).json(intake);
});

router.get("/intake-requests/:id/matches", requireAuth, async (req, res) => {
  const intake = await IntakeRequest.findById(req.params.id);
  if (!intake) return res.status(404).json({ error: "Not found" });

  const advocates = await Advocate.find({ verificationStatus: "verified" }).populate("practiceAreas");
  const ranked = rankAdvocates(advocates, intake).slice(0, 3);

  await MatchResult.deleteMany({ intakeId: intake._id });
  const saved = await MatchResult.insertMany(
    ranked.map((m) => ({
      intakeId: intake._id,
      advocateId: m.advocate._id,
      rank: m.rank,
      scoreBreakdown: m.scoreBreakdown,
      totalScore: m.totalScore,
      whyMatched: m.whyMatched,
      estimatedResponseSeconds: m.estimatedResponseSeconds,
      quotedFee: m.quotedFee,
    }))
  );

  res.json({ weightsVersion: MATCHING_WEIGHTS_VERSION, matches: saved });
});

router.post("/intake-requests/:id/consent", requireAuth, async (req, res) => {
  const intake = await IntakeRequest.findByIdAndUpdate(req.params.id, { consentGivenAt: new Date() }, { new: true });
  res.json(intake);
});

// Urgent path — same request model, shorter SLA framing, fastest-callback fallback.
router.post("/urgent-requests", requireAuth, async (req, res) => {
  const intake = await IntakeRequest.create({ ...req.body, createdBy: req.user._id, kind: "urgent", status: "searching" });

  const advocates = await Advocate.find({ verificationStatus: "verified", acceptsUrgent: true }).populate("practiceAreas");
  const ranked = rankAdvocates(advocates, intake);

  if (ranked.length === 0) {
    intake.status = "none_available";
    await intake.save();
    return res.json({ intake, status: "none_available", helpline: "State Legal Services Authority · 15100" });
  }

  const top = ranked[0];
  await ConflictCheck.create({ intakeId: intake._id, advocateId: top.advocate._id, status: "pending" });
  intake.status = "advocate_reviewing";
  await intake.save();
  res.json({ intake, status: "advocate_reviewing", candidate: { advocateId: top.advocate._id, whyMatched: top.whyMatched, quotedFee: top.quotedFee } });
});

router.post("/urgent-requests/:id/callback", requireAuth, async (req, res) => {
  const intake = await IntakeRequest.findByIdAndUpdate(req.params.id, { status: "callback_scheduled" }, { new: true });
  res.json(intake);
});

export default router;
