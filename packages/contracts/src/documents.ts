/**
 * Documents domain contracts. Ported from apps/api/src/routes/documents.js's response shapes
 * (LIST_COLUMNS -- storage_key and encryption_key_id are never selected, let alone returned).
 * Upload is multipart/form-data (file + accountId/matterId/kind fields), so there is no JSON
 * request schema for it; `kind` is validated the same way the original did (allow-list,
 * default "Other" for anything else) rather than rejected outright.
 */
import { z } from "zod";

export const DOCUMENT_KINDS = ["Notices", "Agreements", "Evidence", "Invoices", "Other"] as const;
export const VIRUS_SCAN_STATUSES = ["pending", "clean", "infected"] as const;

export const documentListItemDto = z
  .object({
    id: z.string(),
    account_id: z.string(),
    matter_id: z.string().nullable(),
    filename: z.string(),
    mime: z.string().nullable(),
    size_bytes: z.number().nullable(),
    kind: z.enum(DOCUMENT_KINDS),
    shared_with: z.array(z.string()),
    virus_scan_status: z.enum(VIRUS_SCAN_STATUSES),
    created_at: z.string(),
    uploaded_by: z.string(),
    sharedWithMe: z.boolean(),
    owned: z.boolean(),
  })
  .strict();
export type DocumentListItemDto = z.infer<typeof documentListItemDto>;

// The upload/share responses don't include sharedWithMe/owned (those are computed only for
// the list endpoint, same as the original's per-row map in GET /documents).
export const documentDto = documentListItemDto.omit({ sharedWithMe: true, owned: true });
export type DocumentDto = z.infer<typeof documentDto>;

export const documentDownloadDto = z.object({ url: z.string(), expiresInSeconds: z.number() }).strict();
export type DocumentDownloadDto = z.infer<typeof documentDownloadDto>;

export const shareDocumentSchema = z.object({
  advocateId: z.string().uuid(),
  share: z.boolean(),
});
export type ShareDocumentInput = z.infer<typeof shareDocumentSchema>;
