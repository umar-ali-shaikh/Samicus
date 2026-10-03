import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError } from "../services/access.js";
import { TABS } from "../services/analytics/index.js";

const router = Router();

// Aggregated business data only — matter contents and privileged messages are never exposed here.
router.get("/admin/analytics/:tab", requireAuth, requireRole("founder"), async (req, res) => {
  const compute = TABS[req.params.tab];
  if (!compute) throw new HttpError(404, `Unknown analytics tab "${req.params.tab}"`);
  res.json({ tab: req.params.tab, refreshedAt: new Date().toISOString(), payload: await compute() });
});

export default router;
