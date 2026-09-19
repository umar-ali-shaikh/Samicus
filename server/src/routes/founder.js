import { Router } from "express";
import { AnalyticsSnapshot, CorporateAccountHealth, AdvocatePerformanceRow, KnowledgeGap, Complaint, AdminAccessGrant, AuditLog, Matter } from "../models/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireRole("founder"));

const TAB_MODELS = {
  fcorp: () => CorporateAccountHealth.find(),
  fadv: () => AdvocatePerformanceRow.find().populate("advocateId"),
  fai_gaps: () => KnowledgeGap.find().sort({ askedCount: -1 }),
  fcomplaints: () => Complaint.find().sort({ createdAt: -1 }),
};

router.get("/admin/analytics/:tab", async (req, res) => {
  const { tab } = req.params;
  const snapshot = await AnalyticsSnapshot.findOne({ tab });
  const extra = {};
  if (tab === "fcorp") extra.accounts = await TAB_MODELS.fcorp();
  if (tab === "fadv") extra.rows = await TAB_MODELS.fadv();
  if (tab === "fai") extra.knowledgeGaps = await TAB_MODELS.fai_gaps();
  if (tab === "fcomplaints") extra.complaints = await TAB_MODELS.fcomplaints();

  if (!snapshot && Object.keys(extra).length === 0) return res.status(404).json({ error: `No analytics snapshot for tab "${tab}"` });
  res.json({ tab, refreshedAt: snapshot?.refreshedAt, payload: snapshot?.payload || {}, ...extra });
});

// "Ask the data": only answers from what's actually on the dashboard, else an explicit
// refusal — the same non-hallucination contract as Vidhira, applied to internal BI.
router.post("/admin/analytics/ask", async (req, res) => {
  const { question } = req.body;
  const snapshot = await AnalyticsSnapshot.findOne({ tab: "founder" });
  const canned = snapshot?.payload?.ask || [];

  const qTokens = new Set(question.toLowerCase().split(/\s+/).filter((t) => t.length > 3));
  let best = null;
  let bestScore = 0;
  for (const item of canned) {
    const itemTokens = new Set(item.q.toLowerCase().split(/\s+/).filter((t) => t.length > 3));
    const overlap = [...qTokens].filter((t) => itemTokens.has(t)).length;
    if (overlap > bestScore) { bestScore = overlap; best = item; }
  }

  if (!best || bestScore === 0) {
    return res.json({ answered: false, message: "This dashboard holds no figure for that. Rather than estimate, it says nothing." });
  }
  res.json({ answered: true, answer: best.a, figures: best.f });
});

// Access-with-reason + audit-log gate before any privileged matter content can be viewed.
// An empty reason is refused, and the refusal itself is logged.
router.post("/admin/access-requests", async (req, res) => {
  const { matterId, reason } = req.body;
  const matter = await Matter.findById(matterId);
  if (!matter) return res.status(404).json({ error: "Matter not found" });

  if (!reason || !reason.trim()) {
    await AdminAccessGrant.create({ actorId: req.user._id, matterId, reason: "", outcome: "denied" });
    await AuditLog.create({ actorId: req.user._id, actorRole: "founder", action: "matter_access_request_denied", subjectType: "Matter", subjectId: matterId, outcome: "denied" });
    return res.status(422).json({ error: "A reason is required to request access to matter contents." });
  }

  await AdminAccessGrant.create({ actorId: req.user._id, matterId, reason, outcome: "recorded" });
  await AuditLog.create({ actorId: req.user._id, actorRole: "founder", action: "matter_access_requested", subjectType: "Matter", subjectId: matterId, reason, outcome: "recorded" });
  res.status(201).json({ ok: true });
});

router.get("/admin/access-requests", async (req, res) => {
  res.json(await AdminAccessGrant.find().sort({ createdAt: -1 }).populate("matterId actorId"));
});

export default router;
