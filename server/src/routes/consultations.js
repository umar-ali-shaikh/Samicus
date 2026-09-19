import { Router } from "express";
import crypto from "crypto";
import { Consultation, Advocate, Matter } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";
import { computeFees } from "../services/matching.js";

const router = Router();

router.post("/consultations", requireAuth, async (req, res) => {
  const { intakeId, advocateId, accountId, mode, scheduledStart } = req.body;
  const advocate = await Advocate.findById(advocateId);
  if (!advocate) return res.status(404).json({ error: "Advocate not found" });

  const professionalFee = advocate.instantFee || advocate.scheduledFee || 0;
  const fees = computeFees(professionalFee);

  const consultation = await Consultation.create({
    intakeId,
    advocateId,
    accountId,
    mode,
    scheduledStart,
    fees,
  });
  res.status(201).json(consultation);
});

router.patch("/consultations/:id", requireAuth, async (req, res) => {
  const consultation = await Consultation.findById(req.params.id);
  if (!consultation) return res.status(404).json({ error: "Not found" });

  if (req.body.state === "cancelled" || req.body.state === "rescheduled") {
    const fourHoursBeforeStart = new Date(consultation.scheduledStart.getTime() - 4 * 60 * 60 * 1000);
    if (new Date() > fourHoursBeforeStart) {
      return res.status(409).json({ error: "Cannot reschedule/cancel within 4 hours of the start time" });
    }
  }
  Object.assign(consultation, req.body);
  await consultation.save();
  res.json(consultation);
});

router.post("/consultations/:id/room", requireAuth, async (req, res) => {
  const roomToken = crypto.randomBytes(16).toString("hex");
  const consultation = await Consultation.findByIdAndUpdate(req.params.id, { roomToken, state: "in_progress" }, { new: true });
  res.json({ roomToken, expiresInSeconds: 3600, consultation });
});

router.post("/consultations/:id/convert-to-matter", requireAuth, async (req, res) => {
  const consultation = await Consultation.findById(req.params.id);
  if (!consultation) return res.status(404).json({ error: "Not found" });

  const matter = await Matter.create({
    reference: `LA-CON-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    accountId: consultation.accountId,
    advocateId: consultation.advocateId,
    title: "Converted from consultation",
    stage: "consultation",
    nextAction: "Advocate to confirm engagement scope",
    engagedAt: new Date(),
  });
  consultation.convertedMatterId = matter._id;
  consultation.state = "notes_published";
  await consultation.save();
  res.json({ matter, consultation });
});

export default router;
