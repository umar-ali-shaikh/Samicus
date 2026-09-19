import { Router } from "express";
import { Account, AccountMember, User } from "../models/index.js";
import { requireAuth, requireAccountAccess } from "../middleware/auth.js";

const router = Router();

router.get("/accounts", requireAuth, async (req, res) => {
  const memberships = await AccountMember.find({ userId: req.user._id, acceptedAt: { $ne: null } }).populate("accountId");
  res.json(memberships.map((m) => ({ ...m.accountId.toObject(), myRole: m.role })));
});

router.post("/accounts/:id/members", requireAuth, requireAccountAccess("owner", "admin"), async (req, res) => {
  const { phone, fullName, role } = req.body;
  let user = await User.findOne({ phone });
  if (!user) user = await User.create({ phone, fullName: fullName || phone });

  const existing = await AccountMember.findOne({ accountId: req.params.id, userId: user._id });
  if (existing) return res.status(409).json({ error: "Already a member" });

  const member = await AccountMember.create({
    accountId: req.params.id,
    userId: user._id,
    role: role || "member",
    invitedAt: new Date(),
    acceptedAt: new Date(), // dev: auto-accept, no invite email flow
  });
  res.status(201).json(member);
});

router.delete("/accounts/:id/members/:mid", requireAuth, requireAccountAccess("owner", "admin"), async (req, res) => {
  await AccountMember.findOneAndDelete({ _id: req.params.mid, accountId: req.params.id });
  res.status(204).end();
});

export default router;
