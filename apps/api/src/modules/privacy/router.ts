/**
 * Privacy domain router. Ported from routes/privacy.js -- zero business logic here, per
 * docs/architecture/01-target-architecture.md section 3.
 */
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { myDataExportDto } from "@vidhira/contracts";
import * as service from "./service.js";

const router = Router();

router.post("/privacy/export", requireAuth, async (req, res) => {
  const result = await service.exportMyData(req.user!);
  res.setHeader("Content-Disposition", 'attachment; filename="vidhira-my-data.json"');
  res.json(myDataExportDto.parse(result));
});

router.post("/privacy/delete", requireAuth, async (req, res) => {
  await service.deleteMyAccount(req.user!);
  res.status(204).end();
});

export default router;
