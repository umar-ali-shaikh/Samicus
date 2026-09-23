import { Router } from "express";
import { VerificationCase, Advocate, AuditLog } from "../models/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getCounts } from "../utils/callCounter.js";

const router = Router();

// Lightweight cost/usage visibility for the per-call-billed providers (Indian Kanoon,
// OpenRouter) — see docs/legal-assistant-spec.md gap #6. In-memory only (resets on
// restart); good enough for "are we about to get an IK bill surprise", not a ledger.
router.get("/admin/usage", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ callsSinceStart: getCounts() });
});

router.get("/admin/verification-cases", requireAuth, requireRole("admin"), async (req, res) => {
  res.json(
    await VerificationCase.find({ decision: "pending" }).populate({
      path: "advocateId",
      populate: { path: "userId", select: "fullName" },
    })
  );
});

// Verification is a gate (data-model doc principle #4): only this action can flip an
// advocate to "verified", and it is always audit-logged.
router.post("/admin/verification-cases/:id/decide", requireAuth, requireRole("admin"), async (req, res) => {
  const { decision } = req.body; // "approved" | "sent_back"
  const verificationCase = await VerificationCase.findByIdAndUpdate(
    req.params.id,
    { decision, decidedAt: new Date(), reviewerId: req.user._id },
    { new: true }
  );
  if (decision === "approved") {
    await Advocate.findByIdAndUpdate(verificationCase.advocateId, { verificationStatus: "verified" });
  }
  await AuditLog.create({
    actorId: req.user._id,
    actorRole: "admin",
    action: "advocate_verification_decision",
    subjectType: "Advocate",
    subjectId: verificationCase.advocateId,
  });
  res.json(verificationCase);
});

export default router;
