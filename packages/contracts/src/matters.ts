/**
 * Matters domain contracts. Ported from apps/api/src/routes/matters.js's inline validation
 * and its handlers' response shapes (full-row matters/tasks/hearings/timeline_events, the
 * matter detail aggregate, and the legal-spend summary).
 */
import { z } from "zod";

export const MATTER_STAGES = ["intake", "lawyer_matched", "consultation", "engagement_confirmed", "action_in_progress", "resolution", "closed", "archived"] as const;
export const MATTER_SIDES = ["client", "advocate", "viewer"] as const;
export const ACCESS_SCOPES = ["documents", "messages", "tasks", "fees"] as const;

// --- Request schemas ---

export const matterPatchSchema = z.object({
  stage: z.enum(["consultation", "engagement_confirmed", "action_in_progress", "resolution", "closed"]).optional(),
  nextAction: z.string().trim().max(300).optional(),
  forum: z.string().trim().max(160).optional(),
  title: z.string().trim().min(3).max(200).optional(),
});
export type MatterPatchInput = z.infer<typeof matterPatchSchema>;

export const taskSchema = z.object({
  label: z.string().trim().min(2).max(300),
  ownerType: z.enum(["client", "advocate"]).default("client"),
  dueAt: z.string().datetime({ offset: true }).optional(),
  isStatutoryDeadline: z.boolean().default(false),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const hearingSchema = z.object({
  listedAt: z.string().datetime({ offset: true }),
  forum: z.string().trim().max(160).optional(),
  courtHall: z.string().trim().max(60).optional(),
  purpose: z.string().trim().max(300).optional(),
});
export type HearingInput = z.infer<typeof hearingSchema>;

export const accessGrantSchema = z.object({
  email: z.string().trim().email(),
  role: z.string().trim().max(60).default("Viewer"),
  scope: z.array(z.enum(ACCESS_SCOPES)).min(1),
});
export type AccessGrantInput = z.infer<typeof accessGrantSchema>;

export const feeProposalSchema = z.object({
  scopeText: z.string().trim().min(10).max(4000),
  milestones: z.array(z.object({ label: z.string().trim().min(2).max(200), amount: z.number().min(0), trigger: z.string().trim().max(200).optional() })).min(1).max(12),
  statutoryEstimate: z.string().trim().max(300).optional(),
  exclusions: z.array(z.string().trim().max(200)).max(10).default([]),
  validUntil: z.string().datetime({ offset: true }).optional(),
});
export type FeeProposalInput = z.infer<typeof feeProposalSchema>;

export const invoiceSchema = z.object({
  items: z.array(z.object({ label: z.string().trim().min(2).max(200), amount: z.number().positive(), category: z.enum(["professional", "government"]) })).min(1).max(12),
  dueAt: z.string().datetime({ offset: true }).optional(),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

// --- Response DTOs ---

const matterAdvocateDto = z.object({ id: z.string(), city: z.string().nullable(), user: z.object({ full_name: z.string(), avatar_url: z.string().nullable() }).strict().nullable() }).strict();

export const matterDto = z
  .object({
    id: z.string(),
    reference: z.string(),
    account_id: z.string(),
    advocate_id: z.string(),
    title: z.string(),
    practice_area_id: z.string().nullable(),
    forum: z.string().nullable(),
    stage: z.enum(MATTER_STAGES),
    next_action: z.string().nullable(),
    opened_at: z.string(),
    engaged_at: z.string().nullable(),
    closed_at: z.string().nullable(),
    archive_retention_until: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    advocate: matterAdvocateDto.nullable(),
    practice_area: z.object({ name: z.string() }).strict().nullable(),
    account: z.object({ display_name: z.string(), type: z.string() }).strict().nullable(),
  })
  .strict();
export type MatterDto = z.infer<typeof matterDto>;

export const matterListItemDto = matterDto.extend({ mySide: z.enum(["client", "advocate"]) });
export type MatterListItemDto = z.infer<typeof matterListItemDto>;

export const taskDto = z
  .object({
    id: z.string(),
    matter_id: z.string(),
    label: z.string(),
    owner_type: z.enum(["client", "advocate"]),
    due_at: z.string().nullable(),
    is_statutory_deadline: z.boolean(),
    completed_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type TaskDto = z.infer<typeof taskDto>;

export const myTaskDto = taskDto.extend({ matter: z.object({ id: z.string(), title: z.string(), reference: z.string() }).strict() });
export type MyTaskDto = z.infer<typeof myTaskDto>;

export const hearingDto = z
  .object({
    id: z.string(),
    matter_id: z.string(),
    forum: z.string().nullable(),
    court_hall: z.string().nullable(),
    listed_at: z.string(),
    purpose: z.string().nullable(),
    outcome_note: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type HearingDto = z.infer<typeof hearingDto>;

export const timelineEventDto = z
  .object({
    id: z.string(),
    matter_id: z.string(),
    type: z.string().nullable(),
    title: z.string(),
    body: z.string().nullable(),
    actor_type: z.enum(["user", "advocate", "system", "platform"]),
    actor_id: z.string().nullable(),
    occurred_at: z.string(),
    created_at: z.string(),
  })
  .strict();
export type TimelineEventDto = z.infer<typeof timelineEventDto>;

export const accessGrantDto = z
  .object({
    id: z.string(),
    matter_id: z.string(),
    subject_id: z.string(),
    subject_type: z.enum(["user", "advocate"]),
    subject_name: z.string().nullable(),
    subject_role: z.string().nullable(),
    scope: z.array(z.enum(ACCESS_SCOPES)),
    granted_at: z.string(),
    revoked_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type AccessGrantDto = z.infer<typeof accessGrantDto>;

export const feeProposalDto = z
  .object({
    id: z.string(),
    matter_id: z.string(),
    advocate_id: z.string(),
    scope_text: z.string().nullable(),
    milestones: z.array(z.object({ label: z.string(), amount: z.number(), trigger: z.string().optional() })),
    statutory_estimate: z.string().nullable(),
    exclusions: z.array(z.string()),
    valid_until: z.string().nullable(),
    accepted_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type FeeProposalDto = z.infer<typeof feeProposalDto>;

export const invoiceLineItemDto = z
  .object({
    id: z.string(),
    invoice_id: z.string(),
    position: z.number(),
    label: z.string().nullable(),
    amount: z.number().nullable(),
    category: z.enum(["professional", "government", "platform"]),
    tax_rate: z.number(),
  })
  .strict();
export type InvoiceLineItemDto = z.infer<typeof invoiceLineItemDto>;

export const invoiceDto = z
  .object({
    id: z.string(),
    matter_id: z.string(),
    total: z.number(),
    due_at: z.string().nullable(),
    status: z.enum(["draft", "due", "paid", "overdue"]),
    created_at: z.string(),
    updated_at: z.string(),
    invoice_line_items: z.array(invoiceLineItemDto).optional(),
  })
  .strict();
export type InvoiceDto = z.infer<typeof invoiceDto>;

export const invoiceCreateResultDto = invoiceDto.extend({ gst: z.number() });
export type InvoiceCreateResultDto = z.infer<typeof invoiceCreateResultDto>;

// Narrower than documents.ts's full documentDto -- repository.listDocumentsForMatter only
// ever selects this subset (no account_id/matter_id/virus_scan_status), matching the
// original route's inline column list exactly.
const matterDocumentDto = z
  .object({
    id: z.string(),
    filename: z.string(),
    mime: z.string().nullable(),
    size_bytes: z.number().nullable(),
    kind: z.enum(["Notices", "Agreements", "Evidence", "Invoices", "Other"]),
    shared_with: z.array(z.string()),
    created_at: z.string(),
    uploaded_by: z.string(),
  })
  .strict();
export type MatterDocumentDto = z.infer<typeof matterDocumentDto>;

export const matterDetailDto = z
  .object({
    matter: matterDto,
    side: z.enum(MATTER_SIDES),
    timeline: z.array(timelineEventDto),
    tasks: z.array(taskDto),
    hearings: z.array(hearingDto),
    documents: z.array(matterDocumentDto),
    access: z.array(accessGrantDto),
    feeProposals: z.array(feeProposalDto),
    invoices: z.array(invoiceDto),
  })
  .strict();
export type MatterDetailDto = z.infer<typeof matterDetailDto>;

export const legalSpendDto = z
  .object({
    openMatters: z.number(),
    totals: z.object({ professional: z.number(), government: z.number(), platform: z.number(), total: z.number(), paid: z.number() }).strict(),
  })
  .strict();
export type LegalSpendDto = z.infer<typeof legalSpendDto>;
