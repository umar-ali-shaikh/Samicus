import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Document, AuditLog } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir, limits: { fileSize: 25 * 1024 * 1024 } });

const router = Router();

router.post("/documents", requireAuth, upload.single("file"), async (req, res) => {
  const { accountId, matterId, kind } = req.body;
  if (!req.file) return res.status(400).json({ error: "file is required" });

  const doc = await Document.create({
    accountId,
    matterId: matterId || null,
    filename: req.file.originalname,
    mime: req.file.mimetype,
    sizeBytes: req.file.size,
    kind: kind || "Other",
    storageKey: req.file.filename,
    uploadedBy: req.user._id,
    virusScanStatus: "clean", // mocked scanner: everything passes in dev
  });
  res.status(201).json(doc);
});

router.post("/documents/:id/share", requireAuth, async (req, res) => {
  const { advocateId, share } = req.body;
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });

  if (share) {
    if (!doc.sharedWith.some((id) => id.toString() === advocateId)) doc.sharedWith.push(advocateId);
  } else {
    doc.sharedWith = doc.sharedWith.filter((id) => id.toString() !== advocateId);
  }
  await doc.save();
  await AuditLog.create({ actorId: req.user._id, actorRole: req.user.role, action: share ? "document_shared" : "document_share_revoked", subjectType: "Document", subjectId: doc._id });
  res.json(doc);
});

export default router;
