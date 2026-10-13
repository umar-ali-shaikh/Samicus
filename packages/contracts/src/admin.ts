/**
 * Admin domain contracts (trust & safety operations). Ported from routes/admin.js's inline
 * handlers and response shapes.
 */
import { z } from "zod";
import { complaintDto } from "./complaints.js";

export const decideVerificationSchema = z.object({ decision: z.enum(["approved", "sent_back"]), note: z.string().trim().max(500).optional() });
export type DecideVerificationInput = z.infer<typeof decideVerificationSchema>;

export const adminStatsDto = z
  .object({
    pendingVerification: z.number(),
    verifiedAdvocates: z.number(),
    pendingModeration: z.number(),
    openComplaints: z.number(),
    conflictFlags30d: z.number(),
    unassignedServiceOrders: z.number(),
  })
  .strict();
export type AdminStatsDto = z.infer<typeof adminStatsDto>;

export const usageDto = z.object({ callsSinceStart: z.record(z.string(), z.number()) }).strict();
export type UsageDto = z.infer<typeof usageDto>;

// Shared by /admin/complaints (trust & safety) and the founder's fcomplaints analytics tab --
// same payload shape (services/analytics/index.js's complaints()), ported from
// routes/admin.js's GET /admin/complaints (not routes/complaints.js, a different domain file).
export const complaintsReportDto = z
  .object({ kpis: z.array(z.object({ label: z.string(), value: z.number() }).strict()), complaints: z.array(complaintDto) })
  .strict();
export type ComplaintsReportDto = z.infer<typeof complaintsReportDto>;

const verificationCheckDto = z.object({ type: z.string(), status: z.string(), detail: z.string().nullable().optional(), note: z.string().optional() }).strict();

export const verificationCaseListItemDto = z
  .object({
    id: z.string(),
    checks: z.array(verificationCheckDto),
    decision: z.enum(["pending", "approved", "sent_back"]),
    created_at: z.string(),
    advocate: z
      .object({
        id: z.string(),
        bar_council: z.string(),
        enrolment_number: z.string(),
        enrolment_year: z.number().nullable(),
        city: z.string().nullable(),
        years_of_practice: z.number().nullable(),
        education: z.array(z.string()),
        verification_status: z.string(),
        user: z.object({ full_name: z.string(), email: z.string().nullable() }).strict().nullable(),
        advocate_practice_areas: z.array(z.object({ practice_area: z.object({ name: z.string() }).strict().nullable() }).strict()),
      })
      .strict(),
  })
  .strict();
export type VerificationCaseListItemDto = z.infer<typeof verificationCaseListItemDto>;

export const verificationCaseDto = z
  .object({
    id: z.string(),
    advocate_id: z.string(),
    checks: z.array(verificationCheckDto),
    decision: z.enum(["pending", "approved", "sent_back"]),
    decided_at: z.string().nullable(),
    reviewer_id: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();
export type VerificationCaseDto = z.infer<typeof verificationCaseDto>;
