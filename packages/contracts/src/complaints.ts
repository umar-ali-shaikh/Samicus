/**
 * Complaints domain contracts. Ported from routes/complaints.js's inline createSchema/
 * updateSchema and its handlers' response shapes.
 */
import { z } from "zod";

export const COMPLAINT_CATEGORIES = ["deliverable_delay", "compliance_coverage", "supply_gap", "citation_accuracy", "payment", "advocate_conduct", "other"] as const;

export const createComplaintSchema = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(20).max(4000),
  category: z.enum(COMPLAINT_CATEGORIES).default("other"),
  serviceInvolved: z.string().trim().max(80).optional(),
  linkedRecordType: z.enum(["matter", "consultation", "pack_scan", "research_query", "payment"]).optional(),
  linkedRecordId: z.string().uuid().optional(),
});
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;

export const updateComplaintSchema = z.object({
  status: z.enum(["open", "escalated", "resolved"]).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  owner: z.string().trim().max(80).optional(),
  rootCause: z.string().trim().max(1000).optional(),
  correctiveAction: z.string().trim().max(1000).optional(),
  refundAmount: z.number().min(0).optional(),
});
export type UpdateComplaintInput = z.infer<typeof updateComplaintSchema>;

export const createdComplaintDto = z.object({ id: z.string(), ref: z.string(), status: z.enum(["open", "escalated", "resolved"]) }).strict();
export type CreatedComplaintDto = z.infer<typeof createdComplaintDto>;

export const myComplaintDto = z
  .object({
    id: z.string(),
    ref: z.string(),
    title: z.string().nullable(),
    category: z.enum(COMPLAINT_CATEGORIES).nullable(),
    status: z.enum(["open", "escalated", "resolved"]),
    created_at: z.string(),
    corrective_action: z.string().nullable(),
  })
  .strict();
export type MyComplaintDto = z.infer<typeof myComplaintDto>;

export const complaintDto = myComplaintDto.extend({
  description: z.string().nullable(),
  severity: z.enum(["low", "medium", "high"]),
  owner: z.string().nullable(),
  root_cause: z.string().nullable(),
  service_involved: z.string().nullable(),
  refund_amount: z.number().nullable(),
});
export type ComplaintDto = z.infer<typeof complaintDto>;
