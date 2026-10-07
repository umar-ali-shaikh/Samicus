/**
 * Documents domain router. Ported from routes/documents.js -- zero business logic here, per
 * docs/architecture/01-target-architecture.md section 3. Response DTOs are Zod-parsed
 * (.strict()) before being sent.
 */
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import { shareDocumentSchema, documentDto, documentListItemDto, documentDownloadDto } from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return result.data;
}

router.post("/documents", requireAuth, upload.single("file"), async (req, res) => {
  const doc = await service.uploadDocument(req.user!, req.file, req.body);
  res.status(201).json(documentDto.parse(doc));
});

router.get("/documents", requireAuth, async (req, res) => {
  const docs = await service.listDocuments(req.user!, { accountId: req.query.accountId as string | undefined, matterId: req.query.matterId as string | undefined });
  res.json(docs.map((d) => documentListItemDto.parse(d)));
});

router.get("/documents/:id/download", requireAuth, async (req, res) => {
  const result = await service.downloadDocument(req.user!, req.params.id as string);
  res.json(documentDownloadDto.parse(result));
});

router.post("/documents/:id/share", requireAuth, async (req, res) => {
  const input = parse(shareDocumentSchema, req.body);
  const doc = await service.shareDocument(req.user!, req.params.id as string, input);
  res.json(documentDto.parse(doc));
});

router.delete("/documents/:id", requireAuth, async (req, res) => {
  await service.deleteDocument(req.user!, req.params.id as string);
  res.status(204).end();
});

export default router;
