import { Router } from "express";
import { Advocate, IntakeRequest, ConflictCheck, Matter } from "../models/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// Directory search — verification gate enforced here, not left to the client.
router.get("/advocates", async (req, res) => {
  const { issue, city, forum, language, mode, fee_max, available_today } = req.query;
  const query = { verificationStatus: "verified" };
  if (issue) query.practiceAreas = issue;
  if (city) query.city = city;
  if (language) query.languages = language;
  if (mode) query.consultationModes = mode;
  if (available_today === "true") query.availabilityState = "available";
  if (forum) query["jurisdictions.forum"] = forum;

  let advocates = await Advocate.find(query).populate("practiceAreas").populate("userId", "fullName");
  if (fee_max) advocates = advocates.filter((a) => (a.instantFee || 0) <= Number(fee_max));

  const results = advocates.map((a) => ({
    ...a.toObject(),
    whyMatched: `Matched on practice area${city ? ", city" : ""}${language ? ", language" : ""} — ordered by relevance, not payment or rating.`,
  }));
  res.json(results);
});

router.get("/advocates/:id", async (req, res) => {
  const advocate = await Advocate.findOne({ _id: req.params.id, verificationStatus: "verified" })
    .populate("practiceAreas")
    .populate("userId", "fullName");
  if (!advocate) return res.status(404).json({ error: "Advocate not found or not listed" });
  res.json(advocate);
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
  const advocate = await Advocate.findOne({ userId: req.user._id });
  if (!advocate) return res.status(404).json({ error: "No advocate profile for this user" });
  req.advocate = advocate;
  next();
}

router.patch("/advocate/availability", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const { availabilityState, acceptsUrgent } = req.body;
  if (availabilityState) req.advocate.availabilityState = availabilityState;
  if (acceptsUrgent !== undefined) req.advocate.acceptsUrgent = acceptsUrgent;
  await req.advocate.save();
  res.json(req.advocate);
});

router.get("/advocate/requests", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const requests = await IntakeRequest.find({
    routedPracticeAreaId: { $in: req.advocate.practiceAreas },
    status: { $in: ["searching", "advocate_reviewing"] },
  }).select("-description"); // facts withheld until conflict check clears + consent
  res.json(requests);
});

router.post("/advocate/requests/:id/conflict-check", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const check = await ConflictCheck.findOneAndUpdate(
    { intakeId: req.params.id, advocateId: req.advocate._id },
    { status: "clear", checkedAt: new Date() },
    { upsert: true, new: true }
  );
  res.json(check);
});

router.post("/advocate/requests/:id/accept", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const clear = await ConflictCheck.findOne({ intakeId: req.params.id, advocateId: req.advocate._id, status: "clear" });
  if (!clear) return res.status(409).json({ error: "Conflict check must be clear before accepting" });

  const intake = await IntakeRequest.findByIdAndUpdate(req.params.id, { status: "matched" }, { new: true });
  const matter = await Matter.create({
    reference: `LA-${(intake.city || "IN").toUpperCase().slice(0, 3)}-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    accountId: intake.accountId,
    advocateId: req.advocate._id,
    title: "New engagement",
    practiceAreaId: intake.routedPracticeAreaId,
    forum: intake.forum,
    stage: "lawyer_matched",
    nextAction: "Advocate to schedule initial consultation",
  });
  res.json({ intake, matter });
});

router.post("/advocate/requests/:id/decline", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  // No reason recorded or disclosed — decline carries no penalty field per the API doc.
  await IntakeRequest.findByIdAndUpdate(req.params.id, { status: "searching" });
  res.status(204).end();
});

export default router;
