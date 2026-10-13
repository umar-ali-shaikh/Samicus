/**
 * Founder (Command Centre analytics) domain router. Ported from routes/founder.js -- zero
 * business logic here, per docs/architecture/01-target-architecture.md section 3.
 */
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { founderAnalyticsResponseDto } from "@vidhira/contracts";
import * as service from "./service.js";

const router = Router();

// Aggregated business data only -- matter contents and privileged messages are never exposed here.
router.get("/admin/analytics/:tab", requireAuth, requireRole("founder"), async (req, res) => {
  const result = await service.getAnalyticsTab(String(req.params.tab));
  res.json(founderAnalyticsResponseDto.parse(result));
});

export default router;
