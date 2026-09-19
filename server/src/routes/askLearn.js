import { Router } from "express";
import { PublicQuestion, PublicAnswer, Guide, Firm, PracticeArea, Advocate } from "../models/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.post("/questions", requireAuth, async (req, res) => {
  const { body, practiceArea, city, accountId } = req.body;
  const question = await PublicQuestion.create({ authorAccountId: accountId, body, practiceArea, city, status: "pending_moderation" });
  res.status(201).json({ id: question._id, status: question.status });
});

router.get("/questions", async (req, res) => {
  const { area, q } = req.query;
  const query = { status: "published" };
  if (area) query.practiceArea = area;
  if (q) query.body = { $regex: q, $options: "i" };
  // authorAccountId has select:false on the schema — never returned on public read.
  res.json(await PublicQuestion.find(query).sort({ createdAt: -1 }));
});

router.post("/questions/:id/answers", requireAuth, requireRole("advocate"), async (req, res) => {
  const advocate = await Advocate.findOne({ userId: req.user._id, verificationStatus: "verified" });
  if (!advocate) return res.status(403).json({ error: "Only verified advocates may answer" });

  const answer = await PublicAnswer.create({ questionId: req.params.id, advocateId: advocate._id, body: req.body.body, moderationState: "pending" });
  res.status(201).json(answer);
});

router.post("/answers/:id/helpful", async (req, res) => {
  const answer = await PublicAnswer.findByIdAndUpdate(req.params.id, { $inc: { helpfulCount: 1 } }, { new: true });
  res.json(answer);
});

router.get("/guides", async (req, res) => res.json(await Guide.find()));
router.get("/guides/:id", async (req, res) => {
  const guide = await Guide.findById(req.params.id);
  if (!guide) return res.status(404).json({ error: "Not found" });
  res.json(guide);
});

router.get("/specialisations", async (req, res) => {
  const areas = await PracticeArea.find();
  const counts = await Advocate.aggregate([{ $match: { verificationStatus: "verified" } }, { $unwind: "$practiceAreas" }, { $group: { _id: "$practiceAreas", count: { $sum: 1 } } }]);
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));
  res.json(areas.map((a) => ({ ...a.toObject(), advocateCount: countMap.get(a._id.toString()) || 0 })));
});

router.get("/firms", async (req, res) => res.json(await Firm.find()));

export default router;
