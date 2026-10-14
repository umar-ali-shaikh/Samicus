/**
 * Case-law search domain router. Ported from routes/indianKanoon.js -- zero business logic
 * here, per docs/architecture/01-target-architecture.md section 3. Response DTOs are Zod-parsed
 * (.strict() where the shape is fully known) before being sent.
 */
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import { caseLawSearchResultDto, caseLawAiAnswerDto, type CaseLawFiltersInput } from "@vidhira/contracts";
import { createRateLimiter } from "../../platform/rateLimit.js";
import * as service from "./service.js";

const router = Router();

// Every Indian Kanoon call costs real money, so the whole router sits behind sign-in and a
// tighter per-user limit than the global per-IP backstop.
const caseLawLimiter = createRateLimiter("rl:case-law:", {
  windowMs: 15 * 60 * 1000,
  limit: 60,
  keyGenerator: (req) => req.user?.id || req.ip || "unknown",
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many case-law requests — please wait a few minutes." },
});
router.use("/case-law", requireAuth, caseLawLimiter);

function filtersFromQuery(q: Record<string, unknown>): CaseLawFiltersInput {
  return {
    court: q.court as CaseLawFiltersInput["court"],
    fromDate: q.fromDate as string | undefined,
    toDate: q.toDate as string | undefined,
    title: q.title as string | undefined,
    cite: q.cite as string | undefined,
    author: q.author as string | undefined,
    bench: q.bench as string | undefined,
  };
}

router.get("/case-law/search", async (req, res) => {
  const { q, pagenum, maxpages } = req.query as Record<string, string | undefined>;
  if (!q || !q.trim()) throw new HttpError(400, "Query parameter 'q' is required.");
  const result = await service.searchCaseLaw(q, filtersFromQuery(req.query as Record<string, unknown>), pagenum ? Number(pagenum) : 0, maxpages ? Number(maxpages) : undefined);
  res.json(caseLawSearchResultDto.parse(result));
});

router.get("/case-law/ai-answer", async (req, res) => {
  const { q, topN } = req.query as Record<string, string | undefined>;
  if (!q || !q.trim()) throw new HttpError(400, "Query parameter 'q' is required.");
  const result = await service.answerCaseLaw(q, filtersFromQuery(req.query as Record<string, unknown>), topN ? Number(topN) : undefined);
  res.json(caseLawAiAnswerDto.parse(result));
});

router.get("/case-law/:docid/original", async (req, res) => {
  res.json(await service.getOriginalCaseLawDocument(req.params.docid!));
});

router.get("/case-law/:docid/fragment", async (req, res) => {
  const { q } = req.query as Record<string, string | undefined>;
  if (!q || !q.trim()) throw new HttpError(400, "Query parameter 'q' is required.");
  res.json(await service.getCaseLawFragment(req.params.docid!, q));
});

router.get("/case-law/:docid/meta", async (req, res) => {
  res.json(await service.getCaseLawMeta(req.params.docid!));
});

router.get("/case-law/:docid", async (req, res) => {
  const { maxcites, maxcitedby } = req.query as Record<string, string | undefined>;
  res.json(await service.getCaseLawDocument(req.params.docid!, maxcites ? Number(maxcites) : undefined, maxcitedby ? Number(maxcitedby) : undefined));
});

export default router;
