import jwt from "jsonwebtoken";
import { User, AccountMember } from "../models/index.js";

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: "12h" });
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

// Confirms req.user is a member of :accountId (route param) with one of the given roles.
export function requireAccountAccess(...roles) {
  return async (req, res, next) => {
    const accountId = req.params.id || req.params.accountId || req.body.accountId;
    const membership = await AccountMember.findOne({ accountId, userId: req.user._id, acceptedAt: { $ne: null } });
    if (!membership || (roles.length && !roles.includes(membership.role))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    req.membership = membership;
    next();
  };
}
