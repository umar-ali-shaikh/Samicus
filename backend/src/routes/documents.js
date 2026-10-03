import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir, limits: { fileSize: 25 * 1024 * 1024 } });

const router = Router();

router.post("/documents", requireAuth, upload.single("file"), async (req, res) => {
  const { accountId, matterId, kind } = req.body;
  if (!req.file) return res.status(400).json({ error: "file is required" });

  const { data: doc, error } = await getSupabase()
    .from("documents")
    .insert({
      account_id: accountId,
      matter_id: matterId || null,
      filename: req.file.originalname,
      mime: req.file.mimetype,
      size_bytes: req.file.size,
      kind: kind || "Other",
      storage_key: req.file.filename,
      uploaded_by: req.user.id,
      virus_scan_status: "clean", // mocked scanner: everything passes in dev
    })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(doc);
});

router.post("/documents/:id/share", requireAuth, async (req, res) => {
  const { advocateId, share } = req.body;
  const supabase = getSupabase();
  const { data: doc, error } = await supabase.from("documents").select("*").eq("id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!doc) return res.status(404).json({ error: "Not found" });

  const sharedWith = share
    ? doc.shared_with.includes(advocateId)
      ? doc.shared_with
      : [...doc.shared_with, advocateId]
    : doc.shared_with.filter((id) => id !== advocateId);

  const { data: updated, error: updateError } = await supabase
    .from("documents")
    .update({ shared_with: sharedWith })
    .eq("id", req.params.id)
    .select()
    .single();
  if (updateError) throw updateError;

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: req.user.id,
    actor_role: req.user.role,
    action: share ? "document_shared" : "document_share_revoked",
    subject_type: "Document",
    subject_id: doc.id,
  });
  if (auditError) throw auditError;

  res.json(updated);
});

export default router;
