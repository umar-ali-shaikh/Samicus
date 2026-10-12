/**
 * Research library domain router. Ported from routes/research.js -- zero business logic
 * here, per docs/architecture/01-target-architecture.md section 3. Response DTOs are
 * Zod-parsed before being sent.
 */
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import {
  retrieveResearchSchema,
  answerResearchSchema,
  patchResearchQuerySchema,
  askResearchFollowUpSchema,
  researchRetrieveResultDto,
  researchReportDto,
  researchQueryListItemDto,
  researchQueryRowDto,
  researchChatTurnDto,
  corpusDocumentListItemDto,
  corpusDocumentDetailDto,
  corpusChunkBriefDto,
  corpusChunkDetailDto,
  corpusStatusDto,
} from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message || "Invalid request.");
  return result.data;
}

router.post("/research/retrieve", requireAuth, async (req, res) => {
  const input = parse(retrieveResearchSchema, req.body);
  const result = await service.retrieveStep(req.user!, input);
  res.json(researchRetrieveResultDto.parse(result));
});

router.post("/research/answer", requireAuth, async (req, res) => {
  const input = parse(answerResearchSchema, req.body);
  const result = await service.answerStep(req.user!, input);
  res.json(researchReportDto.parse(result));
});

router.get("/research/queries/:id/report", requireAuth, async (req, res) => {
  const result = await service.getReport(req.user!, String(req.params.id));
  res.json(researchReportDto.parse(result));
});

router.get("/research/queries", requireAuth, async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const result = await service.listQueries(req.user!, {
    accountId: q.accountId,
    examplesOnly: q.tag === "example",
    pinnedOnly: q.pinned === "true",
    tag: q.tag,
    textSearch: q.q,
  });
  res.json(z.array(researchQueryListItemDto).parse(result));
});

router.patch("/research/queries/:id", requireAuth, async (req, res) => {
  const input = parse(patchResearchQuerySchema, req.body);
  const result = await service.patchQuery(req.user!, String(req.params.id), input);
  res.json(researchQueryRowDto.parse(result));
});

router.delete("/research/queries/:id", requireAuth, async (req, res) => {
  await service.deleteQuery(req.user!, String(req.params.id));
  res.json({ deleted: true });
});

router.post("/research/queries/:id/refresh", requireAuth, async (req, res) => {
  const result = await service.refreshQuery(req.user!, String(req.params.id));
  res.json(result);
});

router.post("/research/queries/:id/ask", requireAuth, async (req, res) => {
  const input = parse(askResearchFollowUpSchema, req.body);
  const result = await service.askFollowUp(req.user!, String(req.params.id), input);
  res.json(researchChatTurnDto.parse(result));
});

router.get("/research/queries/:id/chat", requireAuth, async (req, res) => {
  const result = await service.getChatTurns(req.user!, String(req.params.id));
  res.json(z.array(researchChatTurnDto).parse(result));
});

router.get("/research/queries/:id/export.pdf", requireAuth, async (req, res) => {
  const { pdf, filename } = await service.exportPdf(req.user!, String(req.params.id));
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` });
  res.send(pdf);
});

// Browse list for the Research library's default (no-query) view -- so the page never looks
// empty just because the user hasn't typed a search yet.
router.get("/corpus/documents", requireAuth, async (_req, res) => {
  const result = await service.listCorpusDocuments();
  res.json(z.array(corpusDocumentListItemDto).parse(result));
});

router.get("/corpus/documents/:id", requireAuth, async (req, res) => {
  const result = await service.getCorpusDocument(String(req.params.id));
  res.json(corpusDocumentDetailDto.parse(result));
});

// Every passage indexed for one document, in reading order -- lets the browse list ("already
// indexed" view) be read in-app instead of only linking out to the external source.
router.get("/corpus/documents/:id/chunks", requireAuth, async (req, res) => {
  const result = await service.getCorpusDocumentChunks(String(req.params.id));
  res.json(z.array(corpusChunkBriefDto).parse(result));
});

router.get("/corpus/chunks/:id", requireAuth, async (req, res) => {
  const result = await service.getCorpusChunk(String(req.params.id));
  res.json(corpusChunkDetailDto.parse(result));
});

router.get("/corpus/status", requireAuth, async (_req, res) => {
  const result = await service.getCorpusStatus();
  res.json(corpusStatusDto.parse(result));
});

export default router;
