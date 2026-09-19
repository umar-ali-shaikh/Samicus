import { Router } from "express";
import {
  Matter,
  TimelineEvent,
  Task,
  Hearing,
  Document,
  MatterAccessGrant,
  FeeProposal,
  Invoice,
  AccountMember,
  Advocate,
  AuditLog,
} from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

async function myAccountIds(userId) {
  const memberships = await AccountMember.find({ userId, acceptedAt: { $ne: null } });
  return memberships.map((m) => m.accountId);
}

// Client accounts see their matters via AccountMember; advocates aren't members of a
// client's account, so they see matters where they're the engaged advocate instead.
async function matterScopeFilter(user) {
  if (user.role === "advocate") {
    const advocate = await Advocate.findOne({ userId: user._id });
    return { advocateId: advocate?._id };
  }
  const accountIds = await myAccountIds(user._id);
  return { accountId: { $in: accountIds } };
}

router.get("/matters", requireAuth, async (req, res) => {
  const scope = await matterScopeFilter(req.user);
  const matters = await Matter.find(scope).populate("advocateId practiceAreaId");
  res.json(matters);
});

router.get("/matters/:id", requireAuth, async (req, res) => {
  const scope = await matterScopeFilter(req.user);
  const matter = await Matter.findOne({ _id: req.params.id, ...scope }).populate("advocateId practiceAreaId");
  if (!matter) return res.status(404).json({ error: "Not found" });

  const [timeline, tasks, hearings, documents, access, feeProposals, invoices] = await Promise.all([
    TimelineEvent.find({ matterId: matter._id }).sort({ occurredAt: 1 }),
    Task.find({ matterId: matter._id }),
    Hearing.find({ matterId: matter._id }),
    Document.find({ matterId: matter._id }),
    MatterAccessGrant.find({ matterId: matter._id, revokedAt: null }),
    FeeProposal.find({ matterId: matter._id }),
    Invoice.find({ matterId: matter._id }),
  ]);

  res.json({ matter, timeline, tasks, hearings, documents, access, feeProposals, invoices });
});

router.post("/matters/:id/tasks/:tid/complete", requireAuth, async (req, res) => {
  const task = await Task.findOneAndUpdate({ _id: req.params.tid, matterId: req.params.id }, { completedAt: new Date() }, { new: true });
  await TimelineEvent.create({
    matterId: req.params.id,
    type: "task_completed",
    title: `Task marked done: ${task?.label || ""}`,
    actorType: "user",
    actorId: req.user._id,
  });
  res.json(task);
});

router.post("/matters/:id/access", requireAuth, async (req, res) => {
  const grant = await MatterAccessGrant.create({ matterId: req.params.id, ...req.body, grantedAt: new Date() });
  await AuditLog.create({ actorId: req.user._id, actorRole: req.user.role, action: "matter_access_granted", subjectType: "Matter", subjectId: req.params.id });
  res.status(201).json(grant);
});

router.delete("/matters/:id/access/:gid", requireAuth, async (req, res) => {
  await MatterAccessGrant.findByIdAndUpdate(req.params.gid, { revokedAt: new Date() });
  // Revocation is immediate and always audit-logged, per the data-model doc.
  await AuditLog.create({ actorId: req.user._id, actorRole: req.user.role, action: "matter_access_revoked", subjectType: "Matter", subjectId: req.params.id });
  res.status(204).end();
});

router.post("/matters/:id/fee-proposals", requireAuth, async (req, res) => {
  const proposal = await FeeProposal.create({ matterId: req.params.id, ...req.body });
  res.status(201).json(proposal);
});

router.post("/matters/:id/fee-proposals/:pid/accept", requireAuth, async (req, res) => {
  const proposal = await FeeProposal.findByIdAndUpdate(req.params.pid, { acceptedAt: new Date() }, { new: true });
  await Matter.findByIdAndUpdate(req.params.id, { stage: "engagement_confirmed", engagedAt: new Date() });
  await TimelineEvent.create({ matterId: req.params.id, type: "engagement_confirmed", title: "Fee proposal accepted — engagement confirmed", actorType: "user", actorId: req.user._id });
  res.json(proposal);
});

router.get("/accounts/:id/legal-spend", requireAuth, async (req, res) => {
  const matters = await Matter.find({ accountId: req.params.id });
  const invoices = await Invoice.find({ matterId: { $in: matters.map((m) => m._id) } });
  const totals = invoices.reduce(
    (acc, inv) => {
      inv.lineItems.forEach((li) => { acc[li.category] = (acc[li.category] || 0) + li.amount; });
      acc.total += inv.total;
      return acc;
    },
    { professional: 0, government: 0, platform: 0, total: 0 }
  );
  res.json({ openMatters: matters.filter((m) => !["closed", "archived"].includes(m.stage)).length, totals });
});

export default router;
