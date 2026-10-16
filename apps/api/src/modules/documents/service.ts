/**
 * Business logic for the documents domain. Ported from routes/documents.js -- same
 * behaviour, including the exact validation order, error messages and access rules, split
 * out from HTTP concerns.
 */
import crypto from "crypto";
import path from "path";
import { HttpError, advocateForUser, assertAccountMember, defaultAccountId, memberAccountIds } from "../../services/access.js";
import { putObject, removeObject, signedUrl } from "../../services/storage.js";
import { scanBuffer } from "../../platform/clamav.js";
import { logAudit } from "../../platform/audit.js";
import { DOCUMENT_KINDS } from "@vidhira/contracts";
import type { DocumentDto, DocumentDownloadDto, DocumentListItemDto, ShareDocumentInput } from "@vidhira/contracts";
import * as repo from "./repository.js";

const ALLOWED_TYPES = new Map<string, string[]>([
  ["application/pdf", [".pdf"]],
  ["application/msword", [".doc"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", [".docx"]],
  ["text/plain", [".txt"]],
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
]);

function safeName(name: string): string {
  return path.basename(name).replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document";
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface UploadDocumentBody {
  accountId?: string;
  matterId?: string;
  kind?: string;
}

export async function uploadDocument(user: { id: string }, file: UploadedFile | undefined, body: UploadDocumentBody): Promise<DocumentDto> {
  if (!file) throw new HttpError(400, "file is required");
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ALLOWED_TYPES.get(file.mimetype);
  if (!allowedExts || !allowedExts.includes(ext)) throw new HttpError(415, "Only PDF, DOC/DOCX, TXT, JPG and PNG files are accepted.");

  const accountId = body.accountId || (await defaultAccountId(user.id));
  if (!accountId) throw new HttpError(400, "accountId is required.");
  await assertAccountMember(user.id, accountId, ["owner", "admin", "member", "finance"]);
  const kind = (DOCUMENT_KINDS as readonly string[]).includes(body.kind ?? "") ? (body.kind as (typeof DOCUMENT_KINDS)[number]) : "Other";

  const matterId = body.matterId || null;
  if (matterId) {
    const matter = await repo.findMatterOnAccount(matterId, accountId);
    if (!matter) throw new HttpError(404, "Matter not found on this account.");
  }

  // Scanned before anything is stored: an infected file never reaches the bucket.
  const scan = await scanBuffer(file.buffer);
  if (scan.status === "infected") {
    await logAudit({ actorId: user.id, action: "document_upload_blocked_malware", subjectType: "account", subjectId: accountId, reason: scan.signature, outcome: "denied" }).catch(() => {}); // a failed audit write must not turn a malware block into a 500
    throw new HttpError(422, "This file was flagged by our malware scanner and wasn't uploaded. If you think that's a mistake, contact support.");
  }

  const key = `${accountId}/${crypto.randomUUID()}-${safeName(file.originalname)}`;
  await putObject(key, file.buffer, file.mimetype);

  try {
    const doc = await repo.insertDocument({
      accountId,
      matterId,
      filename: safeName(file.originalname),
      mime: file.mimetype,
      sizeBytes: file.size,
      kind,
      storageKey: key,
      uploadedBy: user.id,
      // "pending" whenever no real scan happened (scanner not configured or unreachable) --
      // never claim "clean" without one.
      virusScanStatus: scan.status === "clean" ? "clean" : "pending",
    });
    return doc as unknown as DocumentDto;
  } catch (err) {
    await removeObject(key).catch(() => {});
    throw err;
  }
}

export interface DocumentListQuery {
  accountId?: string;
  matterId?: string;
}

// Library: everything on the caller's accounts, plus documents clients explicitly shared with this advocate.
export async function listDocuments(user: { id: string }, query: DocumentListQuery): Promise<DocumentListItemDto[]> {
  const [accountIds, advocate] = await Promise.all([memberAccountIds(user.id), advocateForUser(user.id)]);

  const [byAccount, byShare] = await Promise.all([
    accountIds.length ? repo.listDocumentsForAccounts(accountIds, query) : Promise.resolve([]),
    advocate && !query.accountId ? repo.listDocumentsSharedWithAdvocate(advocate.id, query) : Promise.resolve([]),
  ]);

  const rows = new Map<string, DocumentListItemDto>();
  for (const d of [...byAccount, ...byShare]) {
    rows.set(d.id, { ...d, sharedWithMe: advocate ? d.shared_with.includes(advocate.id) : false, owned: accountIds.includes(d.account_id) } as DocumentListItemDto);
  }
  return [...rows.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export interface ReadableDocumentContext {
  doc: repo.FullDocumentRow;
  owner: boolean;
}

export async function loadReadableDocument(user: { id: string }, id: string): Promise<ReadableDocumentContext> {
  const doc = await repo.findDocumentById(id);
  if (!doc) throw new HttpError(404, "Not found");

  const accountIds = await memberAccountIds(user.id);
  if (accountIds.includes(doc.account_id)) return { doc, owner: true };

  const advocate = await advocateForUser(user.id);
  if (advocate && doc.shared_with.includes(advocate.id)) return { doc, owner: false };

  if (doc.matter_id) {
    const grant = await repo.findActiveAccessGrantScope(doc.matter_id, user.id);
    if (grant?.scope?.includes("documents")) return { doc, owner: false };
  }
  throw new HttpError(404, "Not found");
}

export async function downloadDocument(user: { id: string; role: string }, id: string): Promise<DocumentDownloadDto> {
  const { doc } = await loadReadableDocument(user, id);
  const url = await signedUrl(doc.storage_key, doc.filename);
  await repo.insertAuditLog({ actorId: user.id, actorRole: user.role, action: "document_downloaded", subjectId: doc.id });
  return { url, expiresInSeconds: 60 };
}

export async function shareDocument(user: { id: string; role: string }, id: string, input: ShareDocumentInput): Promise<DocumentDto> {
  const { doc, owner } = await loadReadableDocument(user, id);
  if (!owner) throw new HttpError(403, "Only the document's owner can change sharing.");
  await assertAccountMember(user.id, doc.account_id, ["owner", "admin", "member"]);

  // May only be shared with an advocate this account actually works with.
  const allowedAdvocates = new Set(await repo.listAdvocateIdsWorkedWithByAccount(doc.account_id));
  if (!allowedAdvocates.has(input.advocateId)) throw new HttpError(403, "You can only share with an advocate you are working with.");

  const current = doc.shared_with || [];
  const sharedWith = input.share ? [...new Set([...current, input.advocateId])] : current.filter((a) => a !== input.advocateId);

  const updated = await repo.updateSharedWith(doc.id, sharedWith);
  await repo.insertAuditLog({ actorId: user.id, actorRole: user.role, action: input.share ? "document_shared" : "document_share_revoked", subjectId: doc.id });
  return updated as unknown as DocumentDto;
}

export async function deleteDocument(user: { id: string }, id: string): Promise<void> {
  const { doc, owner } = await loadReadableDocument(user, id);
  if (!owner) throw new HttpError(403, "Only the document's owner can delete it.");
  try {
    await assertAccountMember(user.id, doc.account_id, ["owner", "admin"]);
  } catch {
    if (doc.uploaded_by !== user.id) throw new HttpError(403, "Only the uploader or an account admin can delete this document.");
  }
  await removeObject(doc.storage_key).catch((err: Error) => console.error("Storage delete failed:", err.message));
  await repo.deleteDocumentRow(doc.id);
}
