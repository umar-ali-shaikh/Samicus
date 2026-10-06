import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError, advocateForUser, assertAccountMember, defaultAccountId, memberAccountIds } from "../services/access.js";
import { putObject, removeObject, signedUrl } from "../services/storage.js";

const router = Router();

const ALLOWED_TYPES = new Map([
  ["application/pdf", [".pdf"]],
  ["application/msword", [".doc"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", [".docx"]],
  ["text/plain", [".txt"]],
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
]);
const KINDS = ["Notices", "Agreements", "Evidence", "Invoices", "Other"];

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

function safeName(name) {
  return path.basename(name).replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document";
}

const LIST_COLUMNS = "id, account_id, matter_id, filename, mime, size_bytes, kind, shared_with, virus_scan_status, created_at, uploaded_by";

router.post("/documents", requireAuth, upload.single("file"), async (req, res) => {
  const supabase = getSupabase();
  if (!req.file) throw new HttpError(400, "file is required");
  const ext = path.extname(req.file.originalname).toLowerCase();
  const allowedExts = ALLOWED_TYPES.get(req.file.mimetype);
  if (!allowedExts || !allowedExts.includes(ext)) throw new HttpError(415, "Only PDF, DOC/DOCX, TXT, JPG and PNG files are accepted.");

  const accountId = req.body.accountId || (await defaultAccountId(req.user.id));
  await assertAccountMember(req.user.id, accountId, ["owner", "admin", "member", "finance"]);
  const kind = KINDS.includes(req.body.kind) ? req.body.kind : "Other";

  let matterId = req.body.matterId || null;
  if (matterId) {
    const { data: matter, error } = await supabase.from("matters").select("id").eq("id", matterId).eq("account_id", accountId).maybeSingle();
    if (error) throw error;
    if (!matter) throw new HttpError(404, "Matter not found on this account.");
  }

  const key = `${accountId}/${crypto.randomUUID()}-${safeName(req.file.originalname)}`;
  await putObject(key, req.file.buffer, req.file.mimetype);

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      account_id: accountId,
      matter_id: matterId,
      filename: safeName(req.file.originalname),
      mime: req.file.mimetype,
      size_bytes: req.file.size,
      kind,
      storage_key: key,
      uploaded_by: req.user.id,
      virus_scan_status: "pending", // no malware scanner is wired in — never claim "clean"
    })
    .select(LIST_COLUMNS)
    .single();
  if (error) {
    await removeObject(key).catch(() => {});
    throw error;
  }
  res.status(201).json(doc);
});

// Library: everything on the caller's accounts, plus documents clients explicitly shared with this advocate.
router.get("/documents", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const [accountIds, advocate] = await Promise.all([memberAccountIds(req.user.id), advocateForUser(req.user.id)]);

  const queries = [];
  if (accountIds.length) {
    let q = supabase.from("documents").select(LIST_COLUMNS).in("account_id", accountIds);
    if (req.query.accountId) q = q.eq("account_id", req.query.accountId);
    if (req.query.matterId) q = q.eq("matter_id", req.query.matterId);
    queries.push(q);
  }
  if (advocate && !req.query.accountId) {
    let q = supabase.from("documents").select(LIST_COLUMNS).contains("shared_with", [advocate.id]);
    if (req.query.matterId) q = q.eq("matter_id", req.query.matterId);
    queries.push(q);
  }
  const rows = new Map();
  for (const r of await Promise.all(queries)) {
    if (r.error) throw r.error;
    for (const d of r.data) rows.set(d.id, { ...d, sharedWithMe: advocate ? d.shared_with.includes(advocate.id) : false, owned: accountIds.includes(d.account_id) });
  }
  res.json([...rows.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

async function loadReadableDocument(user, id) {
  const supabase = getSupabase();
  const { data: doc, error } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!doc) throw new HttpError(404, "Not found");

  const accountIds = await memberAccountIds(user.id);
  if (accountIds.includes(doc.account_id)) return { doc, owner: true };

  const advocate = await advocateForUser(user.id);
  if (advocate && doc.shared_with.includes(advocate.id)) return { doc, owner: false };

  if (doc.matter_id) {
    const { data: grant, error: grantError } = await supabase
      .from("matter_access_grants")
      .select("scope")
      .eq("matter_id", doc.matter_id)
      .eq("subject_id", user.id)
      .is("revoked_at", null)
      .maybeSingle();
    if (grantError) throw grantError;
    if (grant?.scope?.includes("documents")) return { doc, owner: false };
  }
  throw new HttpError(404, "Not found");
}

router.get("/documents/:id/download", requireAuth, async (req, res) => {
  const { doc } = await loadReadableDocument(req.user, req.params.id);
  const url = await signedUrl(doc.storage_key, doc.filename);
  await getSupabase().from("audit_logs").insert({ actor_id: req.user.id, actor_role: req.user.role, action: "document_downloaded", subject_type: "Document", subject_id: doc.id });
  res.json({ url, expiresInSeconds: 60 });
});

router.post("/documents/:id/share", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { advocateId, share } = req.body || {};
  const { doc, owner } = await loadReadableDocument(req.user, req.params.id);
  if (!owner) throw new HttpError(403, "Only the document's owner can change sharing.");
  await assertAccountMember(req.user.id, doc.account_id, ["owner", "admin", "member"]);

  // May only be shared with an advocate this account actually works with.
  const [matters, consultations] = await Promise.all([
    supabase.from("matters").select("advocate_id").eq("account_id", doc.account_id),
    supabase.from("consultations").select("advocate_id").eq("account_id", doc.account_id),
  ]);
  if (matters.error) throw matters.error;
  if (consultations.error) throw consultations.error;
  const allowedAdvocates = new Set([...matters.data, ...consultations.data].map((r) => r.advocate_id));
  if (!allowedAdvocates.has(advocateId)) throw new HttpError(403, "You can only share with an advocate you are working with.");

  const current = doc.shared_with || [];
  const sharedWith = share ? [...new Set([...current, advocateId])] : current.filter((id) => id !== advocateId);

  const { data: updated, error: updateError } = await supabase.from("documents").update({ shared_with: sharedWith }).eq("id", doc.id).select(LIST_COLUMNS).single();
  if (updateError) throw updateError;

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: req.user.id, actor_role: req.user.role, action: share ? "document_shared" : "document_share_revoked", subject_type: "Document", subject_id: doc.id,
  });
  if (auditError) throw auditError;
  res.json(updated);
});

router.delete("/documents/:id", requireAuth, async (req, res) => {
  const { doc, owner } = await loadReadableDocument(req.user, req.params.id);
  if (!owner) throw new HttpError(403, "Only the document's owner can delete it.");
  await assertAccountMember(req.user.id, doc.account_id, ["owner", "admin"]).catch(async () => {
    if (doc.uploaded_by !== req.user.id) throw new HttpError(403, "Only the uploader or an account admin can delete this document.");
  });
  await removeObject(doc.storage_key).catch((err) => console.error("Storage delete failed:", err.message));
  const { error } = await getSupabase().from("documents").delete().eq("id", doc.id);
  if (error) throw error;
  res.status(204).end();
});

export { loadReadableDocument };
export default router;
