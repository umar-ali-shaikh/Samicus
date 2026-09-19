import { Router } from "express";
import { User, Account, AccountMember } from "../models/index.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = Router();

// Mocked SMS provider: every phone accepts process.env.DEV_OTP.
router.post("/auth/otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "phone is required" });
  res.json({ ok: true, message: `OTP sent to ${phone} (dev mode: use ${process.env.DEV_OTP})` });
});

router.post("/auth/verify", async (req, res) => {
  const { phone, otp, fullName } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: "phone and otp are required" });
  if (otp !== process.env.DEV_OTP) return res.status(401).json({ error: "Invalid OTP" });

  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({ phone, fullName: fullName || "New user" });
    const account = await Account.create({ type: "individual", displayName: user.fullName });
    await AccountMember.create({ accountId: account._id, userId: user._id, role: "owner", acceptedAt: new Date() });
  }

  const token = signToken(user);
  res.json({ token, user });
});

router.get("/me", requireAuth, async (req, res) => {
  const accounts = await AccountMember.find({ userId: req.user._id, acceptedAt: { $ne: null } }).populate("accountId");
  res.json({ user: req.user, accounts: accounts.map((m) => ({ ...m.accountId.toObject(), myRole: m.role })) });
});

export default router;
