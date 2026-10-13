/**
 * Pack-compliance domain router. Ported from routes/pack.js -- zero business logic here, per
 * docs/architecture/01-target-architecture.md section 3. Response DTOs are Zod-parsed
 * (.strict()) before being sent.
 */
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import {
  putRulesetSchema,
  createScanSchema,
  packCategoryDto,
  packRulesetDto,
  packScanDto,
  rulesetDiffDto,
} from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return result.data;
}

router.get("/pack/categories", requireAuth, async (_req, res) => {
  res.json(z.array(packCategoryDto).parse(await service.listCategories()));
});

router.get("/pack/rulesets/:categoryId", requireAuth, async (req, res) => {
  res.json(packRulesetDto.parse(await service.getRuleset(String(req.params.categoryId))));
});

// --- Ruleset administration (compliance rules are curated by admins, never hard-coded) ---

router.put("/admin/pack-rulesets", requireAuth, requireRole("admin"), async (req, res) => {
  const input = parse(putRulesetSchema, req.body);
  res.status(201).json(packRulesetDto.parse(await service.putRuleset(input)));
});

// --- Scans ---

router.post("/pack/scans", requireAuth, async (req, res) => {
  const input = parse(createScanSchema, req.body);
  res.status(201).json(packScanDto.parse(await service.createScan(req.user!, input)));
});

router.get("/pack/scans/:id", requireAuth, async (req, res) => {
  res.json(packScanDto.parse(await service.getScan(req.user!, String(req.params.id))));
});

router.post("/pack/scans/:id/approve", requireAuth, async (req, res) => {
  res.json(packScanDto.parse(await service.approveScan(req.user!, String(req.params.id))));
});

router.get("/pack/drift", requireAuth, async (req, res) => {
  res.json(z.array(rulesetDiffDto).parse(await service.getDrift(req.user!)));
});

router.get("/pack/portfolio", requireAuth, async (req, res) => {
  const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
  res.json(z.array(packScanDto).parse(await service.getPortfolio(req.user!, accountId)));
});

export default router;
