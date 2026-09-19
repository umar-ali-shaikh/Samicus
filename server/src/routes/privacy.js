import { Router } from "express";
import { User, Matter, AccountMember } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/privacy/export", requireAuth, async (req, res) => {
  const memberships = await AccountMember.find({ userId: req.user._id });
  res.json({ user: req.user, memberships, exportedAt: new Date().toISOString() });
});

router.post("/privacy/delete", requireAuth, async (req, res) => {
  const accountIds = (await AccountMember.find({ userId: req.user._id })).map((m) => m.accountId);
  const engagedMatters = await Matter.countDocuments({ accountId: { $in: accountIds }, stage: { $nin: ["closed", "archived"] } });

  if (engagedMatters > 0) {
    return res.status(409).json({ error: "Cannot delete account while matters are engaged. Statutory retention applies until they are closed." });
  }
  await User.findByIdAndDelete(req.user._id);
  res.status(204).end();
});

export default router;
